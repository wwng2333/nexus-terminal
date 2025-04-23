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

// 获取数据的 onMounted 调用已移至新的 onMounted 逻辑中

// +++ 注册/注销自定义聚焦动作 +++
let unregisterFocusAction: (() => void) | null = null; // 用于存储注销函数

onMounted(() => {
  // 调用新的 registerFocusAction 并存储返回的注销函数
  // focusSearchInput 返回 boolean，符合 () => boolean | Promise<boolean | undefined> 类型
  unregisterFocusAction = focusSwitcherStore.registerFocusAction('connectionListSearch', focusSearchInput);
  connectionsStore.fetchConnections(); // 移到 onMounted
  tagsStore.fetchTags(); // 移到 onMounted
});

onBeforeUnmount(() => {
  // 调用存储的注销函数
  if (unregisterFocusAction) {
    unregisterFocusAction();
    console.log(`[WkspConnList] Unregistered focus action on unmount.`);
  }
  unregisterFocusAction = null;
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
  <div class="h-full flex flex-col overflow-hidden bg-background text-sm text-foreground">
    <div v-if="connectionsLoading || tagsLoading" class="p-4 text-center text-text-secondary">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="connectionsError || tagsError" class="p-4 text-center text-red-600">
      {{ connectionsError || tagsError }}
    </div>

    <!-- 搜索和添加栏 -->
    <div class="flex p-2 border-b border-border bg-header">
      <input
        type="text"
        v-model="searchTerm"
        :placeholder="t('workspaceConnectionList.searchPlaceholder')"
        ref="searchInputRef"
        class="flex-grow min-w-0 px-3 py-1.5 border border-border rounded-l-md text-sm outline-none bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors duration-150"
        data-focus-id="connectionListSearch"
        @keydown="handleKeyDown"
        @blur="handleBlur"
      />
      <button
        class="px-3 py-1.5 border border-border border-l-0 bg-background cursor-pointer rounded-r-md text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150"
        @click="handleMenuAction('add')"
        :title="t('connections.addConnection')"
      >
        <i class="fas fa-plus"></i>
      </button>
    </div>

    <!-- 连接列表区域 -->
    <div class="flex-grow overflow-y-auto" ref="listAreaRef">
      <div v-if="connectionsLoading || tagsLoading" class="p-4 text-center text-text-secondary">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="connectionsError || tagsError" class="p-4 text-center text-red-600">
        {{ connectionsError || tagsError }}
      </div>
      <div v-else-if="filteredAndGroupedConnections.length === 0 && connections.length > 0" class="p-4 text-center text-text-secondary">
         {{ t('workspaceConnectionList.noResults') }} "{{ searchTerm }}"
      </div>
      <div v-else-if="connections.length === 0" class="p-4 text-center text-text-secondary">
         {{ t('connections.noConnections') }}
      </div>
      <div v-else>
        <!-- 循环分组 -->
        <div v-for="groupData in filteredAndGroupedConnections" :key="groupData.groupName" class="mb-0 last:mb-0">
          <div class="group px-3 py-2 font-semibold cursor-pointer bg-header border-t border-b border-border flex items-center text-foreground hover:bg-border transition-colors duration-150" @click="toggleGroup(groupData.groupName)">
            <i :class="['fas', expandedGroups[groupData.groupName] ? 'fa-chevron-down' : 'fa-chevron-right', 'mr-2 w-4 text-center text-text-secondary group-hover:text-foreground transition-transform duration-200 ease-in-out']"></i>
            <span>{{ groupData.groupName }}</span>
          </div>
          <!-- 连接项列表 -->
          <ul v-show="expandedGroups[groupData.groupName]" class="list-none p-0 m-0">
            <li
              v-for="conn in groupData.connections"
              :key="conn.id"
              class="group py-2 pr-4 pl-6 cursor-pointer flex items-center border-b border-border whitespace-nowrap overflow-hidden text-ellipsis text-foreground hover:bg-header/50 transition-colors duration-150"
              :class="{ 'bg-primary/10 text-primary': conn.id === highlightedConnectionId }"
              :data-conn-id="conn.id"
              @click.left="handleConnect(conn.id)"
              @contextmenu.prevent="showContextMenu($event, conn)"
            >
              <i class="fas fa-server mr-2.5 w-4 text-center text-text-secondary group-hover:text-foreground" :class="{ 'text-primary': conn.id === highlightedConnectionId }"></i>
              <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-grow" :title="conn.name || conn.host">
                {{ conn.name || conn.host }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="fixed bg-background border border-border shadow-lg rounded-md py-1 z-50 min-w-[160px]"
      :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
      @click.stop
    >
      <!-- 防止点击菜单内部关闭菜单 -->
      <ul class="list-none p-0 m-0">
        <li class="group px-4 py-1.5 cursor-pointer flex items-center text-foreground hover:bg-header text-sm transition-colors duration-150" @click="handleMenuAction('add')">
            <i class="fas fa-plus mr-3 w-4 text-center text-text-secondary group-hover:text-foreground"></i>
            <span>{{ t('connections.addConnection') }}</span>
        </li>
        <li v-if="contextTargetConnection" class="group px-4 py-1.5 cursor-pointer flex items-center text-foreground hover:bg-header text-sm transition-colors duration-150" @click="handleMenuAction('edit')">
            <i class="fas fa-edit mr-3 w-4 text-center text-text-secondary group-hover:text-foreground"></i>
            <span>{{ t('connections.actions.edit') }}</span>
        </li>
        <li v-if="contextTargetConnection" class="group px-4 py-1.5 cursor-pointer flex items-center text-red-600 hover:bg-red-500/10 text-sm transition-colors duration-150" @click="handleMenuAction('delete')">
            <i class="fas fa-trash-alt mr-3 w-4 text-center text-red-500 group-hover:text-red-600"></i>
            <span>{{ t('connections.actions.delete') }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<!-- Scoped styles removed, now using Tailwind utility classes -->
