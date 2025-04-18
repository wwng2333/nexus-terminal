<script setup lang="ts">
import { computed, defineAsyncComponent, type PropType, type Component } from 'vue';
// 添加依赖 font-awesome
import '@fortawesome/fontawesome-free/css/all.min.css';
import { Splitpanes, Pane } from 'splitpanes';
import { useLayoutStore, type LayoutNode, type PaneName } from '../stores/layout.store';
import { useSessionStore } from '../stores/session.store';
import { storeToRefs } from 'pinia';
import { defineEmits } from 'vue'; // *** 新增：导入 defineEmits ***

// --- Props ---
const props = defineProps({
  layoutNode: {
    type: Object as PropType<LayoutNode>,
    required: true,
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
const { activeSession } = storeToRefs(sessionStore);

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
};

// --- Computed ---
// 获取当前节点对应的组件实例
const currentComponent = computed(() => {
  if (props.layoutNode.type === 'pane' && props.layoutNode.component) {
    return componentMap[props.layoutNode.component] || null;
  }
  return null;
});

// 为特定组件计算需要传递的 Props
// 注意：这是一个简化示例，实际可能需要更复杂的逻辑来传递正确的 props
// 例如，Terminal, FileManager, StatusMonitor 需要当前 activeSession 的数据
// Editor 需要根据共享模式决定数据来源
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
      return {
         sessionId: props.activeSessionId ?? '', // 确保 sessionId 不为 null
         dbConnectionId: currentActiveSession.connectionId,
         sftpManager: currentActiveSession.sftpManager, // 此时 currentActiveSession 必不为 null
         wsDeps: { // 确保传递 wsDeps
           sendMessage: currentActiveSession.wsManager.sendMessage,
           onMessage: currentActiveSession.wsManager.onMessage,
           isConnected: currentActiveSession.wsManager.isConnected,
           isSftpReady: currentActiveSession.wsManager.isSftpReady
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
    default:
      return { class: 'pane-content' };
  }
});

// --- Methods ---
// 处理 Splitpanes 大小调整事件，更新 layoutStore 中的节点 size
// @resized 事件参数是一个包含 panes 数组的对象
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

</script>

<template>
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
                  :is="currentComponent"
                  :key="activeSessionId"
                  v-bind="componentProps"
                />
            </keep-alive>
            <div v-if="!activeSession" class="pane-placeholder empty-session">
              <div class="empty-session-content">
                <i class="fas fa-terminal-slash"></i>
                <span>无活动会话</span>
                <div class="empty-session-tip">请先连接一个会话</div>
              </div>
            </div>
        </template>
        <!-- FileManager 需要 keep-alive 处理 -->
        <template v-else-if="layoutNode.component === 'fileManager'">
            <keep-alive>
                <component
                  v-if="activeSession"
                  :is="currentComponent"
                  :key="activeSessionId"
                  v-bind="componentProps"
                />
            </keep-alive>
            <div v-if="!activeSession" class="pane-placeholder empty-session">
              <div class="empty-session-content">
                <i class="fas fa-terminal-slash"></i>
                <span>无活动会话</span>
                <div class="empty-session-tip">请先连接一个会话</div>
              </div>
            </div>
        </template>
        <!-- StatusMonitor 仅在有活动会话时渲染，并添加 key (无 keep-alive) -->
        <template v-else-if="layoutNode.component === 'statusMonitor'">
             <component
               v-if="activeSession"
               :is="currentComponent"
               :key="activeSessionId"
               v-bind="componentProps"
             />
             <div v-else class="pane-placeholder empty-session">
              <div class="empty-session-content">
                <i class="fas fa-terminal-slash"></i>
                <span>无活动会话</span>
                <div class="empty-session-tip">请先连接一个会话</div>
              </div>
            </div>
        </template>
        <!-- 其他面板正常渲染 (不依赖 activeSession 的) -->
        <template v-else-if="currentComponent">
            <!-- 特别处理 connections 组件以添加事件监听器 -->
            <component
              v-if="layoutNode.component === 'connections'"
              :is="currentComponent"
              v-bind="componentProps"
              @request-add-connection="() => {
                  console.log(`[LayoutRenderer ${props.layoutNode.id}] Template received 'request-add-connection', emitting upwards.`);
                  emit('request-add-connection');
              }"
            />
            <!-- 渲染 CommandInputBar -->
            <component
              v-else-if="layoutNode.component === 'commandBar'"
              :is="currentComponent"
              v-bind="componentProps"
            />
            <!-- 渲染其他组件 -->
            <component
              v-else
              :is="currentComponent"
              v-bind="componentProps"
            />
        </template>
        <!-- 如果找不到组件 -->
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
</template>

<style scoped>
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


/* Splitpanes 默认主题样式调整 (如果需要覆盖全局样式) */
/* :deep(.splitpanes.default-theme .splitpanes__splitter) { */
  /* background-color: #ccc; */
/* } */
/* :deep(.splitpanes--vertical > .splitpanes__splitter) { */
  /* width: 7px; */
/* } */
/* :deep(.splitpanes--horizontal > .splitpanes__splitter) { */
  /* height: 7px; */
/* } */
</style>
