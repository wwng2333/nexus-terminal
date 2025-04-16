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
import CommandInputBar from '../components/CommandInputBar.vue'; // 导入新组件
import { useSessionStore, type SessionTabInfoWithStatus, type SshTerminalInstance } from '../stores/session.store'; // 导入 SshTerminalInstance
import type { ConnectionInfo } from '../stores/connections.store';
// 导入 splitpanes 组件
import { Splitpanes, Pane } from 'splitpanes';
// 导入管理器实例类型，用于 FileManagerComponent 的 prop 类型断言
// import type { SftpManagerInstance } from '../stores/session.store'; // SftpManagerInstance 已在上面导入

// --- Setup ---
const { t } = useI18n();
const sessionStore = useSessionStore();

// --- 从 Store 获取响应式状态和 Getters ---
const { sessionTabsWithStatus, activeSessionId, activeSession } = storeToRefs(sessionStore);

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
   // 类型断言确保 terminalManager 存在 sendData 方法
   const terminalManager = activeSession.value?.terminalManager as (SshTerminalInstance | undefined);
   if (terminalManager && typeof terminalManager.sendData === 'function') {
     console.log(`[WorkspaceView] Sending command to active session ${activeSessionId.value}: ${command.trim()}`);
     // 注意：CommandInputBar 已经添加了 '\n'
     terminalManager.sendData(command);
   } else {
     console.warn('[WorkspaceView] Cannot send command, no active session or terminal manager with sendData method.');
     // 可以考虑给用户一个提示
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
      <!-- 最外层：左右分割 (连接列表 | 中间区域 + 右侧区域) -->
      <splitpanes class="default-theme" :horizontal="false" style="height: 100%">

        <!-- 左侧边栏 Pane -->
        <pane size="20" min-size="15" class="sidebar-pane">
          <WorkspaceConnectionListComponent
            @connect-request="(id) => { console.log(`[WorkspaceView] Received 'connect-request' event for ID: ${id}`); sessionStore.handleConnectRequest(id); }"
            @open-new-session="(id) => { console.log(`[WorkspaceView] Received 'open-new-session' event for ID: ${id}`); sessionStore.handleOpenNewSession(id); }"
            @request-add-connection="() => { console.log('[WorkspaceView] Received \'request-add-connection\' event'); handleRequestAddConnection(); }"
            @request-edit-connection="(conn) => { console.log(`[WorkspaceView] Received 'request-edit-connection' event for connection:`, conn); handleRequestEditConnection(conn); }"
          />
        </pane>

        <!-- 中间区域 Pane (包含终端、命令栏、文件管理器) -->
        <pane size="65" min-size="30" class="middle-pane">
           <!-- 上下分割 (终端 | 命令栏 | 文件管理器) - 禁用双击分割线行为 -->
           <splitpanes :horizontal="true" style="height: 100%" :dbl-click-splitter="false">
              <!-- 上方 Pane (终端) -->
              <pane size="60" min-size="20" class="terminal-pane">
                 <!-- 会话终端区域: 只渲染活动会话的终端 -->
                 <div
                   v-for="tabInfo in sessionTabsWithStatus"
                   :key="tabInfo.sessionId"
                   v-show="tabInfo.sessionId === activeSessionId"
                   class="terminal-session-wrapper"
                 >
                   <!-- 移除 v-if，依赖外层 v-show 控制显隐 -->
                   <!-- :key 绑定到 tabInfo.sessionId 保证每个会话对应唯一组件实例 -->
                   <!-- :is-active 动态绑定 -->
                   <TerminalComponent
                     :key="tabInfo.sessionId"
                      :session-id="tabInfo.sessionId"
                      :is-active="tabInfo.sessionId === activeSessionId"
                      @ready="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalReady"
                      @data="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalData"
                      @resize="(dims) => { console.log(`[工作区视图 ${tabInfo.sessionId}] 收到 resize 事件:`, dims); sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalResize(dims); }"
                   />
                 </div>
                 <!-- 终端占位符 -->
                 <div v-if="!activeSessionId" class="terminal-placeholder">
                   <h2>{{ t('workspace.selectConnectionPrompt') }}</h2>
                   <p>{{ t('workspace.selectConnectionHint') }}</p>
                 </div>
              </pane> <!-- End Terminal Pane -->

              <!-- 中间 Pane (命令栏) - 恢复，仅设置 min-size -->
              <pane size="5" min-size="5" class="command-bar-pane">
                 <CommandInputBar
                   v-if="activeSessionId"
                   @send-command="handleSendCommand"
                 />
              </pane> <!-- End Command Bar Pane -->

              <!-- 下方 Pane (文件管理器) - 恢复原始 size -->
              <pane size="35" min-size="15" class="file-manager-pane">
                 <!-- 为每个会话渲染文件管理器实例，用 v-show 控制 -->
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
                 <!-- 文件管理器占位符 -->
                 <div v-if="!activeSessionId" class="pane-placeholder">{{ t('fileManager.noActiveSession') }}</div>
              </pane>
           </splitpanes> <!-- End Terminal/FM Splitpanes -->
        </pane> <!-- End Middle Pane -->

        <!-- 右侧边栏 Pane (状态监视器) - 添加 status-monitor-pane 类 -->
        <pane size="15" min-size="10" class="sidebar-pane status-monitor-pane">
           <!-- 为每个会话渲染状态监视器实例，用 v-show 控制 -->
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
           <!-- 状态监视器占位符 -->
           <div v-if="!activeSessionId" class="pane-placeholder">{{ t('statusMonitor.noActiveSession') }}</div>
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
.sidebar-pane, /* 用于左右侧边栏 */
.middle-pane, /* 中间包含终端、命令栏、文件管理器的 Pane */
.terminal-pane,
.command-bar-pane, /* 命令栏 Pane */
.file-manager-pane {
  display: flex; /* 确保 Pane 内容可以正确布局 */
  flex-direction: column;
  overflow: hidden; /* Pane 内部内容溢出时隐藏 */
  background-color: #f8f9fa; /* 默认背景色 */
}
.middle-pane {
    padding: 0; /* 移除 middle-pane 的内边距 */
}

/* 命令栏 Pane 特定样式 - 添加 max-height */
.command-bar-pane {
  background-color: #e9ecef; /* 背景色 */
  justify-content: center; /* 垂直居中输入框 */
  max-height: 200px; /* 使用 CSS 限制最大高度，例如 200px */
  overflow: auto; /* 如果内容超出，允许滚动 */
}
/* 调整内部 CommandInputBar 样式 */
.command-bar-pane > .command-input-bar {
    border: none; /* 移除 CommandInputBar 的边框 */
    background-color: transparent; /* 移除 CommandInputBar 的背景 */
    min-height: auto; /* 移除最小高度 */
    padding: 2px 10px; /* 调整内边距 */
}

.terminal-pane {
    background-color: #1e1e1e; /* 终端背景 */
    position: relative; /* 保持相对定位用于占位符 */
}
.file-manager-pane {
    /* 分隔线由 splitpanes 提供 */
}

/* 终端会话包装器 */
.terminal-session-wrapper {
    flex-grow: 1; /* 填充 terminal-pane */
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
    display: flex; /* 使内部 StatusMonitorComponent 可以填充 */
    flex-direction: column;
    overflow: hidden;
}

/* 新增：状态监视器 Pane 样式，使其内容居中 */
.status-monitor-pane {
    /* 尝试使用 flex 居中，如果 StatusMonitorComponent 本身是块级元素 */
    /* display: flex; */
    /* justify-content: center; */
    /* align-items: center; */

    /* 或者如果内容主要是文本，可以尝试 text-align */
     text-align: center; /* 尝试文本居中 */
     padding: 1rem; /* 添加一些内边距 */
}
.status-monitor-pane > .status-monitor-wrapper {
    /* 如果需要包装器也居中（如果它不是 flex: 1 的话） */
    /* margin: auto; */
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
