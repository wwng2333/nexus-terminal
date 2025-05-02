<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, defineExpose, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';

import { useI18n } from 'vue-i18n';

import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store';
import { useTagsStore, TagInfo } from '../stores/tags.store';
import { useSessionStore } from '../stores/session.store'; 
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; 

// 定义事件
const emit = defineEmits([
  'connect-request',        // 左键单击 - 请求激活或替换当前标签
  // 'open-new-session',       // 中键单击 - 请求在新标签中打开 (已移除)
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

// --- 移除 RDP 模态框状态 ---
// const showRdpModal = ref(false);
// const selectedRdpConnection = ref<ConnectionInfo | null>(null);

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

// 处理单击连接 (左键/Enter) - 使用 session store 处理连接请求
const handleConnect = (connectionId: number, event?: MouseEvent | KeyboardEvent) => {
  if (event instanceof MouseEvent && event.button !== 0) {
    console.log(`[WkspConnList] DEBUG: handleConnect called with non-left click (button: ${event.button}). Ignoring.`);
    return;
  }

  const connection = connections.value.find(c => c.id === connectionId);
  if (!connection) {
    console.error(`[WkspConnList] Connection with ID ${connectionId} not found.`);
    return;
  }

  closeContextMenu(); // 关闭右键菜单

  if (connection.type === 'RDP') {
    console.log(`[WkspConnList] RDP connection clicked (ID: ${connectionId}). Calling sessionStore.openRdpModal.`);
    // --- 修改：调用 Store Action ---
    sessionStore.openRdpModal(connection);
  } else {
    console.log(`[WkspConnList] Non-RDP connection clicked (ID: ${connectionId}, Type: ${connection.type}). Emitting connect-request.`);
    // 对于非 RDP 连接，保持原有逻辑，发出事件给父组件处理
    emit('connect-request', connectionId);
  }
};

// --- 移除 closeRdpModal 方法 ---
// const closeRdpModal = () => {
//   showRdpModal.value = false;
//   selectedRdpConnection.value = null;
// };

// 显示右键菜单
const showContextMenu = (event: MouseEvent, connection: ConnectionInfo) => {
  console.log(`[WkspConnList] showContextMenu (右键) called for ID: ${connection.id}. Event:`, event);
  event.preventDefault(); // 再次确保阻止默认行为
  event.stopPropagation(); // 阻止事件冒泡
  event.stopImmediatePropagation(); // 尝试更强力地阻止事件链
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
const handleMenuAction = (action: 'add' | 'edit' | 'delete' | 'clone') => { // 添加 'clone' 类型
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
    } else if (action === 'clone') {
        // 调用 store 中的 cloneConnection 方法
        // 需要先生成新名称
        const allConnections = connectionsStore.connections;
        let newName = `${conn.name} (1)`;
        let counter = 1;
        const baseName = conn.name;
        const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escapedBaseName} \\((\\d+)\\)$`);

        while (allConnections.some(c => c.name === newName)) {
            counter++;
            newName = `${baseName} (${counter})`;
        }
        if (counter === 1 && allConnections.some(c => c.name === baseName)) {
           // 处理原始名称已存在的情况
        }

        connectionsStore.cloneConnection(conn.id, newName)
          .catch(error => {
              // 可以在这里处理克隆失败的特定 UI 反馈，如果需要的话
              console.error("Cloning failed in component:", error);
              // alert(t('connections.errors.cloneFailed', { error: connectionsStore.error || '未知错误' })); // store 中已有错误处理
          });
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

// 处理中键点击（在新标签页打开） - 功能已移除

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
  <div class="h-full flex flex-col overflow-hidden bg-background text-foreground">
    <!-- Loading State (Only show if loading AND no connections are available yet) -->
    <div v-if="(connectionsLoading || tagsLoading) && connections.length === 0" class="flex items-center justify-center h-full text-text-secondary">
      <i class="fas fa-spinner fa-spin mr-2"></i> {{ t('common.loading') }}
    </div>
    <div v-else-if="connectionsError || tagsError" class="flex items-center justify-center h-full text-error px-4 text-center">
      <i class="fas fa-exclamation-triangle mr-2"></i> {{ connectionsError || tagsError }}
    </div>

    <!-- Main Content Area -->
    <div v-else class="flex flex-col h-full">
      <!-- Search and Add Bar -->
      <div class="flex p-2 border-b border-border/50"> <!-- Reduced padding p-3 to p-2 -->
        <input
          type="text"
          v-model="searchTerm"
          :placeholder="t('workspaceConnectionList.searchPlaceholder')"
          ref="searchInputRef"
          class="flex-grow min-w-0 px-4 py-1.5 border border-border/50 rounded-lg bg-input text-foreground text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out"
          data-focus-id="connectionListSearch"
          @keydown="handleKeyDown"
          @blur="handleBlur"
        />
        <button
          class="ml-2 w-8 h-8 bg-primary text-white border-none rounded-lg text-sm font-semibold cursor-pointer shadow-md transition-colors duration-200 ease-in-out hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-70 flex-shrink-0 flex items-center justify-center" 
          @click="handleMenuAction('add')"
          :title="t('connections.addConnection')"
        >
          <i class="fas fa-plus text-white"></i>
        </button>
      </div>

      <!-- Connection List Area -->
      <div class="flex-grow overflow-y-auto p-2" ref="listAreaRef">
        <!-- No Results / No Connections State -->
        <div v-if="filteredAndGroupedConnections.length === 0 && connections.length > 0" class="p-6 text-center text-text-secondary">
           <i class="fas fa-search text-xl mb-2"></i>
           <p>{{ t('workspaceConnectionList.noResults') }} "{{ searchTerm }}"</p>
        </div>
        <div v-else-if="connections.length === 0" class="p-6 text-center text-text-secondary">
           <i class="fas fa-plug text-xl mb-2"></i>
           <p>{{ t('connections.noConnections') }}</p>
           <button
             class="mt-4 px-4 py-2 bg-primary text-white border-none rounded-lg text-sm font-semibold cursor-pointer shadow-md transition-colors duration-200 ease-in-out hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
             @click="handleMenuAction('add')"
           >
             {{ t('connections.addFirstConnection') }}
           </button>
        </div>

        <!-- Groups and Connections -->
        <div v-else>
          <div v-for="groupData in filteredAndGroupedConnections" :key="groupData.groupName" class="mb-1 last:mb-0">
            <!-- Group Header -->
            <div
              class="group px-3 py-2 font-semibold cursor-pointer flex items-center text-foreground rounded-md hover:bg-header/80 transition-colors duration-150"
              @click="toggleGroup(groupData.groupName)"
            >
              <i :class="['fas', expandedGroups[groupData.groupName] ? 'fa-chevron-down' : 'fa-chevron-right', 'mr-2 w-4 text-center text-text-secondary group-hover:text-foreground transition-transform duration-200 ease-in-out', {'transform rotate-0': !expandedGroups[groupData.groupName]}]"></i>
              <span class="text-sm">{{ groupData.groupName }}</span>
            </div>
            <!-- Connection Items List -->
            <ul v-show="expandedGroups[groupData.groupName]" class="list-none p-0 m-0 pl-3">
              <li
                v-for="conn in groupData.connections"
                :key="conn.id"
                class="group my-0.5 py-2 pr-3 pl-4 cursor-pointer flex items-center rounded-md whitespace-nowrap overflow-hidden text-ellipsis text-foreground hover:bg-primary/10 transition-colors duration-150"
                :class="{ 'bg-primary/20 text-white font-medium': conn.id === highlightedConnectionId }" 
                :data-conn-id="conn.id"
                @click.left="handleConnect(conn.id)"
                @click.right.prevent
                @contextmenu.prevent="showContextMenu($event, conn)"
              >
                <i :class="['fas', conn.type === 'RDP' ? 'fa-desktop' : 'fa-server', 'mr-2.5 w-4 text-center text-text-secondary group-hover:text-primary', { 'text-white': conn.id === highlightedConnectionId }]"></i>
                <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-grow text-sm" :title="conn.name || conn.host">
                  {{ conn.name || conn.host }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="fixed bg-background border border-border/50 shadow-xl rounded-lg py-1.5 z-50 min-w-[180px]"
      :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
      @click.stop
    >
      <ul class="list-none p-0 m-0">
        <li class="group px-4 py-1.5 cursor-pointer flex items-center text-foreground hover:bg-primary/10 hover:text-primary text-sm transition-colors duration-150 rounded-md mx-1" @click="handleMenuAction('add')">
            <i class="fas fa-plus mr-3 w-4 text-center text-text-secondary group-hover:text-primary"></i>
            <span>{{ t('connections.addConnection') }}</span>
        </li>
        <li v-if="contextTargetConnection" class="group px-4 py-1.5 cursor-pointer flex items-center text-foreground hover:bg-primary/10 hover:text-primary text-sm transition-colors duration-150 rounded-md mx-1" @click="handleMenuAction('edit')">
            <i class="fas fa-edit mr-3 w-4 text-center text-text-secondary group-hover:text-primary"></i>
            <span>{{ t('connections.actions.edit') }}</span>
        </li>
        <li v-if="contextTargetConnection" class="group px-4 py-1.5 cursor-pointer flex items-center text-foreground hover:bg-primary/10 hover:text-primary text-sm transition-colors duration-150 rounded-md mx-1" @click="handleMenuAction('clone')">
            <i class="fas fa-clone mr-3 w-4 text-center text-text-secondary group-hover:text-primary"></i>
            <span>{{ t('connections.actions.clone') }}</span>
        </li>
        <li v-if="contextTargetConnection" class="group px-4 py-1.5 cursor-pointer flex items-center text-error hover:bg-error/10 text-sm transition-colors duration-150 rounded-md mx-1" @click="handleMenuAction('delete')">
            <i class="fas fa-trash-alt mr-3 w-4 text-center text-error/80 group-hover:text-error"></i>
            <span>{{ t('connections.actions.delete') }}</span>
        </li>
      </ul>
    </div>

    <!-- --- 移除 RDP Modal 渲染 --- -->
    <!-- <RemoteDesktopModal
      v-if="showRdpModal"
      :connection="selectedRdpConnection"
      @close="closeRdpModal"
    /> -->
  </div>
</template>

<!-- Scoped styles removed, now using Tailwind utility classes -->
