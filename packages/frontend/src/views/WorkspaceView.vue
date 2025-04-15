<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'; // 移除不再需要的导入
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
import TerminalComponent from '../components/Terminal.vue';
import FileManagerComponent from '../components/FileManager.vue';
import StatusMonitorComponent from '../components/StatusMonitor.vue';
import WorkspaceConnectionListComponent from '../components/WorkspaceConnectionList.vue';
import AddConnectionFormComponent from '../components/AddConnectionForm.vue';
import TerminalTabBar from '../components/TerminalTabBar.vue';
import { useSessionStore } from '../stores/session.store'; // 导入 Session Store
import type { ConnectionInfo } from '../stores/connections.store'; // 保持 ConnectionInfo 类型导入
// 导入管理器实例类型，用于 FileManagerComponent 的 prop 类型断言
import type { SftpManagerInstance } from '../stores/session.store';

// --- Setup ---
const { t } = useI18n();
const sessionStore = useSessionStore();

// --- 从 Store 获取响应式状态和 Getters ---
// 使用 storeToRefs 保持响应性，或者直接在模板中使用 sessionStore.xxx
const { sessionTabs, activeSessionId, activeSession } = storeToRefs(sessionStore);

// --- UI 状态 (保持本地) ---
const showAddEditForm = ref(false);
const connectionToEdit = ref<ConnectionInfo | null>(null);

// --- 生命周期钩子 ---
onMounted(() => {
  console.log('[工作区视图] 组件已挂载。');
  // 可以在这里执行一些初始化操作，如果需要的话
});

onBeforeUnmount(() => {
  console.log('[工作区视图] 组件即将卸载，清理所有会话...');
  sessionStore.cleanupAllSessions(); // 调用 store action 清理
});

// --- 监听器 (如果需要监听 store 状态变化) ---
// watch(activeSessionId, (newSessionId, oldSessionId) => {
//     console.log(`[工作区视图] 活动会话 ID 从 ${oldSessionId} 更改为 ${newSessionId}`);
//     if (newSessionId) {
//         nextTick(() => {
//             // TODO: 聚焦到活动会话的终端 (此逻辑可能移至 Store 或保留在此处)
//             console.log(`[工作区视图] TODO: 聚焦会话 ${newSessionId} 的终端`);
//         });
//     }
// });

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

 // --- 移除本地会话管理函数 ---
 // findConnectionInfo, openNewSession, activateSession, closeSession,
 // handleConnectRequest, handleOpenNewSession 已移至 sessionStore

 </script>

<template>
  <div class="workspace-view">
    <!-- 标签栏: 绑定到 store 的状态和 actions -->
    <TerminalTabBar
        :sessions="sessionTabs"
        :active-session-id="activeSessionId"
        @activate-session="sessionStore.activateSession"
        @close-session="sessionStore.closeSession"
    />

    <div class="status-bar">
      <!-- 状态栏显示活动会话的信息: 从 store getter 获取 -->
      {{ t('workspace.statusBar', {
           status: activeSession?.wsManager.statusMessage.value ?? t('workspace.status.disconnected'),
           id: activeSession?.connectionId ?? t('workspace.noActiveSession')
         })
      }}
      <!-- 从 activeSession getter 获取连接状态 -->
      <span :class="`status-${activeSession?.wsManager.connectionStatus.value ?? 'disconnected'}`"></span>
    </div>
    <div class="main-content-area">
      <!-- 左侧边栏: 事件绑定到 store actions -->
      <div class="left-sidebar">
        <WorkspaceConnectionListComponent
          @connect-request="sessionStore.handleConnectRequest"
          @open-new-session="sessionStore.handleOpenNewSession"
          @request-add-connection="handleRequestAddConnection"
          @request-edit-connection="handleRequestEditConnection"
        />
      </div>
      <!-- 主工作区容器 -->
      <div class="main-workspace-container">
        <!-- 会话区域: 循环 store 中的 sessions Map -->
        <!-- 注意: v-for sessions.values() 可能不是响应式的，因为 sessions 是 shallowRef -->
        <!-- 改为 v-for session in sessionTabs，然后通过 session.sessionId 获取完整 session -->
        <div
          v-for="tabInfo in sessionTabs"
          :key="tabInfo.sessionId"
          v-show="tabInfo.sessionId === activeSessionId"
          class="main-workspace-area-session"
        >
          <!-- 获取当前循环的完整 session 对象 -->
          <template v-if="sessionStore.sessions.get(tabInfo.sessionId)">
            <div class="left-pane">
              <div class="terminal-wrapper" :data-session-id="tabInfo.sessionId">
                <!-- TerminalComponent: 事件绑定到 activeSession 的管理器方法 -->
                <TerminalComponent
                  :key="tabInfo.sessionId"
                  :session-id="tabInfo.sessionId"
                  :is-active="tabInfo.sessionId === activeSessionId"
                  @ready="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalReady"
                  @data="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalData"
                  @resize="sessionStore.sessions.get(tabInfo.sessionId)?.terminalManager.handleTerminalResize"
                />
              </div>
              <div class="file-manager-wrapper">
                <!-- FileManagerComponent: Props 绑定到 activeSession 的管理器 -->
                <!-- 确保传递正确的 wsDeps -->
                <FileManagerComponent
                  :key="tabInfo.sessionId"
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
            </div>
            <div class="status-monitor-wrapper">
              <!-- StatusMonitorComponent: Props 绑定到 activeSession 的管理器状态 -->
              <StatusMonitorComponent
                :key="tabInfo.sessionId"
                :session-id="tabInfo.sessionId"
                :server-status="(sessionStore.sessions.get(tabInfo.sessionId)?.statusMonitorManager.serverStatus.value) ?? null"
                :status-error="(sessionStore.sessions.get(tabInfo.sessionId)?.statusMonitorManager.statusError.value) ?? null"
              />
            </div>
          </template>
        </div>
        <!-- 占位符 -->
        <div v-if="!activeSessionId" class="main-workspace-area placeholder">
          <h2>{{ t('workspace.selectConnectionPrompt') }}</h2>
          <p>{{ t('workspace.selectConnectionHint') }}</p>
        </div>
      </div>
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
  height: calc(100vh - 60px - 30px - 60px - 2rem); /* 调整以适应布局 */
  overflow: hidden;
}

.status-bar {
  padding: 0.5rem 1rem;
  background-color: #eee;
  border-bottom: 1px solid #ccc;
  font-size: 0.9rem;
  color: #333;
}

.status-connecting { color: orange; }
.status-connected { color: green; }
.status-disconnected { color: grey; }
.status-error { color: red; }

.main-content-area {
    display: flex;
    flex-grow: 1;
    overflow: hidden;
    border-top: 1px solid #ccc;
}

.left-sidebar {
    width: 250px;
    min-width: 200px;
    height: 100%;
    border-right: 2px solid #ccc;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.left-sidebar > * {
    flex-grow: 1;
}

.main-workspace-container {
    flex-grow: 1;
    position: relative;
    overflow: hidden;
    display: flex;
}

.main-workspace-area-session {
    width: 100%;
    height: 100%;
    display: flex;
    overflow: hidden;
}

.left-pane {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    height: 100%;
    min-width: 300px;
}

.terminal-wrapper {
  height: 60%;
  background-color: #1e1e1e;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.terminal-wrapper > * {
    flex-grow: 1;
}

.file-manager-wrapper {
    height: 40%;
    border-top: 2px solid #ccc;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.file-manager-wrapper > * {
    flex-grow: 1;
}

.status-monitor-wrapper {
    flex-basis: 250px;
    min-width: 200px;
    height: 100%;
    border-left: 2px solid #ccc;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.status-monitor-wrapper > * {
    flex-grow: 1;
}

.main-workspace-area.placeholder {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #6c757d;
    padding: 2rem;
    background-color: #f8f9fa;
}
.main-workspace-area.placeholder h2 {
    margin-bottom: 0.5rem;
    font-weight: 300;
    color: #495057;
}
.main-workspace-area.placeholder p {
    font-size: 1em;
}
</style>
