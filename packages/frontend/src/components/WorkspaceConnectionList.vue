<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, defineExpose, watch, nextTick } from 'vue'; // 确保 ref, defineExpose, onBeforeUnmount, watch, nextTick 已导入
import { storeToRefs } from 'pinia';
// import { useRouter } from 'vue-router'; // 不再需要 router
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store';
import { useTagsStore, TagInfo } from '../stores/tags.store';
import { useSessionStore } from '../stores/session.store'; // 导入 session store
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++

// 定义事件
const emit = defineEmits([
  'connect-request',        // 左键单击 - 请求激活或替换当前标签
  'open-new-session',       // 中键单击 - 请求在新标签中打开
  'request-add-connection', // 右键菜单 - 添加
  'request-edit-connection' // 右键菜单 - 编辑
]);

const { t } = useI18n();
// const router = useRouter(); // 不再需要
const connectionsStore = useConnectionsStore();
const tagsStore = useTagsStore();
const sessionStore = useSessionStore(); // 获取 session store 实例
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++

const { connections, isLoading: connectionsLoading, error: connectionsError } = storeToRefs(connectionsStore);
const { tags, isLoading: tagsLoading, error: tagsError } = storeToRefs(tagsStore);

// 搜索词
const searchTerm = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null); // 新增：搜索输入框的 ref

// 右键菜单状态
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextTargetConnection = ref<ConnectionInfo | null>(null);

// 分组展开状态
const expandedGroups = ref<Record<string, boolean>>({}); // 使用 Record<string, boolean>

// 键盘导航状态
const highlightedIndex = ref(-1); // -1 表示没有高亮项
const listAreaRef = ref<HTMLElement | null>(null); // 列表容器的 ref

// 计算属性：扁平化的、当前可见的连接列表（用于键盘导航）
const flatVisibleConnections = computed(() => {
  const flatList: ConnectionInfo[] = [];
  filteredAndGroupedConnections.value.forEach(group => {
    // 只添加展开分组中的连接
    if (expandedGroups.value[group.groupName]) {
      flatList.push(...group.connections);
    }
  });
  return flatList;
});

// 计算属性：当前高亮连接的 ID
const highlightedConnectionId = computed(() => {
  if (highlightedIndex.value >= 0 && highlightedIndex.value < flatVisibleConnections.value.length) {
    return flatVisibleConnections.value[highlightedIndex.value].id;
  }
  return null;
});


// 计算属性：过滤并按标签分组连接
const filteredAndGroupedConnections = computed(() => {
  const groups: Record<string, ConnectionInfo[]> = {};
  const untagged: ConnectionInfo[] = [];
  const tagMap = new Map(tags.value.map(tag => [tag.id, tag]));
  const lowerSearchTerm = searchTerm.value.toLowerCase();

  // 1. 过滤连接
  const filteredConnections = connections.value.filter(conn => {
    const nameMatch = conn.name && conn.name.toLowerCase().includes(lowerSearchTerm);
    const hostMatch = conn.host.toLowerCase().includes(lowerSearchTerm);
    // 如果有 IP 地址字段，也应包含在此处
    // const ipMatch = conn.ipAddress && conn.ipAddress.toLowerCase().includes(lowerSearchTerm);
    return nameMatch || hostMatch; // || ipMatch;
  });

  // 2. 分组过滤后的连接
  filteredConnections.forEach(conn => {
    if (conn.tag_ids && conn.tag_ids.length > 0) {
      let tagged = false; // 标记是否至少加入了一个分组
      conn.tag_ids.forEach(tagId => {
        const tag = tagMap.get(tagId);
        // 确保标签存在才分组
        if (tag) {
          const groupName = tag.name;
          if (!groups[groupName]) {
            groups[groupName] = [];
            if (expandedGroups.value[groupName] === undefined) {
               expandedGroups.value[groupName] = true; // 默认展开
            }
          }
          // 避免重复添加（如果一个连接有多个标签）
          if (!groups[groupName].some(c => c.id === conn.id)) {
              groups[groupName].push(conn);
          }
          tagged = true;
        }
      });
      // 如果所有标签都无效或未找到，则归入未标记
      if (!tagged) {
          untagged.push(conn);
      }
    } else {
      untagged.push(conn);
    }
  });

  // 3. 排序和格式化输出
  for (const groupName in groups) {
      groups[groupName].sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));
  }
  untagged.sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));

  const sortedGroupNames = Object.keys(groups).sort();
  const result: { groupName: string; connections: ConnectionInfo[] }[] = sortedGroupNames.map(name => ({
      groupName: name,
      connections: groups[name]
  }));

  if (untagged.length > 0) {
      const untaggedGroupName = t('workspaceConnectionList.untagged');
      if (expandedGroups.value[untaggedGroupName] === undefined) {
          expandedGroups.value[untaggedGroupName] = true; // 默认展开
      }
      result.push({ groupName: untaggedGroupName, connections: untagged });
  }

  return result;
  });
  
  // 监听搜索词变化，重置高亮索引
  watch(searchTerm, () => {
    highlightedIndex.value = -1;
  });
  
  // 监听分组展开状态变化，重置高亮索引
  watch(expandedGroups, () => {
      highlightedIndex.value = -1;
  }, { deep: true });
  
  
  // 切换分组展开/折叠
const toggleGroup = (groupName: string) => {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName];
};

// 处理单击连接 (左键) - 使用 session store 处理连接请求
const handleConnect = (connectionId: number) => {
  console.log(`[WkspConnList] handleConnect (左键) called for ID: ${connectionId}. Emitting event.`);
  // 移除对 sessionStore 的直接调用，由父组件处理
  // sessionStore.handleConnectRequest(connectionId);
  emit('connect-request', connectionId); // 发出事件通知父组件
  closeContextMenu(); // 点击连接后关闭菜单
};

// 显示右键菜单
const showContextMenu = (event: MouseEvent, connection: ConnectionInfo) => {
  console.log(`[WkspConnList] showContextMenu (右键) called for ID: ${connection.id}. Event:`, event);
  event.preventDefault(); // 再次确保阻止默认行为
  event.stopPropagation(); // 阻止事件冒泡
  console.log('[WkspConnList] Right-click default prevented and propagation stopped.');
  contextTargetConnection.value = connection;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
  // 添加全局点击监听器以关闭菜单
  document.addEventListener('click', closeContextMenu, { once: true });
  return false; // 彻底停止事件处理
};

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false;
  contextTargetConnection.value = null;
  document.removeEventListener('click', closeContextMenu);
};

// 处理右键菜单操作
const handleMenuAction = (action: 'add' | 'edit' | 'delete') => {
  const conn = contextTargetConnection.value;
  closeContextMenu(); // 先关闭菜单

  if (action === 'add') {
    console.log('[WorkspaceConnectionList] handleMenuAction called with action: add. Emitting request-add-connection...'); // 添加日志
    // router.push('/connections/add'); // 改为触发事件
    emit('request-add-connection');
  } else if (conn) {
    if (action === 'edit') {
      // router.push(`/connections/edit/${conn.id}`); // 改为触发事件
      emit('request-edit-connection', conn); // 传递整个连接对象
    } else if (action === 'delete') {
      if (confirm(t('connections.prompts.confirmDelete', { name: conn.name || conn.host }))) {
        connectionsStore.deleteConnection(conn.id);
        // 注意：删除后列表会自动更新，因为 store 是响应式的
      }
    }
  }
};

 // 稍微延迟一下重置，以防是点击列表项导致的失焦
 // 如果用户点击了列表项，handleConnect 会先触发
 setTimeout(() => {
     // 检查此时是否仍然没有焦点在输入框上（避免误清除）
     if (document.activeElement !== searchInputRef.value) {
         highlightedIndex.value = -1;
     }
 }, 150); // 150ms 延迟可能更稳妥
// 处理失焦事件，清除高亮
const handleBlur = () => {
  // 稍微延迟一下重置，以防是点击列表项导致的失焦
  // 如果用户点击了列表项，handleConnect 会先触发
  setTimeout(() => {
      // 检查此时是否仍然没有焦点在输入框上（避免误清除）
      if (document.activeElement !== searchInputRef.value) {
          highlightedIndex.value = -1;
      }
  }, 150); // 150ms 延迟可能更稳妥
};

// 获取数据
onMounted(() => {
  connectionsStore.fetchConnections();
  tagsStore.fetchTags();
});

// +++ 注册/注销自定义聚焦动作 +++
onMounted(() => {
  focusSwitcherStore.registerFocusAction('connectionListSearch', focusSearchInput);
});
onBeforeUnmount(() => {
  focusSwitcherStore.unregisterFocusAction('connectionListSearch');
});

// 处理中键点击（在新标签页打开）
const handleOpenInNewTab = (connectionId: number) => {
  console.log(`[WkspConnList] handleOpenInNewTab (中键/辅助键) called for ID: ${connectionId}`);
  emit('open-new-session', connectionId);
  console.log(`[WkspConnList] Emitted 'open-new-session' for ID: ${connectionId}`);
  closeContextMenu(); // 如果右键菜单是打开的，也关闭它
  return false; // 尝试显式阻止进一步处理
};

// 新增：暴露聚焦搜索框的方法
const focusSearchInput = (): boolean => {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
    return true; // 聚焦成功
  }
  return false; // 聚焦失败
};
defineExpose({ focusSearchInput });

// --- 键盘导航和确认 ---

const handleKeyDown = (event: KeyboardEvent) => {
  const list = flatVisibleConnections.value;
  if (!list.length) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault(); // 阻止光标移动
      highlightedIndex.value = (highlightedIndex.value + 1) % list.length;
      scrollToHighlighted();
      break;
    case 'ArrowUp':
      event.preventDefault(); // 阻止光标移动
      highlightedIndex.value = (highlightedIndex.value - 1 + list.length) % list.length;
      scrollToHighlighted();
      break;
    case 'Enter':
      event.preventDefault(); // 阻止可能的表单提交
      if (highlightedConnectionId.value !== null) {
        handleConnect(highlightedConnectionId.value);
      }
      break;
  }
};

// 滚动到高亮项
const scrollToHighlighted = async () => {
  await nextTick(); // 等待 DOM 更新
  if (!listAreaRef.value || highlightedConnectionId.value === null) return;

  const highlightedElement = listAreaRef.value.querySelector(`.connection-item[data-conn-id="${highlightedConnectionId.value}"]`);
  if (highlightedElement) {
    highlightedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
};
</script>

<template>
  <div class="workspace-connection-list">
    <div v-if="connectionsLoading || tagsLoading" class="loading">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="connectionsError || tagsError" class="error">
      {{ connectionsError || tagsError }}
    </div>

    <!-- 搜索和添加栏 -->
    <div class="search-add-bar">
      <input
        type="text"
        v-model="searchTerm"
        :placeholder="t('workspaceConnectionList.searchPlaceholder')"
        ref="searchInputRef"
        class="search-input"
        data-focus-id="connectionListSearch"
        @keydown="handleKeyDown"
        @blur="handleBlur"
      />
      <button
        class="add-button"
        @click="handleMenuAction('add')"
        :title="t('connections.addConnection')"
      >
        <i class="fas fa-plus"></i>
      </button>
    </div>

    <!-- 连接列表区域 -->
    <div class="connection-list-area" ref="listAreaRef">
      <div v-if="connectionsLoading || tagsLoading" class="loading">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="connectionsError || tagsError" class="error">
        {{ connectionsError || tagsError }}
      </div>
      <div v-else-if="filteredAndGroupedConnections.length === 0 && connections.length > 0" class="no-results">
         {{ t('workspaceConnectionList.noResults') }} "{{ searchTerm }}"
      </div>
      <div v-else-if="connections.length === 0" class="no-connections">
         {{ t('connections.noConnections') }}
      </div>
      <div v-else>
        <!-- 修正: 循环 filteredAndGroupedConnections -->
        <div v-for="groupData in filteredAndGroupedConnections" :key="groupData.groupName" class="connection-group">
          <div class="group-header" @click="toggleGroup(groupData.groupName)">
            <i :class="['fas', expandedGroups[groupData.groupName] ? 'fa-chevron-down' : 'fa-chevron-right']"></i>
            <span>{{ groupData.groupName }}</span>
          </div>
          <!-- 修正: 使用 groupData.groupName 和 groupData.connections -->
          <ul v-show="expandedGroups[groupData.groupName]" class="connection-items">
            <li
              v-for="conn in groupData.connections"
              :key="conn.id"
              class="connection-item"
              :class="{ 'highlighted': conn.id === highlightedConnectionId }"
              :data-conn-id="conn.id"
              @click.left="handleConnect(conn.id)"
              @contextmenu.prevent="showContextMenu($event, conn)"
              @mouseenter="highlightedIndex = flatVisibleConnections.findIndex(c => c.id === conn.id)"
            >
              <i class="fas fa-server connection-icon"></i>
              <span class="connection-name" :title="conn.name || conn.host">
                {{ conn.name || conn.host }}
              </span>
            </li>
          </ul>
        </div>
        <!-- 移除重复的 ul 块 -->
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
      @click.stop
    >
      <!-- 防止点击菜单内部关闭菜单 -->
      <ul>
        <li @click="handleMenuAction('add')"><i class="fas fa-plus"></i> {{ t('connections.addConnection') }}</li>
        <li v-if="contextTargetConnection" @click="handleMenuAction('edit')"><i class="fas fa-edit"></i> {{ t('connections.actions.edit') }}</li>
        <li v-if="contextTargetConnection" @click="handleMenuAction('delete')"><i class="fas fa-trash-alt"></i> {{ t('connections.actions.delete') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.workspace-connection-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内部滚动条影响布局 */
  background-color: var(--app-bg-color); /* Use theme variable */
  font-size: 0.9em;
}

.search-add-bar {
  display: flex;
  padding: var(--base-margin); /* Use theme variable */
  border-bottom: 1px solid var(--border-color); /* Use theme variable */
  background-color: var(--header-bg-color); /* Use theme variable */
}

.search-input {
  min-width: 8px;
  flex-grow: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-color); /* Use theme variable */
  border-radius: 4px 0 0 4px; /* 左侧圆角 */
  font-size: 0.9em;
  outline: none;
  background-color: var(--app-bg-color); /* Use theme variable */
  color: var(--text-color); /* Use theme variable */
}
.search-input:focus {
  border-color: var(--button-bg-color); /* Use theme variable */
  box-shadow: 0 0 5px var(--button-bg-color, #007bff); /* Use theme variable for glow */
}

.add-button {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border-color); /* Use theme variable */
  border-left: none; /* 移除左边框，与输入框合并 */
  background-color: var(--app-bg-color); /* Use theme variable */
  cursor: pointer;
  border-radius: 0 4px 4px 0; /* 右侧圆角 */
  color: var(--text-color); /* Use theme variable */
}
.add-button:hover {
  background-color: var(--header-bg-color); /* Use theme variable */
}
.add-button i {
  font-size: 1em; /* 图标大小 */
}

.connection-list-area {
  flex-grow: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 列表内容滚动 */
}


.loading, .error, .no-connections, .no-results {
  padding: var(--base-padding); /* Use theme variable */
  text-align: center;
  color: var(--text-color-secondary); /* Use theme variable */
}
.error {
    color: #dc3545;
}
.no-connections button {
    margin-top: 0.5rem;
    padding: 0.3rem 0.6rem;
}

.add-connection-button {
    display: block;
    width: calc(100% - 2 * var(--base-margin)); /* Use theme variable */
    margin: var(--base-margin); /* Use theme variable */
    padding: var(--base-margin); /* Use theme variable */
    text-align: left;
    background-color: var(--header-bg-color); /* Use theme variable */
    border: 1px solid var(--border-color); /* Use theme variable */
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    color: var(--text-color); /* Use theme variable */
}
.add-connection-button:hover {
    background-color: var(--header-bg-color); /* Use theme variable (or darker variant) */
    filter: brightness(0.95); /* Example: slightly darken */
}
.add-connection-button i {
    margin-right: 0.5rem;
}


.connection-group {
  margin-bottom: 0.5rem;
}

.group-header {
  padding: 0.4rem 0.8rem;
  font-weight: bold;
  cursor: pointer;
  background-color: var(--header-bg-color); /* Use theme variable */
  border-top: 1px solid var(--border-color); /* Use theme variable */
  border-bottom: 1px solid var(--border-color); /* Use theme variable */
  display: flex;
  align-items: center;
  color: var(--text-color); /* Use theme variable */
}
.group-header:hover {
    background-color: var(--header-bg-color); /* Use theme variable */
    filter: brightness(0.95); /* Example: slightly darken on hover */
}

.group-header i {
  margin-right: 0.5rem;
  width: 1em; /* Ensure icon takes space */
  text-align: center;
  transition: transform 0.2s ease-in-out;
}



.connection-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.connection-item {
  padding: 0.5rem 1rem 0.5rem 1.5rem; /* Indent items */
  cursor: pointer;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color); /* Use theme variable */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color); /* Use theme variable */
}

.connection-item:hover {
  background-color: var(--header-bg-color); /* Use theme variable */
}

/* 新增高亮样式 */
.connection-item.highlighted {
  background-color: var(--button-hover-bg-color); /* Use theme variable */
  color: var(--button-text-color); /* Use theme variable */
}
.connection-item.highlighted .connection-icon {
    color: var(--button-text-color); /* Use theme variable */
}


.connection-icon {
  margin-right: 0.6rem;
  color: var(--text-color-secondary); /* Use theme variable */
  width: 1em;
  text-align: center;
}

.connection-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-grow: 1;
}

/* Context Menu Styles */
.context-menu {
  position: fixed;
  background-color: var(--app-bg-color); /* Use theme variable */
  border: 1px solid var(--border-color); /* Use theme variable */
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15); /* Keep shadow or define variable */
  border-radius: 4px;
  padding: var(--base-margin) 0; /* Use theme variable */
  z-index: 1001; /* Above the list */
  min-width: 150px;
}

.context-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.context-menu li {
  padding: 0.5rem 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--text-color); /* Use theme variable */
}
.context-menu li:hover {
  background-color: var(--header-bg-color); /* Use theme variable */
}
.context-menu li i {
    margin-right: 0.75rem;
    width: 1em;
    text-align: center;
    color: var(--text-color); /* Use theme variable */
}
</style>
