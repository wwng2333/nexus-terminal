<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import TerminalComponent from '../components/Terminal.vue';
import FileManagerComponent from '../components/FileManager.vue';
import StatusMonitorComponent from '../components/StatusMonitor.vue';
import WorkspaceConnectionListComponent from '../components/WorkspaceConnectionList.vue';
import AddConnectionFormComponent from '../components/AddConnectionForm.vue';
import TerminalTabBar from '../components/TerminalTabBar.vue';
import CommandInputBar from '../components/CommandInputBar.vue';
import FileEditorContainer from '../components/FileEditorContainer.vue'; // 导入编辑器容器
import CommandHistoryView from './CommandHistoryView.vue'; // 导入命令历史视图
import QuickCommandsView from './QuickCommandsView.vue'; // 导入快捷指令视图
import PaneTitleBar from '../components/PaneTitleBar.vue'; // 导入标题栏组件
import { useSessionStore, type SessionTabInfoWithStatus, type SshTerminalInstance } from '../stores/session.store'; // 导入 SshTerminalInstance
import { useSettingsStore } from '../stores/settings.store'; // 导入设置 Store
import { useFileEditorStore } from '../stores/fileEditor.store'; // 导入文件编辑器 Store
import { useLayoutStore } from '../stores/layout.store'; // 导入布局 Store
import { useCommandHistoryStore } from '../stores/commandHistory.store'; // 导入命令历史 Store
import type { ConnectionInfo } from '../stores/connections.store';
// 导入 splitpanes 组件
import { Splitpanes, Pane } from 'splitpanes';
// 导入管理器实例类型，用于 FileManagerComponent 的 prop 类型断言
// import type { SftpManagerInstance } from '../stores/session.store'; // SftpManagerInstance 已在上面导入

// --- Setup ---
const { t } = useI18n();
const sessionStore = useSessionStore();
const settingsStore = useSettingsStore(); // 初始化设置 Store
const fileEditorStore = useFileEditorStore(); // 初始化文件编辑器 Store (用于共享模式)
const layoutStore = useLayoutStore(); // 初始化布局 Store
const commandHistoryStore = useCommandHistoryStore(); // 初始化命令历史 Store

// --- 从 Store 获取响应式状态和 Getters ---
const { sessionTabsWithStatus, activeSessionId, activeSession } = storeToRefs(sessionStore);
const { shareFileEditorTabsBoolean } = storeToRefs(settingsStore); // 获取共享设置
const { orderedTabs: globalEditorTabs, activeTabId: globalActiveEditorTabId } = storeToRefs(fileEditorStore); // 获取全局编辑器状态
const { paneVisibility } = storeToRefs(layoutStore); // 获取布局可见性状态

// --- 计算属性 (用于动态绑定编辑器 Props) ---
// **再次修正：** 确保计算属性在共享模式下严格只依赖全局状态
const editorTabs = computed(() => {
  if (shareFileEditorTabsBoolean.value) {
    // console.log('[WorkspaceView] Shared Mode: Returning globalEditorTabs');
    return globalEditorTabs.value; // 共享模式：只依赖全局 store 的 tabs
  } else {
    // console.log('[WorkspaceView] Independent Mode: Returning activeSession tabs');
    return activeSession.value?.editorTabs.value ?? []; // 独立模式：依赖 activeSession
  }
});

const activeEditorTabId = computed(() => {
  if (shareFileEditorTabsBoolean.value) {
    // console.log('[WorkspaceView] Shared Mode: Returning globalActiveEditorTabId');
    return globalActiveEditorTabId.value; // 共享模式：只依赖全局 store 的 activeTabId
  } else {
    // console.log('[WorkspaceView] Independent Mode: Returning activeSession activeEditorTabId');
    return activeSession.value?.activeEditorTabId.value ?? null; // 独立模式：依赖 activeSession
  }
});


// --- UI 状态 (保持本地) ---
const showAddEditForm = ref(false);
const connectionToEdit = ref<ConnectionInfo | null>(null);

// --- 生命周期钩子 ---
onMounted(() => {
  console.log('[工作区视图] 组件已挂载。');
});

onBeforeUnmount(() => {
  console.log('[工作区视图] 组件即将卸载，清理所有会话...');
  sessionStore.cleanupAllSessions();
});

// --- 本地方法 (仅处理 UI 状态) ---
 const handleRequestAddConnection = () => {
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

 // 处理命令发送
 const handleSendCommand = (command: string) => {
   const currentSession = activeSession.value; // 获取当前活动会话
   if (!currentSession) {
     console.warn('[WorkspaceView] Cannot send command, no active session.');
     return;
   }
 
   const terminalManager = currentSession.terminalManager as (SshTerminalInstance | undefined);
 
   // 检查连接状态和命令内容
   if (terminalManager?.isSshConnected && !terminalManager.isSshConnected.value && command.trim() === '') {
     // 如果连接断开且命令为空（仅按回车），则触发重连
     console.log(`[WorkspaceView] Command bar Enter detected in disconnected session ${currentSession.sessionId}, attempting reconnect...`);
     // 可选：在终端显示提示
     if (terminalManager.terminalInstance?.value) {
         terminalManager.terminalInstance.value.writeln(`\r\n\x1b[33m${t('workspace.terminal.reconnectingMsg')}\x1b[0m`);
     }
     sessionStore.handleConnectRequest(currentSession.connectionId);
     return; // 阻止发送空命令
   }
 
   // 否则，正常发送命令
   if (terminalManager && typeof terminalManager.sendData === 'function') {
     const commandToSend = command.trim(); // 获取去除首尾空格的命令，用于记录历史
     console.log(`[WorkspaceView] Sending command to active session ${currentSession.sessionId}: ${commandToSend}`);
     // 发送给终端时，需要添加回车符以模拟执行
     terminalManager.sendData(command + '\r');

     // 记录非空命令到历史记录
     if (commandToSend.length > 0) {
       commandHistoryStore.addCommand(commandToSend);
     }
   } else {
     console.warn(`[WorkspaceView] Cannot send command for session ${currentSession.sessionId}, terminal manager or sendData method not available.`);
     // 可以考虑给用户一个提示
   }
 };
 
 // --- 新增：处理终端输入，包含重连逻辑 ---
 const handleTerminalInput = (sessionId: string, data: string) => {
   const session = sessionStore.sessions.get(sessionId); // 获取整个 session 对象
   const manager = session?.terminalManager as (SshTerminalInstance | undefined); // 获取 terminalManager 并断言类型
 
   if (!session || !manager) {
     console.warn(`[WorkspaceView] handleTerminalInput: 未找到会话 ${sessionId} 或其 terminalManager`);
     return;
   }
 
   // 检查是否按下回车且 SSH 未连接
   // 确保 manager.isSshConnected 存在再访问 .value
   if (data === '\r' && manager.isSshConnected && !manager.isSshConnected.value) {
     console.log(`[WorkspaceView] 检测到在断开的会话 ${sessionId} 中按下回车，尝试重连...`);
     // 可选：立即在终端显示提示 (需要 manager 暴露 terminalInstance)
     if (manager.terminalInstance?.value) {
         manager.terminalInstance.value.writeln(`\r\n\x1b[33m${t('workspace.terminal.reconnectingMsg')}\x1b[0m`);
     } else {
         console.warn(`[WorkspaceView] 无法写入重连提示，terminalInstance 不可用。`);
     }
     // 调用 sessionStore 中现有的重连逻辑
     sessionStore.handleConnectRequest(session.connectionId);
   } else {
     // 否则，正常处理输入
     manager.handleTerminalData(data);
   }
 };
 
 // --- 编辑器操作处理 ---
 const handleCloseEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value; // 在函数开始时获取模式
   console.log(`[WorkspaceView] handleCloseEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.closeTab(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value; // 获取当前的 activeSessionId
     if (currentActiveSessionId) {
       sessionStore.closeEditorTabInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot close editor tab: No active session in independent mode.');
     }
   }
 };

 const handleActivateEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value; // 在函数开始时获取模式
   console.log(`[WorkspaceView] handleActivateEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.setActiveTab(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value; // 获取当前的 activeSessionId
     if (currentActiveSessionId) {
       sessionStore.setActiveEditorTabInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot activate editor tab: No active session in independent mode.');
     }
   }
 };

 // 处理编辑器内容更新事件
 const handleUpdateEditorContent = (payload: { tabId: string; content: string }) => {
   const isShared = shareFileEditorTabsBoolean.value; // 在函数开始时获取模式
   console.log(`[WorkspaceView] handleUpdateEditorContent for tab ${payload.tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.updateFileContent(payload.tabId, payload.content);
   } else {
     const currentActiveSessionId = activeSessionId.value; // 获取当前的 activeSessionId
     if (currentActiveSessionId) {
       sessionStore.updateFileContentInSession(currentActiveSessionId, payload.tabId, payload.content);
     } else {
       console.warn('[WorkspaceView] Cannot update editor content: No active session in independent mode.');
     }
   }
 };

 // 处理编辑器保存请求事件
 const handleSaveEditorTab = (tabId: string) => {
   const isShared = shareFileEditorTabsBoolean.value; // 在函数开始时获取模式
   console.log(`[WorkspaceView] handleSaveEditorTab: ${tabId}, Shared mode: ${isShared}`);
   if (isShared) {
     fileEditorStore.saveFile(tabId);
   } else {
     const currentActiveSessionId = activeSessionId.value; // 获取当前的 activeSessionId
     if (currentActiveSessionId) {
       sessionStore.saveFileInSession(currentActiveSessionId, tabId);
     } else {
       console.warn('[WorkspaceView] Cannot save editor tab: No active session in independent mode.');
     }
   }
 };
</script>

<template>
  <div class="workspace-view">
    <TerminalTabBar
        :sessions="sessionTabsWithStatus"
        :active-session-id="activeSessionId"
        @activate-session="sessionStore.activateSession"
        @close-session="sessionStore.closeSession"
    />

    <div class="main-content-area">
      <!-- 最外层：左右分割 (连接列表 | 中间区域 | 编辑器 | 状态监视器) -->
      <splitpanes class="default-theme" :horizontal="false" style="height: 100%">

        <!-- 1. 左侧边栏 Pane (连接列表) -->
        <pane v-if="paneVisibility.connections" size="15" min-size="10" class="sidebar-pane"> <!-- 移除 pane-with-title class -->
          <WorkspaceConnectionListComponent
            class="pane-content"
            @connect-request="(id) => { console.log(`[WorkspaceView] Received 'connect-request' event for ID: ${id}`); sessionStore.handleConnectRequest(id); }"
            @open-new-session="(id) => { console.log(`[WorkspaceView] Received 'open-new-session' event for ID: ${id}`); sessionStore.handleOpenNewSession(id); }"
            @request-add-connection="() => { console.log('[WorkspaceView] Received \'request-add-connection\' event'); handleRequestAddConnection(); }"
            @request-edit-connection="(conn) => { console.log(`[WorkspaceView] Received 'request-edit-connection' event for connection:`, conn); handleRequestEditConnection(conn); }"
          />
        </pane>

        <!-- 新增：命令历史 Pane -->
        <pane v-if="paneVisibility.commandHistory" size="15" min-size="10" class="sidebar-pane command-history-pane">
          <CommandHistoryView class="pane-content" @execute-command="handleSendCommand" />
        </pane>

        <!-- 新增：快捷指令 Pane -->
        <pane v-if="paneVisibility.quickCommands" size="15" min-size="10" class="sidebar-pane quick-commands-pane">
          <QuickCommandsView class="pane-content" @execute-command="handleSendCommand" /> <!-- 监听事件 -->
        </pane>

        <!-- 2. 中间区域 Pane (终端/命令栏/文件管理器) - 这个 Pane 本身通常保持可见，内部 Pane 才切换 -->
        <pane size="30" min-size="20" class="middle-pane"> <!-- 再次调整中间区域大小 -->
           <!-- 上下分割 (终端 | 命令栏 | 文件管理器) -->
           <splitpanes :horizontal="true" style="height: 100%" :dbl-click-splitter="false">
              <!-- 上方 Pane (终端) -->
              <pane v-if="paneVisibility.terminal" size="55" min-size="20" class="terminal-pane"> <!-- 移除 pane-with-title class -->
                 <div class="pane-content terminal-content-wrapper"> <!-- 添加包裹 div -->
                   <div
                     v-for="tabInfo in sessionTabsWithStatus"
                     :key="tabInfo.sessionId"
                   v-show="tabInfo.sessionId === activeSessionId"
                   class="terminal-session-wrapper"
                 >
                   <TerminalComponent
                     :key="tabInfo.sessionId"
                      :session-id="tabInfo.sessionId"
                      :is-active="tabInfo.sessionId === activeSessionId"
                      @ready="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalReady"
                      @data="(data) => handleTerminalInput(tabInfo.sessionId, data)"
                      @resize="(dims) => { console.log(`[工作区视图 ${tabInfo.sessionId}] 收到 resize 事件:`, dims); sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalResize(dims); }"
                   />
                   </div>
                   <div v-if="!activeSessionId" class="terminal-placeholder">
                     <h2>{{ t('workspace.selectConnectionPrompt') }}</h2>
                     <p>{{ t('workspace.selectConnectionHint') }}</p>
                   </div>
                 </div>
              </pane> <!-- End Terminal Pane -->

              <!-- 中间 Pane (命令栏) - 移除标题栏，但保留 v-if -->
              <pane v-if="paneVisibility.commandBar" size="5" min-size="5" class="command-bar-pane">
                 <CommandInputBar
                   v-if="activeSessionId"
                   @send-command="handleSendCommand"
                 />
              </pane> <!-- End Command Bar Pane -->

              <!-- 下方 Pane (文件管理器区域 - 包含新的水平分割) -->
              <pane v-if="paneVisibility.fileManager" size="40" min-size="15" class="file-manager-area-pane"> <!-- 移除 pane-with-title class -->
                <!-- 新增：内部水平分割，允许未来添加列 -->
                <splitpanes :horizontal="false" style="height: 100%" :dbl-click-splitter="false" class="pane-content"> <!-- 添加 class -->
                  <!-- 初始的文件管理器 Pane -->
                  <pane class="file-manager-pane"> <!-- 这个内部 pane 不需要 title bar -->
                    <div
                      v-for="tabInfo in sessionTabsWithStatus"
                      :key="tabInfo.sessionId + '-fm-wrapper'"
                   v-show="tabInfo.sessionId === activeSessionId"
                   class="file-manager-wrapper"
                 >
                   <FileManagerComponent
                     v-if="sessionStore.sessions.get(tabInfo.sessionId)"
                     :key="tabInfo.sessionId + '-fm'"
                     :session-id="tabInfo.sessionId"
                     :db-connection-id="sessionStore.sessions.get(tabInfo.sessionId)!.connectionId"
                     :sftp-manager="sessionStore.sessions.get(tabInfo.sessionId)!.sftpManager"
                     :ws-deps="{
                       sendMessage: sessionStore.sessions.get(tabInfo.sessionId)!.wsManager.sendMessage,
                       onMessage: sessionStore.sessions.get(tabInfo.sessionId)!.wsManager.onMessage,
                       isConnected: sessionStore.sessions.get(tabInfo.sessionId)!.wsManager.isConnected,
                       isSftpReady: sessionStore.sessions.get(tabInfo.sessionId)!.wsManager.isSftpReady
                     }"
                   />
                    </div>
                    <div v-if="!activeSessionId" class="pane-placeholder">{{ t('fileManager.noActiveSession') }}</div>
                  </pane> <!-- End Inner File Manager Pane -->
                  <!-- 这里可以将来添加其他 Pane -->
                </splitpanes> <!-- End Inner Horizontal Splitpanes -->
              </pane> <!-- End File Manager Area Pane -->
           </splitpanes> <!-- End Middle Area Vertical Splitpanes -->
        </pane> <!-- End Middle Pane -->

        <!-- 3. 右侧区域 1 Pane (文件编辑器) -->
        <pane v-if="paneVisibility.editor" size="20" min-size="15" class="file-editor-pane"> <!-- 移除 pane-with-title class -->
           <FileEditorContainer
             class="pane-content"
             :tabs="editorTabs"
             :active-tab-id="activeEditorTabId"
             :session-id="activeSessionId" 
             @close-tab="handleCloseEditorTab"
             @activate-tab="handleActivateEditorTab"
             @update:content="handleUpdateEditorContent" 
             @request-save="handleSaveEditorTab" 
           />
        </pane>

        <!-- 4. 右侧区域 2 Pane (状态监视器) -->
        <pane v-if="paneVisibility.statusMonitor" size="15" min-size="10" class="sidebar-pane status-monitor-pane"> <!-- 移除 pane-with-title class -->
           <div class="pane-content status-monitor-content-wrapper"> <!-- 添加包裹 div -->
             <div
               v-for="tabInfo in sessionTabsWithStatus"
               :key="tabInfo.sessionId + '-sm-wrapper'"
             v-show="tabInfo.sessionId === activeSessionId"
             class="status-monitor-wrapper"
           >
             <StatusMonitorComponent
               v-if="sessionStore.sessions.get(tabInfo.sessionId)"
               :key="tabInfo.sessionId + '-sm'"
               :session-id="tabInfo.sessionId"
               :server-status="sessionStore.sessions.get(tabInfo.sessionId)!.statusMonitorManager.serverStatus.value"
               :status-error="sessionStore.sessions.get(tabInfo.sessionId)!.statusMonitorManager.statusError.value"
             />
             </div>
             <div v-if="!activeSessionId" class="pane-placeholder">{{ t('statusMonitor.noActiveSession') }}</div>
           </div>
        </pane>

      </splitpanes>
    </div>

    <!-- 添加/编辑连接表单模态框 (保持不变) -->
    <AddConnectionFormComponent
      v-if="showAddEditForm"
      :connection-to-edit="connectionToEdit"
      @close="handleFormClose"
      @connection-added="handleConnectionAdded"
      @connection-updated="handleConnectionUpdated"
    />
  </div>
</template>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px - 30px - 2rem); /* 恢复原始高度计算 */
  overflow: hidden;
}

/* 移除 fixed-command-bar 样式 */

.main-content-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    border-top: 1px solid #ccc;
}

/* 为 Pane 添加一些基本样式 */
/* .pane-with-title 已移除 */
.pane-content { /* 让内容区域填充剩余空间 */
  flex-grow: 1;
  overflow: auto; /* 或者 hidden，根据需要 */
  display: flex; /* 内部可能还需要 flex 布局 */
  flex-direction: column; /* 默认列方向 */
}

.sidebar-pane, /* 用于左右侧边栏 */
.middle-pane, /* 中间包含终端、命令栏、文件管理器的 Pane */
.terminal-pane,
.command-bar-pane,
.file-editor-pane, /* 编辑器窗格样式 */
.file-manager-area-pane, /* 文件管理器区域 Pane */
.file-manager-pane, /* 内部文件管理器 Pane */
.status-monitor-pane, /* 状态监视器样式 */
.command-history-pane, /* 命令历史窗格样式 */
.quick-commands-pane { /* 快捷指令窗格样式 */
  display: flex; /* 确保 flex 布局 */
  flex-direction: column; /* 确保列方向 */
  overflow: hidden; /* 默认隐藏溢出 */
  background-color: #f8f9fa; /* 默认背景色 */
}
.middle-pane {
    padding: 0; /* 移除 middle-pane 的内边距 */
}

/* 命令栏 Pane 特定样式 - 恢复原样 */
.command-bar-pane {
  background-color: #e9ecef; /* 背景色 */
  /* justify-content: center; /* 垂直居中输入框 - 移除此行 */
  overflow: hidden; /* 内容不应超出 */
  display: flex; /* 确保 flex 布局 */
  align-items: center; /* 垂直居中 */
}
/* 调整内部 CommandInputBar 样式 - 恢复原样 */
.command-bar-pane > .command-input-bar {
    border: none;
    background-color: transparent;
    min-height: auto;
    padding: 2px 0; /* 移除水平内边距 */
    flex-grow: 1; /* 让输入框填充 */
    width: 80%; /* 显式设置宽度为100% */
}

.terminal-pane {
    background-color: #f8f9fa; /* 外层 pane 背景 */
    /* position: relative; 由内部 wrapper 处理 */
}
.terminal-content-wrapper {
    background-color: #1e1e1e; /* 终端实际背景 */
    position: relative; /* 用于占位符 */
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* <-- 重新添加，隐藏外部滚动条 */
}
.file-editor-pane {
    background-color: #f8f9fa; /* 外层 pane 背景 */
}
/* FileEditorContainer 自身需要 flex-grow: 1 */
.file-editor-pane > .pane-content {
    background-color: #2d2d2d; /* 编辑器容器背景 */
}

.file-manager-area-pane {
    padding: 0;
    background-color: #f8f9fa; /* 外层 pane 背景 */
}
/* 内部的 splitpanes 需要 flex-grow: 1 */
.file-manager-area-pane > .pane-content {
    background-color: #f0f0f0; /* 内部区域背景 */
}
.file-manager-pane { /* 内部文件管理器 Pane */
    background-color: #ffffff; /* 文件管理器使用浅色背景 */
    display: flex; /* 确保内部 flex 布局 */
    flex-direction: column;
    overflow: hidden;
}
.status-monitor-pane {
    background-color: #f8f9fa; /* 外层 pane 背景 */
     /* text-align: center; 由内部 wrapper 处理 */
     /* padding: 1rem; 由内部 wrapper 处理 */
}
.command-history-pane {
    background-color: #f8f9fa; /* 与其他侧边栏一致 */
}
.quick-commands-pane {
    background-color: #f8f9fa; /* 与其他侧边栏一致 */
}
.status-monitor-content-wrapper {
    text-align: center;
    padding: 1rem;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: auto; /* 允许内容滚动 */
}


/* 终端会话包装器 */
.terminal-session-wrapper {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* <-- 重新添加，隐藏外部滚动条 */
}

/* 文件管理器包装器 (内部组件应填充) */
.file-manager-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* 状态监视器包装器 (内部组件应填充) */
.status-monitor-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* 内部组件自己处理滚动 */
}

/* 终端占位符 */
.terminal-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #6c757d;
    padding: 2rem;
    background-color: #f8f9fa; /* 与 pane 背景一致 */
}
.terminal-placeholder h2 {
    margin-bottom: 0.5rem;
    font-weight: 300;
    color: #495057;
}
.terminal-placeholder p {
    font-size: 1em;
}

/* 面板占位符样式 */
.pane-placeholder {
    flex-grow: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #adb5bd;
    background-color: #f8f9fa;
    font-size: 0.9em;
    padding: 1rem;
}

/* Splitpanes 默认主题样式调整 */
.splitpanes.default-theme .splitpanes__splitter {
  background-color: #ccc;
  box-sizing: border-box;
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid #eee; /* 可选：添加细微边框 */
  border-right: 1px solid #eee;
}
.splitpanes--vertical > .splitpanes__splitter {
  width: 7px; /* 垂直分割线宽度 */
  cursor: col-resize;
}
.splitpanes--horizontal > .splitpanes__splitter {
  height: 7px; /* 水平分割线高度 */
  cursor: row-resize;
}
.splitpanes.default-theme .splitpanes__splitter:before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  transition: opacity 0.4s;
  background-color: rgba(0, 0, 0, 0.15);
  opacity: 0;
  z-index: 1;
}
.splitpanes.default-theme .splitpanes__splitter:hover:before {
  opacity: 1;
}
.splitpanes.default-theme.splitpanes--vertical > .splitpanes__splitter:before {
  left: 2px; /* 调整指示器位置 */
  right: 2px;
  height: 100%;
}
.splitpanes.default-theme.splitpanes--horizontal > .splitpanes__splitter:before {
  top: 2px; /* 调整指示器位置 */
  bottom: 2px;
  width: 100%;
}

/* 尝试提高中间区域水平分割线的 z-index */
.middle-pane .splitpanes--horizontal > .splitpanes__splitter {
  z-index: 10; /* 确保分割线在内容之上 */
}
</style>
