<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'; // 移除 computed, useRoute, useRouter
import { useI18n } from 'vue-i18n';
import TerminalComponent from '../components/Terminal.vue';
import FileManagerComponent from '../components/FileManager.vue';
import StatusMonitorComponent from '../components/StatusMonitor.vue';
import WorkspaceConnectionListComponent from '../components/WorkspaceConnectionList.vue';
import AddConnectionFormComponent from '../components/AddConnectionForm.vue'; // 引入表单组件
import type { ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 类型
import type { Terminal } from 'xterm';
import { useWebSocketConnection } from '../composables/useWebSocketConnection';
import { useSshTerminal } from '../composables/useSshTerminal'; // 导入 SSH 终端模块
import { useStatusMonitor } from '../composables/useStatusMonitor';
import type { ServerStatus } from '../types/server.types';
// import { useConnectionsStore } from '../stores/connections.store'; // 不再直接在此处使用 store
// import { storeToRefs } from 'pinia'; // 不再直接在此处使用 storeToRefs

// --- 接口定义 ---
// ServerStatus 现在从 types/server.types.ts 导入

const { t } = useI18n();

// --- 内部状态 ---
const activeConnectionId = ref<string | null>(null);
const showAddEditForm = ref(false); // 控制表单模态框显示
const connectionToEdit = ref<ConnectionInfo | null>(null); // 要编辑的连接

// --- 连接 Store (不再需要在此处直接引用 connections, loading, error) ---
// const connectionsStore = useConnectionsStore();
// const { connections, isLoading: connectionsLoading, error: connectionsError } = storeToRefs(connectionsStore);

// --- WebSocket 连接模块 ---
const {
    isConnected,
    connectionStatus, // Get reactive status from composable
    statusMessage,    // Get reactive status message from composable
    connect,
    disconnect,
    sendMessage,
    onMessage,
} = useWebSocketConnection();

// --- SSH 终端模块 ---
const {
    // terminalInstance, // 不再需要直接从这里访问
    handleTerminalReady,
    handleTerminalData,
    handleTerminalResize,
    registerSshHandlers,
    unregisterAllSshHandlers,
} = useSshTerminal();

// --- 状态监控模块 ---
const {
    serverStatus, // 从 composable 获取状态
    statusError,  // 从 composable 获取错误
    registerStatusHandlers, // 重命名以避免与 SSH 冲突
    unregisterAllStatusHandlers, // 重命名以避免与 SSH 冲突
} = useStatusMonitor();


// --- 生命周期钩子 ---
onMounted(() => {
  // 组件挂载时不自动连接，等待用户选择
  // if (activeConnectionId.value) {
  //   const wsUrl = `ws://${window.location.hostname}:3001`;
  //   connect(wsUrl, activeConnectionId.value);
    // 不在此处立即注册，等待 isConnected 变为 true
    // registerSshHandlers();
    // registerStatusHandlers();
  // } else {
    // console.log('[工作区视图] 没有活动的连接 ID。'); // 不再是错误
  // }
});

onBeforeUnmount(() => {
  disconnect(); // 使用 WebSocket 模块的 disconnect
  unregisterAllSshHandlers(); // 注销 SSH 终端处理器
  unregisterAllStatusHandlers(); // 使用状态监控模块的注销函数
});

// 监听 activeConnectionId 变化以处理连接切换
watch(activeConnectionId, (newId, oldId) => {
    console.log(`[工作区视图] 活动连接 ID 从 ${oldId} 更改为 ${newId}`);
    // 断开旧连接 (如果存在)
    if (oldId) {
        disconnect(); // isConnected 会变为 false，触发清理
    }
    // 连接新的 WebSocket (如果新 ID 有效)
    if (newId) {
        console.log(`[工作区视图] 正在连接到 ID: ${newId}...`);
        const wsUrl = `ws://${window.location.hostname}:3001`;
        connect(wsUrl, newId); // connect 会处理 isConnected 状态
    }
    // 注意：处理器的注册/注销现在完全由 isConnected 的 watch 驱动
});

// 监听 WebSocket 连接状态变化来注册/注销处理器
watch(isConnected, (connected) => {
    if (connected) {
        console.log('[工作区视图] WebSocket 已连接，注册 SSH 和状态处理器。');
        registerSshHandlers();
        registerStatusHandlers();
    } else {
        console.log('[工作区视图] WebSocket 已断开，注销 SSH 和状态处理器。');
        // isConnected 变为 false 时，确保清理
        unregisterAllSshHandlers();
        unregisterAllStatusHandlers();
        // 注意：disconnect() 应该在 connectionId 变化或组件卸载时调用，
        // isConnected 变为 false 是结果，而不是原因。
    }
});

 // 辅助函数：获取终端消息文本 (已移至 useSshTerminal)

 // --- 连接列表点击处理 ---
 const handleConnectRequest = (id: number | string) => {
   console.log(`[工作区视图] 请求激活连接 ID: ${id}`);
   activeConnectionId.value = String(id);
 };

 // --- 表单模态框处理 ---
 const handleRequestAddConnection = () => {
   connectionToEdit.value = null; // 确保是添加模式
   showAddEditForm.value = true;
 };

 const handleRequestEditConnection = (connection: ConnectionInfo) => {
   connectionToEdit.value = connection; // 设置要编辑的连接
   showAddEditForm.value = true;
 };

 const handleFormClose = () => {
   showAddEditForm.value = false;
   connectionToEdit.value = null; // 清除编辑状态
 };

 const handleConnectionAdded = () => {
   console.log('[工作区视图] 连接已添加');
   handleFormClose();
   // WorkspaceConnectionList 会自动从 store 更新
 };

 const handleConnectionUpdated = () => {
   console.log('[工作区视图] 连接已更新');
   handleFormClose();
   // WorkspaceConnectionList 会自动从 store 更新
 };

 </script>

<template>
  <div class="workspace-view">
    <div class="status-bar">
      <!-- 使用 t 函数渲染状态栏文本, 显示 activeConnectionId -->
      {{ t('workspace.statusBar', { status: statusMessage, id: activeConnectionId ?? 'N/A' }) }}
      <!-- 状态颜色仍然通过 class 绑定 -->
      <!-- 使用来自 useWebSocketConnection 的状态 -->
      <span :class="`status-${connectionStatus}`"></span>
    </div>
    <div class="main-content-area">
      <!-- 新增左侧边栏 -->
      <div class="left-sidebar">
        <!-- 监听新的事件 -->
        <WorkspaceConnectionListComponent
          @connect-request="handleConnectRequest"
          @request-add-connection="handleRequestAddConnection"
          @request-edit-connection="handleRequestEditConnection"
        />
      </div>
      <!-- 主工作区 (添加 v-if/v-else), 条件改为 activeConnectionId -->
      <div v-if="activeConnectionId" class="main-workspace-area">
        <div class="left-pane">
          <div class="terminal-wrapper">
            <!-- 将事件绑定到 useSshTerminal 的处理函数 -->
          <TerminalComponent
            @ready="handleTerminalReady"
            @data="handleTerminalData"
              @resize="handleTerminalResize"
            />
          </div>
          <!-- 文件管理器窗格 -->
          <div class="file-manager-wrapper">
             <!-- Removed :ws prop. Communication will be handled via composables -->
             <FileManagerComponent :is-connected="isConnected" />
          </div>
        </div>
        <!-- 状态监控窗格 -->
        <div class="status-monitor-wrapper">
          <StatusMonitorComponent :status-data="serverStatus" :error="statusError" />
        </div>
      </div>
      <!-- 当没有 connectionId 时显示提示 -->
      <div v-else class="main-workspace-area placeholder">
        <h2>{{ t('workspace.selectConnectionPrompt') }}</h2>
        <p>{{ t('workspace.selectConnectionHint') }}</p>
      </div>
    </div>

    <!-- 添加/编辑连接表单模态框 -->
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
  /* 调整高度计算以适应可能的 header/footer/status-bar */
  height: calc(100vh - 60px - 30px - 2rem); /* 假设 header 60px, footer 30px, padding 2rem */
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
    flex-grow: 1; /* Take remaining vertical space */
    overflow: hidden;
    /* 新增样式 */
    border-top: 1px solid #ccc; /* Add a top border for separation */
}

/* 新增左侧边栏样式 */
.left-sidebar {
    width: 250px; /* 示例宽度 */
    min-width: 200px; /* 最小宽度 */
    height: 100%;
    border-right: 2px solid #ccc;
    overflow-y: auto; /* 如果列表过长则允许滚动 */
    display: flex;
    flex-direction: column;
}
.left-sidebar > * {
    flex-grow: 1; /* 让 WorkspaceConnectionList 填充 */
}


/* 主工作区容器 */
.main-workspace-area {
    flex-grow: 1; /* 占据剩余空间 */
    display: flex;
    height: 100%;
    overflow: hidden;
}

.left-pane {
    display: flex;
    flex-direction: column;
    /* width: 80%; */ /* 不再固定宽度，改为 flex */
    flex-grow: 1; /* 占据主工作区大部分空间 */
    height: 100%;
    min-width: 300px; /* 保证终端和文件管理器有最小宽度 */
}

.terminal-wrapper {
  height: 60%; /* 示例：终端占 60% 高度 */
  background-color: #1e1e1e; /* 终端背景色 */
  overflow: hidden; /* 内部滚动由 xterm 处理 */
  display: flex; /* Ensure TerminalComponent fills this wrapper */
  flex-direction: column;
}
.terminal-wrapper > * {
    flex-grow: 1; /* Make TerminalComponent fill the wrapper */
}


.file-manager-wrapper {
    height: 40%; /* 示例：文件管理器占 40% 高度 */
    border-top: 2px solid #ccc; /* Add top border */
    overflow: hidden; /* 防止自身滚动 */
    display: flex; /* Ensure FileManagerComponent fills this wrapper */
    flex-direction: column;
}
.file-manager-wrapper > * {
    flex-grow: 1; /* Make FileManagerComponent fill the wrapper */
}

.status-monitor-wrapper {
    /* width: 20%; */ /* 不再固定宽度，改为 flex-basis */
    flex-basis: 250px; /* 示例基础宽度 */
    min-width: 200px; /* 最小宽度 */
    height: 100%;
    border-left: 2px solid #ccc;
    overflow: hidden;
    display: flex; /* Ensure StatusMonitorComponent fills this wrapper */
    flex-direction: column;
}
.status-monitor-wrapper > * {
    flex-grow: 1; /* Make StatusMonitorComponent fill the wrapper */
}

/* 新增：占位符样式 */
.main-workspace-area.placeholder {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #6c757d;
    padding: 2rem;
    background-color: #f8f9fa; /* Match sidebar background */
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
