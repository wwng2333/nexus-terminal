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
import { useSessionStore, type SessionTabInfoWithStatus } from '../stores/session.store';
import type { ConnectionInfo } from '../stores/connections.store';
// 导入 splitpanes 组件
import { Splitpanes, Pane } from 'splitpanes';
// 导入管理器实例类型，用于 FileManagerComponent 的 prop 类型断言
import type { SftpManagerInstance } from '../stores/session.store';

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
            @connect-request="sessionStore.handleConnectRequest"
            @open-new-session="sessionStore.handleOpenNewSession"
            @request-add-connection="handleRequestAddConnection"
            @request-edit-connection="handleRequestEditConnection"
          />
        </pane>

        <!-- 中间区域 Pane (包含终端和文件管理器) -->
        <pane size="65" min-size="30">
           <!-- 上下分割 (终端 | 文件管理器) -->
           <splitpanes :horizontal="true" style="height: 100%">
              <!-- 终端 Pane -->
              <pane size="65" min-size="20" class="terminal-pane">
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
                 <!-- 终端占位符 -->
                 <div v-if="!activeSessionId" class="terminal-placeholder">
                   <h2>{{ t('workspace.selectConnectionPrompt') }}</h2>
                   <p>{{ t('workspace.selectConnectionHint') }}</p>
                 </div>
              </pane>
              <!-- 文件管理器 Pane -->
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
           </splitpanes>
        </pane>

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
  height: calc(100vh - 60px - 30px - 2rem); /* 调整以适应您的 header/footer/padding */
  overflow: hidden;
}

.main-content-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    border-top: 1px solid #ccc;
}

/* 为 Pane 添加一些基本样式 */
.sidebar-pane, /* 用于左右侧边栏 */
.terminal-pane,
.file-manager-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Pane 内部内容溢出时隐藏 */
  background-color: #f8f9fa; /* 默认背景色 */
}
.terminal-pane {
    background-color: #1e1e1e; /* 终端背景 */
    position: relative; /* 保持相对定位用于占位符 */
}
.file-manager-pane {
    border-top: 1px solid #ccc; /* 终端和文件管理器之间的分隔线 */
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
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
</style>
