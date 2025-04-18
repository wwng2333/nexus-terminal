<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
// 移除不再直接使用的组件导入
import AddConnectionFormComponent from '../components/AddConnectionForm.vue';
import TerminalTabBar from '../components/TerminalTabBar.vue';
import LayoutRenderer from '../components/LayoutRenderer.vue'; // *** 导入布局渲染器 ***
import LayoutConfigurator from '../components/LayoutConfigurator.vue'; // *** 导入布局配置器 ***
import { useSessionStore, type SessionTabInfoWithStatus, type SshTerminalInstance } from '../stores/session.store';
import { useSettingsStore } from '../stores/settings.store';
import { useFileEditorStore } from '../stores/fileEditor.store';
import { useLayoutStore } from '../stores/layout.store';
import { useCommandHistoryStore } from '../stores/commandHistory.store';
import type { ConnectionInfo } from '../stores/connections.store';
import type { Terminal } from 'xterm'; // *** 导入 Terminal 类型 ***
import type { ISearchOptions } from '@xterm/addon-search'; // *** 导入搜索选项类型 ***

// --- Setup ---
const { t } = useI18n();
const sessionStore = useSessionStore();
const settingsStore = useSettingsStore();
const fileEditorStore = useFileEditorStore();
const layoutStore = useLayoutStore();
const commandHistoryStore = useCommandHistoryStore();

// --- 从 Store 获取响应式状态和 Getters ---
const { sessionTabsWithStatus, activeSessionId, activeSession } = storeToRefs(sessionStore);
const { shareFileEditorTabsBoolean } = storeToRefs(settingsStore);
const { orderedTabs: globalEditorTabs, activeTabId: globalActiveEditorTabId } = storeToRefs(fileEditorStore);
const { layoutTree } = storeToRefs(layoutStore); // 获取布局树

// --- 计算属性 (用于动态绑定编辑器 Props) ---
// 这些计算属性现在需要传递给 LayoutRenderer
const editorTabs = computed(() => {
  if (shareFileEditorTabsBoolean.value) {
    return globalEditorTabs.value;
  } else {
    return activeSession.value?.editorTabs.value ?? [];
  }
});

const activeEditorTabId = computed(() => {
  if (shareFileEditorTabsBoolean.value) {
    return globalActiveEditorTabId.value;
  } else {
    return activeSession.value?.activeEditorTabId.value ?? null;
  }
});


// --- UI 状态 (保持本地) ---
const showAddEditForm = ref(false);
const connectionToEdit = ref<ConnectionInfo | null>(null);
const showLayoutConfigurator = ref(false); // 控制布局配置器可见性

// --- 搜索状态 ---
const currentSearchTerm = ref(''); // 当前搜索的关键词

// --- 生命周期钩子 ---
onMounted(() => {
  console.log('[工作区视图] 组件已挂载。');
  // 确保布局已初始化 (layoutStore 内部会处理)
});

onBeforeUnmount(() => {
  console.log('[工作区视图] 组件即将卸载，清理所有会话...');
  sessionStore.cleanupAllSessions();
});

 // --- 本地方法 (仅处理 UI 状态) ---
 const handleRequestAddConnection = () => {
   console.log('[WorkspaceView] handleRequestAddConnection 被调用！'); // 添加日志确认事件到达
   connectionToEdit.value = null;
   showAddEditForm.value = true;
 };

 const handleRequestEditConnection = (connection: ConnectionInfo) => {
   connectionToEdit.value = connection;
   showAddEditForm.value = true;
 };

 const handleFormClose = () => {
   showAddEditForm.value = false;
   connectionToEdit.value = null;
 };

 const handleConnectionAdded = () => {
   console.log('[工作区视图] 连接已添加');
   handleFormClose();
 };

 const handleConnectionUpdated = () => {
   console.log('[工作区视图] 连接已更新');
   handleFormClose();
 };

 // 处理打开和关闭布局配置器
 const handleOpenLayoutConfigurator = () => {
   showLayoutConfigurator.value = true;
 };
 const handleCloseLayoutConfigurator = () => {
   showLayoutConfigurator.value = false;
 };

 // --- 事件处理 (传递给 LayoutRenderer 或直接使用) ---

 // 处理命令发送 (用于 CommandBar, CommandHistory, QuickCommands)
 const handleSendCommand = (command: string) => {
   const currentSession = activeSession.value;
   if (!currentSession) {
     console.warn('[WorkspaceView] Cannot send command, no active session.');
     return;
   }
   const terminalManager = currentSession.terminalManager as (SshTerminalInstance | undefined);

   if (terminalManager?.isSshConnected && !terminalManager.isSshConnected.value && command.trim() === '') {
     console.log(`[WorkspaceView] Command bar Enter detected in disconnected session ${currentSession.sessionId}, attempting reconnect...`);
     if (terminalManager.terminalInstance?.value) {
         terminalManager.terminalInstance.value.writeln(`\r\n\x1b[33m${t('workspace.terminal.reconnectingMsg')}\x1b[0m`);
     }
     sessionStore.handleConnectRequest(currentSession.connectionId);
     return;
   }

   if (terminalManager && typeof terminalManager.sendData === 'function') {
     const commandToSend = command.trim();
     console.log(`[WorkspaceView] Sending command to active session ${currentSession.sessionId}: ${commandToSend}`);
     terminalManager.sendData(command + '\r');
     if (commandToSend.length > 0) {
       commandHistoryStore.addCommand(commandToSend);
     }
   } else {
     console.warn(`[WorkspaceView] Cannot send command for session ${currentSession.sessionId}, terminal manager or sendData method not available.`);
   }
 };

 // 处理终端输入 (用于 Terminal)
 // 注意：LayoutRenderer 内部的 Terminal 组件需要 emit('terminal-input', sessionId, data)
 const handleTerminalInput = (payload: { sessionId: string; data: string }) => {
   const { sessionId, data } = payload; // 解构 payload
   const session = sessionStore.sessions.get(sessionId);
   const manager = session?.terminalManager as (SshTerminalInstance | undefined);
   if (!session || !manager) {
     console.warn(`[WorkspaceView] handleTerminalInput: 未找到会话 ${sessionId} 或其 terminalManager`);
     return;
   }
   if (data === '\r' && manager.isSshConnected && !manager.isSshConnected.value) {
     console.log(`[WorkspaceView] 检测到在断开的会话 ${sessionId} 中按下回车，尝试重连...`);
     if (manager.terminalInstance?.value) {
         manager.terminalInstance.value.writeln(`\r\n\x1b[33m${t('workspace.terminal.reconnectingMsg')}\x1b[0m`);
     } else {
         console.warn(`[WorkspaceView] 无法写入重连提示，terminalInstance 不可用。`);
     }
     sessionStore.handleConnectRequest(session.connectionId);
   } else {
     manager.handleTerminalData(data);
   }
 };

 // 处理终端大小调整 (用于 Terminal)
 // 注意：LayoutRenderer 内部的 Terminal 组件需要 emit('terminal-resize', sessionId, dims)
 const handleTerminalResize = (payload: { sessionId: string; dims: { cols: number; rows: number } }) => {
    console.log(`[工作区视图 ${payload.sessionId}] 收到 resize 事件:`, payload.dims);
    sessionStore.sessions.get(payload.sessionId)?.terminalManager.handleTerminalResize(payload.dims);
 };

 // 处理终端就绪 (用于 Terminal)
 // 注意：LayoutRenderer 内部的 Terminal 组件需要 emit('terminal-ready', payload)
 // *** 修正：更新 payload 类型以包含 searchAddon ***
 const handleTerminalReady = (payload: { sessionId: string; terminal: Terminal; searchAddon: any | null }) => { // 使用 any 避免导入 SearchAddon 类型
    console.log(`[工作区视图 ${payload.sessionId}] 收到 terminal-ready 事件。Payload:`, payload); // *** 添加 Payload 日志 ***
    // *** 检查 payload 中 searchAddon 是否存在 ***
    if (payload && payload.searchAddon) {
        console.log(`[工作区视图 ${payload.sessionId}] Payload 包含 searchAddon 实例。`);
    } else {
        console.warn(`[工作区视图 ${payload.sessionId}] Payload 未包含 searchAddon 实例！ Payload:`, payload);
    }
    // *** 修正：传递包含 terminal 和 searchAddon 的完整 payload ***
    sessionStore.sessions.get(payload.sessionId)?.terminalManager.handleTerminalReady(payload);
};

// --- 搜索事件处理 ---
const handleSearch = (term: string) => {
  currentSearchTerm.value = term;
  if (!term) {
    // 如果搜索词为空，清除搜索
    handleCloseSearch();
    return;
  }
  console.log(`[WorkspaceView] Received search event: "${term}"`);
  // 默认向前搜索
  handleFindNext();
};

const handleFindNext = () => {
  const manager = activeSession.value?.terminalManager;
  if (manager && currentSearchTerm.value) {
    console.log(`[WorkspaceView] Calling findNext for term: "${currentSearchTerm.value}"`);
    const found = manager.searchNext(currentSearchTerm.value, { incremental: true });
    console.log(`[WorkspaceView] findNext returned: ${found}`); // 打印返回值
    if (!found) {
      console.log(`[WorkspaceView] findNext: No more results for "${currentSearchTerm.value}"`);
      // 可以添加 UI 提示，例如短暂高亮搜索框
    }
  } else {
     console.warn(`[WorkspaceView] Cannot findNext, no active session manager or search term.`);
  }
};

const handleFindPrevious = () => {
  const manager = activeSession.value?.terminalManager;
  if (manager && currentSearchTerm.value) {
     console.log(`[WorkspaceView] Calling findPrevious for term: "${currentSearchTerm.value}"`);
    const found = manager.searchPrevious(currentSearchTerm.value, { incremental: true });
    console.log(`[WorkspaceView] findPrevious returned: ${found}`); // 打印返回值
     if (!found) {
      console.log(`[WorkspaceView] findPrevious: No previous results for "${currentSearchTerm.value}"`);
      // 可以添加 UI 提示
    }
  } else {
     console.warn(`[WorkspaceView] Cannot findPrevious, no active session manager or search term.`);
  }
};

const handleCloseSearch = () => {
  console.log(`[WorkspaceView] Received close-search event.`);
  currentSearchTerm.value = ''; // 清空搜索词
  const manager = activeSession.value?.terminalManager;
  if (manager) {
    manager.clearTerminalSearch();
  } else {
     console.warn(`[WorkspaceView] Cannot clear search, no active session manager.`);
  }
};

// Removed computed properties for search results, will pass manager directly
// --- 编辑器操作处理 (用于 FileEditorContainer) ---
const handleCloseEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value;
   console.log(`[WorkspaceView] handleCloseEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.closeTab(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value;
     if (currentActiveSessionId) {
       sessionStore.closeEditorTabInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot close editor tab: No active session in independent mode.');
     }
   }
 };

 const handleActivateEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value;
   console.log(`[WorkspaceView] handleActivateEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.setActiveTab(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value;
     if (currentActiveSessionId) {
       sessionStore.setActiveEditorTabInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot activate editor tab: No active session in independent mode.');
     }
   }
 };

 const handleUpdateEditorContent = (payload: { tabId: string; content: string }) => {
   const isShared = shareFileEditorTabsBoolean.value;
   console.log(`[WorkspaceView] handleUpdateEditorContent for tab ${payload.tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.updateFileContent(payload.tabId, payload.content);
   } else {
     const currentActiveSessionId = activeSessionId.value;
     if (currentActiveSessionId) {
       sessionStore.updateFileContentInSession(currentActiveSessionId, payload.tabId, payload.content);
     } else {
       console.warn('[WorkspaceView] Cannot update editor content: No active session in independent mode.');
     }
   }
 };

 const handleSaveEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value;
   console.log(`[WorkspaceView] handleSaveEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.saveFile(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value;
     if (currentActiveSessionId) {
       sessionStore.saveFileInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot save editor tab: No active session in independent mode.');
     }
   }
 };

 // --- 连接列表操作处理 (用于 WorkspaceConnectionList) ---
 const handleConnectRequest = (id: number) => {
    console.log(`[WorkspaceView] Received 'connect-request' event for ID: ${id}`);
    sessionStore.handleConnectRequest(id);
 };
 const handleOpenNewSession = (id: number) => {
    console.log(`[WorkspaceView] Received 'open-new-session' event for ID: ${id}`);
    sessionStore.handleOpenNewSession(id);
 };

</script>

<template>
  <div class="workspace-view">
    <TerminalTabBar
        :sessions="sessionTabsWithStatus"
        :active-session-id="activeSessionId"
        @activate-session="sessionStore.activateSession"
        @close-session="sessionStore.closeSession"
        @open-layout-configurator="handleOpenLayoutConfigurator"
        @request-add-connection-from-popup="handleRequestAddConnection"
    />

    <div class="main-content-area">
      <LayoutRenderer
        v-if="layoutTree"
        :layout-node="layoutTree"
        :active-session-id="activeSessionId"
        class="layout-renderer-wrapper"
        :editor-tabs="editorTabs"
        :active-editor-tab-id="activeEditorTabId"
        @send-command="handleSendCommand"
        @terminal-input="handleTerminalInput"
        @terminal-resize="handleTerminalResize"
        @terminal-ready="handleTerminalReady"
        @close-editor-tab="handleCloseEditorTab"
        @activate-editor-tab="handleActivateEditorTab"
        @update-editor-content="handleUpdateEditorContent"
        @save-editor-tab="handleSaveEditorTab"
        @connect-request="handleConnectRequest"
        @open-new-session="handleOpenNewSession"
        @request-add-connection="handleRequestAddConnection"
        @request-edit-connection="handleRequestEditConnection"
        @search="handleSearch"
        @find-next="handleFindNext"
        @find-previous="handleFindPrevious"
        @close-search="handleCloseSearch"
      ></LayoutRenderer> <!-- 修正：使用单独的结束标签 -->
      <div v-else class="pane-placeholder"> <!-- 确保 v-else 紧随 v-if -->
        {{ t('layout.loading', '加载布局中...') }}
      </div>
    </div>

    <!-- Modals should be outside the main content flow -->
    <AddConnectionFormComponent
      v-if="showAddEditForm"
      :connection-to-edit="connectionToEdit"
      @close="handleFormClose"
      @connection-added="handleConnectionAdded"
      @connection-updated="handleConnectionUpdated"
    />

    <LayoutConfigurator
      :is-visible="showLayoutConfigurator"
      @close="handleCloseLayoutConfigurator"
    />
  </div> <!-- End of root element -->
</template>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px - 30px - 2rem); /* 保持原始高度计算 */
  overflow: hidden;
  background-color: var(--app-bg-color); /* Added app background */
}

.main-content-area {
    display: flex;
    flex: 1;
    overflow: hidden; /* Keep overflow hidden */
    border: 1px solid var(--border-color, #ccc); /* Use variable for border */
    border-top: none; /* Remove top border as it's handled by the tab bar */
    border-radius: 0 0 5px 5px; /* Top-left, Top-right, Bottom-right, Bottom-left */
    margin: var(--base-margin, 0.5rem); /* Add some margin around the content area */
    margin-top: 0; /* Remove top margin if tab bar is directly above */
}

.layout-renderer-wrapper {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 面板占位符样式 (用于加载或错误状态) */
.pane-placeholder {
    flex-grow: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: var(--text-color-secondary); /* Use secondary text color variable */
    background-color: var(--header-bg-color); /* Use header background for slight contrast */
    font-size: 0.9em;
    padding: var(--base-padding); /* Use base padding variable */
}

/* 移除旧的、不再需要的特定面板样式，因为渲染由 LayoutRenderer 处理 */

</style>
