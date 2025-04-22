<script setup lang="ts">
import { computed, defineAsyncComponent, type PropType, type Component, ref, watch, onMounted } from 'vue'; // +++ Add onMounted +++
import { useI18n } from 'vue-i18n'; // <-- Import useI18n
// 添加依赖 font-awesome
import '@fortawesome/fontawesome-free/css/all.min.css';
import { Splitpanes, Pane } from 'splitpanes';
import { useLayoutStore, type LayoutNode, type PaneName } from '../stores/layout.store';
import { useSessionStore } from '../stores/session.store';
import { useFileEditorStore } from '../stores/fileEditor.store'; // <-- Import FileEditorStore
import { useSettingsStore } from '../stores/settings.store'; // +++ Import SettingsStore +++
import { useSidebarResize } from '../composables/useSidebarResize'; // +++ Import useSidebarResize +++
import { storeToRefs } from 'pinia';
import { defineEmits } from 'vue';

// --- Props ---
const props = defineProps({
  layoutNode: {
    type: Object as PropType<LayoutNode>,
    required: true,
  },
  // 新增：标识是否为顶层渲染器
  isRootRenderer: {
    type: Boolean,
    default: false,
  },
  // 传递必要的上下文数据，避免在递归中重复获取
  activeSessionId: {
    type: String as PropType<string | null>,
    required: false, // 改为非必需
    default: null,   // 提供默认值 null
  },
  // *** 新增：接收编辑器相关 props ***
  editorTabs: {
    type: Array as PropType<any[]>, // 使用 any[] 简化，或导入具体类型
    default: () => [],
  },
  activeEditorTabId: {
    type: String as PropType<string | null>,
    default: null,
  },
  // Removed terminalManager prop definition
});

// --- Emits ---
// *** 新增：声明所有需要转发的事件 (使用对象语法) ***
const emit = defineEmits({
  'sendCommand': null, // (command: string) - No validation needed here for now
  'terminalInput': null, // (payload: { sessionId: string; data: string })
  'terminalResize': null, // (payload: { sessionId: string; dims: { cols: number; rows: number } })
  'closeEditorTab': null, // (tabId: string)
  'activateEditorTab': null, // (tabId: string)
  'updateEditorContent': null, // (payload: { tabId: string; content: string })
  'saveEditorTab': null, // (tabId: string)
  'connect-request': null, // (id: number)
  'open-new-session': null, // (id: number)
  'request-add-connection': null, // ()
  'request-edit-connection': null, // (conn: any)
  // *** 修正：更新 terminal-ready 事件的 payload 类型 ***
  'terminal-ready': (payload: { sessionId: string; terminal: any }) => // 使用 any 简化类型检查，或导入 Terminal
    typeof payload === 'object' && typeof payload.sessionId === 'string' && typeof payload.terminal === 'object',
  // *** 新增：声明搜索相关事件 ***
  'search': null, // (searchTerm: string)
  'find-next': null, // ()
  'find-previous': null, // ()
  'close-search': null, // ()
});

// --- Setup ---
const layoutStore = useLayoutStore();
const sessionStore = useSessionStore();
const fileEditorStore = useFileEditorStore(); // <-- Initialize FileEditorStore
const settingsStore = useSettingsStore(); // +++ Initialize SettingsStore +++
const { t } = useI18n(); // <-- Get translation function
const { activeSession } = storeToRefs(sessionStore);
const { workspaceSidebarPersistentBoolean, getSidebarPaneWidth } = storeToRefs(settingsStore); // +++ Get sidebar setting and width getter +++
const { sidebarPanes } = storeToRefs(layoutStore);
const { orderedTabs: editorTabsFromStore, activeTabId: activeEditorTabIdFromStore } = storeToRefs(fileEditorStore); // <-- Get editor state

// --- Sidebar State ---
const activeLeftSidebarPane = ref<PaneName | null>(null);
const activeRightSidebarPane = ref<PaneName | null>(null);
const leftSidebarPanelRef = ref<HTMLElement | null>(null); // +++ Ref for left panel +++
const rightSidebarPanelRef = ref<HTMLElement | null>(null); // +++ Ref for right panel +++
const leftResizeHandleRef = ref<HTMLElement | null>(null); // +++ Ref for left handle +++
const rightResizeHandleRef = ref<HTMLElement | null>(null); // +++ Ref for right handle +++

// --- Component Mapping ---
// 使用 defineAsyncComponent 优化加载，并映射 PaneName 到实际组件
const componentMap: Record<PaneName, Component> = {
  connections: defineAsyncComponent(() => import('./WorkspaceConnectionList.vue')),
  terminal: defineAsyncComponent(() => import('./Terminal.vue')),
  commandBar: defineAsyncComponent(() => import('./CommandInputBar.vue')),
  fileManager: defineAsyncComponent(() => import('./FileManager.vue')),
  editor: defineAsyncComponent(() => import('./FileEditorContainer.vue')),
  statusMonitor: defineAsyncComponent(() => import('./StatusMonitor.vue')),
  commandHistory: defineAsyncComponent(() => import('../views/CommandHistoryView.vue')),
  quickCommands: defineAsyncComponent(() => import('../views/QuickCommandsView.vue')),
  dockerManager: defineAsyncComponent(() => import('./DockerManager.vue')), // <--- 添加 dockerManager 映射
};

// --- Computed ---
// 获取当前节点对应的组件实例 (用于主布局)
const currentMainComponent = computed(() => {
  if (props.layoutNode.type === 'pane' && props.layoutNode.component) {
    return componentMap[props.layoutNode.component] || null;
  }
  return null;
});

// 获取当前激活的左侧侧栏组件实例
const currentLeftSidebarComponent = computed(() => {
  return activeLeftSidebarPane.value ? componentMap[activeLeftSidebarPane.value] : null;
});

// 获取当前激活的右侧侧栏组件实例
const currentRightSidebarComponent = computed(() => {
  return activeRightSidebarPane.value ? componentMap[activeRightSidebarPane.value] : null;
});

// 面板标签 (Similar to LayoutConfigurator)
const paneLabels = computed(() => ({
  connections: t('layout.pane.connections', '连接列表'),
  terminal: t('layout.pane.terminal', '终端'),
  commandBar: t('layout.pane.commandBar', '命令栏'),
  fileManager: t('layout.pane.fileManager', '文件管理器'),
  editor: t('layout.pane.editor', '编辑器'),
  statusMonitor: t('layout.pane.statusMonitor', '状态监视器'),
  commandHistory: t('layout.pane.commandHistory', '命令历史'),
  quickCommands: t('layout.pane.quickCommands', '快捷指令'),
  dockerManager: t('layout.pane.dockerManager', 'Docker 管理器'),
}));


// 为特定组件计算需要传递的 Props (主布局)
// 注意：这是一个简化示例，实际可能需要更复杂的逻辑来传递正确的 props
const componentProps = computed(() => {
  const componentName = props.layoutNode.component;
  const currentActiveSession = activeSession.value; // 获取当前活动会话

  if (!componentName) return {};

  switch (componentName) {
    // --- 为需要转发事件的组件添加事件绑定 ---
    case 'terminal':
      // Terminal 需要 sessionId, isActive, 并转发 ready, data, resize 事件
      // 确保 sessionId 始终为字符串
      return {
        sessionId: props.activeSessionId ?? '', // 如果 activeSessionId 为 null，则传递空字符串
        isActive: true,
        // *** 添加日志并修正事件处理 ***
        onReady: (payload: { sessionId: string; terminal: any }) => {
          console.log(`[LayoutRenderer ${props.activeSessionId}] 收到内部 Terminal 的 'ready' 事件:`, payload); // 添加日志
          emit('terminal-ready', payload); // 直接转发收到的 payload
        },
        onData: (data: string) => emit('terminalInput', { sessionId: props.activeSessionId ?? '', data }), // 包装成 payload，确保 sessionId 不为 null
        onResize: (dims: { cols: number; rows: number }) => emit('terminalResize', { sessionId: props.activeSessionId ?? '', dims }), // 包装成 payload，确保 sessionId 不为 null
      };
      // --- 添加日志：确认 onReady 是否在 props 中 ---
      console.log(`[LayoutRenderer ${props.activeSessionId}] Terminal componentProps 计算完成，包含 onReady。`);
      // -----------------------------------------
    case 'fileManager':
      // 仅当有活动会话时才返回实际 props，否则返回空对象
      if (!currentActiveSession) return {};
      // 传递 instanceId (使用布局节点的 ID), sessionId, dbConnectionId
      // 移除 sftpManager 和 wsDeps
      return {
         sessionId: props.activeSessionId ?? '', // 确保 sessionId 不为 null
         instanceId: props.layoutNode.id, // 使用布局节点 ID 作为实例 ID
         dbConnectionId: currentActiveSession.connectionId,
         // sftpManager: currentActiveSession.sftpManager, // 移除 sftpManager，因为它现在由 FileManager 内部管理
         wsDeps: { // 恢复 wsDeps
           sendMessage: currentActiveSession.wsManager.sendMessage,
           onMessage: currentActiveSession.wsManager.onMessage,
           isConnected: currentActiveSession.wsManager.isConnected, // 恢复 isConnected
           isSftpReady: currentActiveSession.wsManager.isSftpReady // 恢复 isSftpReady
         },
         class: 'pane-content', // class 可以保留，或者在模板中处理
         // FileManager 可能也需要转发事件，例如文件操作相关的，暂时省略
      };
    case 'statusMonitor':
       // 仅当有活动会话时才返回实际 props，否则返回空对象
       if (!currentActiveSession) return {};
       return {
         sessionId: props.activeSessionId ?? '', // 确保 sessionId 不为 null
         serverStatus: currentActiveSession.statusMonitorManager.serverStatus.value, // 此时 currentActiveSession 必不为 null
         statusError: currentActiveSession.statusMonitorManager.statusError.value, // 此时 currentActiveSession 必不为 null
         class: 'pane-content',
       };
    case 'editor':
      // FileEditorContainer 需要 tabs, activeTabId, sessionId, 并转发事件
      return {
        tabs: props.editorTabs, // 从 WorkspaceView 传入
        activeTabId: props.activeEditorTabId, // 从 WorkspaceView 传入
        sessionId: props.activeSessionId,
        class: 'pane-content',
        // 绑定内部处理器以转发事件 (恢复正确的编辑器事件)
        onCloseTab: (tabId: string) => emit('closeEditorTab', tabId),
        onActivateTab: (tabId: string) => emit('activateEditorTab', tabId),
        'onUpdate:content': (payload: { tabId: string; content: string }) => emit('updateEditorContent', payload), // 注意事件名
        onRequestSave: (tabId: string) => emit('saveEditorTab', tabId),
      };
    case 'commandBar':
       // CommandInputBar 需要转发 send-command 事件
       // searchResultCount 和 currentSearchResultIndex 将在模板中直接从 terminalManager 绑定
       return {
         class: 'pane-content',
         onSendCommand: (command: string) => emit('sendCommand', command),
         // 转发搜索事件
         onSearch: (term: string) => emit('search', term),
         onFindNext: () => emit('find-next'),
         onFindPrevious: () => emit('find-previous'),
         onCloseSearch: () => emit('close-search'),
       };
    case 'connections':
       // WorkspaceConnectionList 需要转发 connect-request 等事件
       return {
         class: 'pane-content',
         // 绑定内部处理器以转发事件 (除了 request-add-connection)
         onConnectRequest: (id: number) => emit('connect-request', id),
         onOpenNewSession: (id: number) => emit('open-new-session', id),
         // onRequestAddConnection: () => { ... }, // 移除，将在模板中处理
         onRequestEditConnection: (conn: any) => emit('request-edit-connection', conn),
       };
    case 'commandHistory':
    case 'quickCommands':
       // 这两个视图需要转发 execute-command 事件
       return {
         class: 'pane-content',
         onExecuteCommand: (command: string) => emit('sendCommand', command), // 复用 sendCommand 事件
       };
   case 'dockerManager':
     // DockerManager 可能不需要 session 信息，但需要转发事件
     return {
       class: 'pane-content',
       // 假设 DockerManager 会发出 'docker-command' 事件
       // onDockerCommand: (payload: { containerId: string; command: 'up' | 'down' | 'restart' | 'stop' }) => emit('dockerCommand', payload),
       // 暂时不添加事件转发，等组件实现后再确定
     };
   default:
     return { class: 'pane-content' };
 }
});

// --- New computed property for sidebar component props and events ---
// 修改以接收 side 参数，用于确定 instanceId
const sidebarProps = computed(() => (paneName: PaneName | null, side: 'left' | 'right') => {
 if (!paneName) return {};

 const baseProps = { class: 'sidebar-pane-content' }; // Base props for all sidebar components

 switch (paneName) {
   case 'editor':
     return {
       ...baseProps,
       tabs: editorTabsFromStore.value, // Access .value for refs from storeToRefs
       activeTabId: activeEditorTabIdFromStore.value, // Access .value
       sessionId: props.activeSessionId,
       // Event forwarding
       onCloseTab: (tabId: string) => emit('closeEditorTab', tabId),
       onActivateTab: (tabId: string) => emit('activateEditorTab', tabId),
       'onUpdate:content': (payload: { tabId: string; content: string }) => emit('updateEditorContent', payload),
       onRequestSave: (tabId: string) => emit('saveEditorTab', tabId),
     };
   case 'connections':
     return {
       ...baseProps,
       // Event forwarding
       onConnectRequest: (id: number) => {
         console.log(`[LayoutRenderer Sidebar] Forwarding 'connect-request' for ID: ${id}`);
         emit('connect-request', id);
       },
       onOpenNewSession: (id: number) => {
          console.log(`[LayoutRenderer Sidebar] Forwarding 'open-new-session' for ID: ${id}`);
          emit('open-new-session', id);
       },
       onRequestEditConnection: (conn: any) => {
          console.log(`[LayoutRenderer Sidebar] Forwarding 'request-edit-connection'`);
          emit('request-edit-connection', conn);
       },
       // We might not need 'request-add-connection' from the sidebar context
       // onRequestAddConnection: () => emit('request-add-connection')
     };
   case 'fileManager':
     // Only provide props if there's an active session
     if (activeSession.value) {
       // 传递 instanceId (根据 side), sessionId, dbConnectionId
       // 移除 sftpManager 和 wsDeps
       const instanceId = side === 'left' ? 'sidebar-left' : 'sidebar-right';
       return {
         ...baseProps,
         sessionId: activeSession.value.sessionId,
         instanceId: instanceId, // 使用 'sidebar-left' 或 'sidebar-right'
         dbConnectionId: activeSession.value.connectionId,
         // sftpManager: activeSession.value.sftpManager, // 移除 sftpManager
         wsDeps: { // 恢复 wsDeps
           sendMessage: activeSession.value.wsManager.sendMessage,
           onMessage: activeSession.value.wsManager.onMessage,
           isConnected: activeSession.value.wsManager.isConnected, // 直接传递 ref
           isSftpReady: activeSession.value.wsManager.isSftpReady  // 直接传递 ref
         },
       };
     } else {
       return baseProps; // Return only base props if no active session
     }
   case 'statusMonitor':
     // Only provide props if there's an active session
     if (activeSession.value) {
       return {
         ...baseProps,
         sessionId: activeSession.value.sessionId, // Pass session ID
         serverStatus: activeSession.value.statusMonitorManager.serverStatus.value,
         statusError: activeSession.value.statusMonitorManager.statusError.value,
       };
     } else {
       return baseProps; // Return only base props if no active session
     }
    // Add cases for other components if they need specific props or event forwarding in the sidebar
    // case 'commandHistory': return { ...baseProps, onExecuteCommand: (cmd: string) => emit('sendCommand', cmd) };
    // case 'quickCommands': return { ...baseProps, onExecuteCommand: (cmd: string) => emit('sendCommand', cmd) };
    default:
      return baseProps; // Return only base props for other components
  }
});


// --- Methods ---
// 处理 Splitpanes 大小调整事件
const handlePaneResize = (eventData: { panes: Array<{ size: number; [key: string]: any }> }) => {
  console.log('Splitpanes resized event object:', eventData); // 打印整个事件对象
  const paneSizes = eventData.panes; // 从事件对象中提取 panes 数组

  console.log('Extracted paneSizes:', paneSizes); // 打印提取出的数组

  if (props.layoutNode.type === 'container' && props.layoutNode.children) {
    // 确保 paneSizes 是一个数组
    if (!Array.isArray(paneSizes)) {
      console.error('[LayoutRenderer] handlePaneResize: 从事件对象提取的 panes 不是数组:', paneSizes);
      return;
    }
    // 构建传递给 store action 的数据结构
    const childrenSizes = paneSizes.map((paneInfo, index) => ({
        index: index,
        size: paneInfo.size
    }));

    // 调用 store action 来更新节点大小
    layoutStore.updateNodeSizes(props.layoutNode.id, childrenSizes);
  }
};

// 打开/切换侧栏面板
const toggleSidebarPane = (side: 'left' | 'right', paneName: PaneName) => {
  if (side === 'left') {
    activeLeftSidebarPane.value = activeLeftSidebarPane.value === paneName ? null : paneName;
    if (activeLeftSidebarPane.value) activeRightSidebarPane.value = null; // Close other side
  } else {
    activeRightSidebarPane.value = activeRightSidebarPane.value === paneName ? null : paneName;
    if (activeRightSidebarPane.value) activeLeftSidebarPane.value = null; // Close other side
  }
};

// 关闭所有侧栏
const closeSidebars = () => {
  activeLeftSidebarPane.value = null;
  activeRightSidebarPane.value = null;
};

// 监听 activeSessionId 的变化，如果会话切换，则关闭侧栏 (可选行为)
watch(() => props.activeSessionId, () => {
    // closeSidebars(); // 取消注释以在切换会话时关闭侧栏
});

// +++ 新方法：处理主内容区域点击，用于非固定模式下关闭侧边栏 +++
const handleMainAreaClick = () => {
  // 仅当侧边栏激活且不处于固定模式时才关闭
  if ((activeLeftSidebarPane.value || activeRightSidebarPane.value) && !workspaceSidebarPersistentBoolean.value) {
    closeSidebars();
  }
};

// --- Debug Watcher for sidebarPanes from store ---
watch(sidebarPanes, (newVal) => {
  console.log('[LayoutRenderer] Received updated sidebarPanes from store:', JSON.parse(JSON.stringify(newVal)));
}, { deep: true, immediate: true }); // Immediate to log initial value

// --- Icon Helper ---
const getIconClasses = (paneName: PaneName): string[] => {
  switch (paneName) {
    case 'connections': return ['fas', 'fa-network-wired'];
    case 'fileManager': return ['fas', 'fa-folder-open'];
    case 'commandHistory': return ['fas', 'fa-history'];
    case 'quickCommands': return ['fas', 'fa-bolt'];
    case 'dockerManager': return ['fab', 'fa-docker']; // Use 'fab' for Docker
    case 'editor': return ['fas', 'fa-file-alt'];
    case 'statusMonitor': return ['fas', 'fa-tachometer-alt'];
    // Add other specific icons here if needed
    default: return ['fas', 'fa-question-circle']; // Default icon
  }
};


// --- Sidebar Resize Logic ---
onMounted(() => {
  // Left Sidebar Resize
  useSidebarResize({
    sidebarRef: leftSidebarPanelRef,
    handleRef: leftResizeHandleRef,
    side: 'left',
    onResizeEnd: (newWidth) => {
      console.log(`Left sidebar resize ended. New width: ${newWidth}px`);
      // +++ Update specific pane width +++
      if (activeLeftSidebarPane.value) {
        settingsStore.updateSidebarPaneWidth(activeLeftSidebarPane.value, `${newWidth}px`);
      }
    },
  });

  // Right Sidebar Resize
  useSidebarResize({
    sidebarRef: rightSidebarPanelRef,
    handleRef: rightResizeHandleRef,
    side: 'right',
    onResizeEnd: (newWidth) => {
      console.log(`Right sidebar resize ended. New width: ${newWidth}px`);
      // +++ Update specific pane width +++
      if (activeRightSidebarPane.value) {
        settingsStore.updateSidebarPaneWidth(activeRightSidebarPane.value, `${newWidth}px`);
      }
    },
  });
});

</script>

<template>
  <div class="layout-renderer-wrapper">
    <!-- Left Sidebar Buttons (Only render if root) -->
    <div class="sidebar-buttons left-sidebar-buttons" v-if="isRootRenderer && sidebarPanes.left.length > 0">
        <button
            v-for="pane in sidebarPanes.left"
            :key="`left-${pane}`"
            @click="toggleSidebarPane('left', pane)"
            :class="{ active: activeLeftSidebarPane === pane }"
            :title="paneLabels[pane] || pane"
        >
            <!-- Use helper function for icons -->
            <i :class="getIconClasses(pane)"></i>
        </button>
    </div>

    <!-- Main Layout Area -->
    <div class="main-layout-area" @click="handleMainAreaClick"> <!-- --- 移除 .self 修饰符 --- -->
        <div class="layout-renderer" :data-node-id="layoutNode.id">
            <!-- 如果是容器节点 -->
            <template v-if="layoutNode.type === 'container' && layoutNode.children && layoutNode.children.length > 0">
            <splitpanes
                :horizontal="layoutNode.direction === 'vertical'"
                class="default-theme"
                style="height: 100%; width: 100%;"
                @resized="handlePaneResize"
            >
                <pane
                v-for="childNode in layoutNode.children"
                :key="childNode.id"
                :size="childNode.size ?? (100 / layoutNode.children.length)"
                :min-size="5"
                class="layout-pane-wrapper"
                >
                <!-- 递归调用自身来渲染子节点，并转发所有必要的事件 -->
                <LayoutRenderer
                    :layout-node="childNode"
                    :is-root-renderer="false"
                    :active-session-id="activeSessionId"
                    :editor-tabs="editorTabs"
                    :active-editor-tab-id="activeEditorTabId"
                    @send-command="emit('sendCommand', $event)"
                    @terminal-input="emit('terminalInput', $event)"
                    @terminal-resize="emit('terminalResize', $event)"
                    @terminal-ready="emit('terminal-ready', $event)"
                    @close-editor-tab="emit('closeEditorTab', $event)"
                    @activate-editor-tab="emit('activateEditorTab', $event)"
                    @update-editor-content="emit('updateEditorContent', $event)"
                    @save-editor-tab="emit('saveEditorTab', $event)"
                    @connect-request="emit('connect-request', $event)"
                    @open-new-session="emit('open-new-session', $event)"
                    @request-add-connection="() => { // 添加日志
                        console.log(`[LayoutRenderer ${props.layoutNode.id}] Received recursive 'request-add-connection', emitting upwards.`);
                        emit('request-add-connection');
                    }"
                    @request-edit-connection="emit('request-edit-connection', $event)"
                    @search="emit('search', $event)"
                    @find-next="emit('find-next')"
                    @find-previous="emit('find-previous')"
                    @close-search="emit('close-search')"
                />
                </pane>
            </splitpanes>
            </template>

            <!-- 如果是面板节点 -->
            <template v-else-if="layoutNode.type === 'pane'">
                <!-- Terminal 需要 keep-alive 处理 -->
                <template v-if="layoutNode.component === 'terminal'">
                    <keep-alive>
                        <component
                          v-if="activeSession"
                          :is="currentMainComponent"
                          :key="activeSessionId"
                          v-bind="componentProps"
                        />
                    </keep-alive>
                    <div v-if="!activeSession" class="pane-placeholder empty-session">
                      <div class="empty-session-content">
                        <i class="fas fa-plug"></i>
                        <span>无活动会话</span>
                        <div class="empty-session-tip">请先连接一个会话</div>
                      </div>
                    </div>
                </template>
                <!-- FileManager 需要 keep-alive 处理 -->
                <template v-else-if="layoutNode.component === 'fileManager'">
                    <!-- <keep-alive> Temporarily removed for debugging InvalidCharacterError -->
                        <template v-if="activeSession">
                            <component
                              :is="currentMainComponent"
                              :key="`${activeSessionId}-${layoutNode.id}`"
                              v-bind="componentProps">
                            </component>
                        </template>
                    <!-- </keep-alive> -->
                    <div v-if="!activeSession" class="pane-placeholder empty-session">
                      <div class="empty-session-content">
                        <i class="fas fa-plug"></i>
                        <span>无活动会话</span>
                        <div class="empty-session-tip">请先连接一个会话</div>
                      </div>
                    </div>
                </template>
                <!-- StatusMonitor 仅在有活动会话时渲染，并添加 key (无 keep-alive) -->
                <template v-else-if="layoutNode.component === 'statusMonitor'">
                     <component
                       v-if="activeSession"
                       :is="currentMainComponent"
                       :key="activeSessionId"
                       v-bind="componentProps"
                     />
                     <div v-else class="pane-placeholder empty-session">
                      <div class="empty-session-content">
                        <i class="fas fa-plug"></i>
                        <span>无活动会话</span>
                        <div class="empty-session-tip">请先连接一个会话</div>
                      </div>
                    </div>
                </template>
                <!-- 其他面板正常渲染 (不依赖 activeSession 的) -->
                <template v-else-if="currentMainComponent">
                    <!-- 特别处理 connections 组件以添加事件监听器 -->
                    <component
                      v-if="layoutNode.component === 'connections'"
                      :is="currentMainComponent"
                      v-bind="componentProps"
                      @request-add-connection="() => {
                          console.log(`[LayoutRenderer ${props.layoutNode.id}] Template received 'request-add-connection', emitting upwards.`);
                          emit('request-add-connection');
                      }"
                    />
                    <!-- 渲染 CommandInputBar -->
                    <component
                      v-else-if="layoutNode.component === 'commandBar'"
                      :is="currentMainComponent"
                      v-bind="componentProps"
                    />
                    <!-- 渲染其他组件 -->
                    <component
                      v-else
                      :is="currentMainComponent"
                      v-bind="componentProps"
                    />
                </template>
                <!-- 如果找不到主布局组件 -->
                <div v-else class="pane-placeholder error">
                    无效面板组件: {{ layoutNode.component || '未指定' }} (ID: {{ layoutNode.id }})
                </div>
            </template>

             <!-- 如果节点类型未知或无效 -->
             <template v-else>
               <div class="pane-placeholder error">
                 无效布局节点 (ID: {{ layoutNode.id }})
               </div>
             </template>
        </div>
    </div>

    <!-- Sidebar Panels Overlay -->
    <div
        v-if="activeLeftSidebarPane || activeRightSidebarPane"
        class="sidebar-overlay"
    ></div>

    <!-- Left Sidebar Panel -->
    <div ref="leftSidebarPanelRef" :class="['sidebar-panel', 'left-sidebar-panel', { active: !!activeLeftSidebarPane }]" :style="{ width: getSidebarPaneWidth(activeLeftSidebarPane) }"> <!-- +++ Use getter for width +++ -->
        <div ref="leftResizeHandleRef" class="resize-handle left-handle"></div> <!-- +++ Left Handle +++ -->
        <button class="close-sidebar-btn" @click="closeSidebars" title="Close Sidebar">&times;</button>
        <component
            v-if="currentLeftSidebarComponent && activeLeftSidebarPane && (!['fileManager', 'statusMonitor'].includes(activeLeftSidebarPane) || activeSession)"
            :is="currentLeftSidebarComponent"
            :key="`left-panel-${activeLeftSidebarPane ?? 'null'}`"
            v-bind="sidebarProps(activeLeftSidebarPane, 'left')">
        </component>
        <!-- Placeholder if FileManager is selected but no active session -->
        <div v-else-if="activeLeftSidebarPane === 'fileManager' && !activeSession" class="sidebar-pane-content pane-placeholder empty-session">
          <div class="empty-session-content">
            <i class="fas fa-plug"></i>
            <span>无活动会话</span>
            <div class="empty-session-tip">文件管理器需要活动会话</div>
          </div>
        </div>
        <!-- Placeholder if StatusMonitor is selected but no active session -->
        <div v-else-if="activeLeftSidebarPane === 'statusMonitor' && !activeSession" class="sidebar-pane-content pane-placeholder empty-session">
          <div class="empty-session-content">
            <i class="fas fa-plug"></i>
            <span>无活动会话</span>
            <div class="empty-session-tip">状态监视器需要活动会话</div>
          </div>
        </div>
    </div>

    <!-- Right Sidebar Panel -->
     <div ref="rightSidebarPanelRef" :class="['sidebar-panel', 'right-sidebar-panel', { active: !!activeRightSidebarPane }]" :style="{ width: getSidebarPaneWidth(activeRightSidebarPane) }"> <!-- +++ Use getter for width +++ -->
        <div ref="rightResizeHandleRef" class="resize-handle right-handle"></div> <!-- +++ Right Handle +++ -->
        <button class="close-sidebar-btn" @click="closeSidebars" title="Close Sidebar">&times;</button>
        <component
            v-if="currentRightSidebarComponent && activeRightSidebarPane && (!['fileManager', 'statusMonitor'].includes(activeRightSidebarPane) || activeSession)"
            :is="currentRightSidebarComponent"
            :key="`right-panel-${activeRightSidebarPane ?? 'null'}`"
            v-bind="sidebarProps(activeRightSidebarPane, 'right')">
        </component>
        <!-- Placeholder if FileManager is selected but no active session -->
        <div v-else-if="activeRightSidebarPane === 'fileManager' && !activeSession" class="sidebar-pane-content pane-placeholder empty-session">
          <div class="empty-session-content">
            <i class="fas fa-plug"></i>
            <span>无活动会话</span>
            <div class="empty-session-tip">文件管理器需要活动会话</div>
          </div>
        </div>
        <!-- Placeholder if StatusMonitor is selected but no active session -->
        <div v-else-if="activeRightSidebarPane === 'statusMonitor' && !activeSession" class="sidebar-pane-content pane-placeholder empty-session">
          <div class="empty-session-content">
            <i class="fas fa-plug"></i>
            <span>无活动会话</span>
            <div class="empty-session-tip">状态监视器需要活动会话</div>
          </div>
        </div>
    </div>

     <!-- Right Sidebar Buttons (Only render if root) -->
    <div class="sidebar-buttons right-sidebar-buttons" v-if="isRootRenderer && sidebarPanes.right.length > 0">
         <button
             v-for="pane in sidebarPanes.right"
            :key="`right-${pane}`"
            @click="toggleSidebarPane('right', pane)"
            :class="{ active: activeRightSidebarPane === pane }"
            :title="paneLabels[pane] || pane"
        >
             <!-- Use helper function for icons -->
             <i :class="getIconClasses(pane)"></i>
        </button>
    </div>

  </div>
</template>

<style scoped>
.layout-renderer-wrapper {
  position: relative; /* Needed for absolute positioning of sidebars */
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.sidebar-buttons {
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg-color, #f8f9fa); /* Use theme variable or default */
  padding: 5px 0;
  z-index: 10; /* Above main layout but below panels */
  flex-shrink: 0; /* Prevent buttons from shrinking */
}

.left-sidebar-buttons {
  border-right: 1px solid var(--border-color, #dee2e6);
}

.right-sidebar-buttons {
  border-left: 1px solid var(--border-color, #dee2e6);
}

.sidebar-buttons button {
  background: none;
  border: none;
  color: var(--text-color-secondary, #6c757d);
  padding: 10px 8px;
  cursor: pointer;
  font-size: 1.1rem; /* Slightly smaller icons */
  line-height: 1;
  transition: background-color 0.2s, color 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px; /* Fixed width for buttons */
  height: 40px; /* Fixed height for buttons */
  margin-bottom: 4px; /* Space between buttons */
}

.sidebar-buttons button:hover {
  background-color: var(--hover-bg-color, #e9ecef);
  color: var(--text-color-primary, #343a40);
}

.sidebar-buttons button.active {
  background-color: var(--primary-color, #007bff);
  color: white;
}
.sidebar-buttons button.active:hover {
   background-color: var(--primary-color-dark, #0056b3); /* Darker primary on hover when active */
}


.main-layout-area {
  flex-grow: 1;
  height: 100%;
  overflow: hidden; /* Prevent main layout from overflowing */
  position: relative; /* Needed for potential internal absolute elements */
}

.layout-renderer {
  height: 100%;
  width: 100%;
  overflow: hidden; /* 防止内部内容溢出渲染器边界 */
  display: flex; /* 确保子元素能正确填充 */
  flex-direction: column; /* 默认列方向 */
}

/* 为 splitpanes 包裹的 pane 添加样式，确保内容填充 */
.layout-pane-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 隐藏内部滚动条，由子组件处理 */
  background-color: var(--app-bg-color); /* Use app background */
}

/* 确保动态加载的组件能正确应用 pane-content 样式 */
/* 如果组件内部没有根元素应用 pane-content，可能需要在这里强制 */
:deep(.layout-pane-wrapper > *) {
  flex-grow: 1;
  overflow: auto; /* 或者 hidden */
  display: flex;
  flex-direction: column;
}
/* 特别是对于没有明确设置 class 的组件 */
:deep(.layout-pane-wrapper > .pane-placeholder) {
   flex-grow: 1;
   display: flex;
   justify-content: center;
   align-items: center;
   text-align: center;
   color: var(--text-color-secondary); /* Use secondary text color */
   background-color: var(--header-bg-color); /* Use header background */
   font-size: 0.9em;
   padding: var(--base-padding); /* Use base padding */
}

/* 增强空会话显示样式 */
:deep(.empty-session) {
  background-color: var(--app-bg-color); /* Use app background */
  border-radius: 8px;
  /* box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.03); */ /* Optional: Consider removing or using theme variables */
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.empty-session-content) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  width: 100%;
  height: 100%;
}

:deep(.empty-session-content i) {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
  color: var(--text-color-secondary); /* Use secondary text color */
}

:deep(.empty-session-content span) {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-color-secondary); /* Use secondary text color */
  margin-bottom: 0.5rem;
}

:deep(.empty-session-tip) {
  font-size: 0.85rem;
  color: var(--text-color-secondary); /* Use secondary text color */
  margin-top: 0.5rem;
}
:deep(.layout-pane-wrapper > .pane-placeholder.error) {
  color: #dc3545; /* Keep hardcoded error color for now */
  background-color: #fdd; /* Keep hardcoded error background for now */
}


/* Sidebar Panel Styles */
.sidebar-overlay {
  position: fixed; /* Use fixed to cover the whole viewport */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* background-color: rgba(0, 0, 0, 0.4); */ /* <-- 移除背景色 --> */
  background-color: transparent; /* <-- 确保完全透明 --> */
  pointer-events: none; /* <-- 不拦截鼠标事件 --> */
  z-index: 100; /* Below panel, above main content */
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0s linear 0.3s;
}
/* Show overlay when either panel is active */
.layout-renderer-wrapper:has(.sidebar-panel.active) .sidebar-overlay {
  opacity: 1;
  visibility: visible;
  transition: opacity 0.3s ease, visibility 0s linear 0s;
}


.sidebar-panel {
  position: fixed; /* Use fixed for viewport positioning */
  top: 0; /* Adjust if you have a fixed header */
  bottom: 0; /* Adjust if you have a fixed footer */
  /* width: 350px; */ /* Width is now controlled by style binding */
  max-width: 80vw;
  background-color: var(--app-bg-color, white);
  /* box-shadow: 0 0 15px rgba(0, 0, 0, 0.2); */ /* <-- 移除阴影以隐藏边缘 --> */
  z-index: 110; /* Above overlay */
  transform: translateX(-100%); /* Start hidden */
  transition: transform 0.3s ease-in-out; /* Keep transition for sliding */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Prevent content overflow */
}

.left-sidebar-panel {
  left: 0;
  transform: translateX(-100%);
  border-right: 1px solid var(--border-color, #dee2e6);
}
.left-sidebar-panel.active {
  transform: translateX(0);
}

.right-sidebar-panel {
  right: 0;
  transform: translateX(100%);
   border-left: 1px solid var(--border-color, #dee2e6);
}
.right-sidebar-panel.active {
  transform: translateX(0);
}

.close-sidebar-btn {
  position: absolute;
  top: 5px;
  right: 10px;
  background: none;
  border: none;
  font-size: 1.8rem;
  color: var(--text-color-secondary, #aaa);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  z-index: 1; /* Above panel content */
}
.close-sidebar-btn:hover {
  color: var(--text-color-primary, #333);
}

/* Style for the content inside the sidebar panel */
:deep(.sidebar-pane-content) {
  flex-grow: 1;
  overflow-y: auto; /* Allow scrolling within the panel */
  padding: 1rem; /* Add some padding */
  padding-top: 2.5rem; /* Add padding to avoid close button overlap */
}

/* Resize Handle Styles */
.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px; /* Increased width for easier interaction */
  cursor: col-resize;
  z-index: 120; /* Above panel content */
  background-color: transparent; /* Make it invisible by default */
  transition: background-color 0.2s ease;
}
.resize-handle:hover {
   background-color: var(--primary-color-light, #a0cfff); /* Highlight on hover */
}
.left-handle {
  right: -4px; /* Adjusted position for increased width */
}
.right-handle {
  left: -4px; /* Adjusted position for increased width */
}

</style>

<style> /* Global styles for splitpanes if needed, or scoped with :deep() */
.splitpanes.default-theme .splitpanes__pane {
  background-color: var(--app-bg-color); /* Ensure panes match app background */
}
.splitpanes.default-theme .splitpanes__splitter {
  background-color: var(--border-color, #dee2e6);
  border-left: 1px solid var(--border-color-lighter, #f1f3f5); /* Example lighter border */
  border-right: 1px solid var(--border-color-darker, #ced4da); /* Example darker border */
  box-sizing: border-box;
  transition: background-color 0.2s ease-out;
}
.splitpanes.default-theme .splitpanes__splitter:hover {
  background-color: var(--primary-color-light, #a0cfff); /* Lighter primary on hover */
}
.splitpanes.default-theme .splitpanes__splitter::before,
.splitpanes.default-theme .splitpanes__splitter::after {
    background-color: var(--text-color-secondary, #6c757d); /* Adjust handle color */
}
.splitpanes--vertical > .splitpanes__splitter {
  width: 6px; /* Adjust width */
  border-left: 1px solid var(--border-color-darker, #ced4da);
  border-right: 1px solid var(--border-color-lighter, #f1f3f5);
}
.splitpanes--horizontal > .splitpanes__splitter {
  height: 6px; /* Adjust height */
   border-top: 1px solid var(--border-color-darker, #ced4da);
   border-bottom: 1px solid var(--border-color-lighter, #f1f3f5);
}
</style>

