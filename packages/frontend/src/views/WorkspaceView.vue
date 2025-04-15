<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'; // Added watch
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import TerminalComponent from '../components/Terminal.vue'; // 引入终端组件
import FileManagerComponent from '../components/FileManager.vue'; // 引入文件管理器组件
import StatusMonitorComponent from '../components/StatusMonitor.vue'; // 引入状态监控组件
import type { Terminal } from 'xterm'; // 引入 Terminal 类型
import { useWebSocketConnection } from '../composables/useWebSocketConnection'; // 只导入 hook
import { useSshTerminal } from '../composables/useSshTerminal'; // 导入 SSH 终端模块
import { useStatusMonitor } from '../composables/useStatusMonitor'; // 导入状态监控模块
import type { ServerStatus } from '../types/server.types'; // 从类型文件导入 ServerStatus
// Removed duplicate/unused import: import type { WebSocketMessage, MessagePayload } from '../types/websocket.types';

// --- 接口定义 ---
// ServerStatus 现在从 types/server.types.ts 导入

const { t } = useI18n(); // 获取 t 函数
const route = useRoute();
const connectionId = computed(() => route.params.connectionId as string); // 从路由获取 connectionId

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
  if (connectionId.value) {
    const wsUrl = `ws://${window.location.hostname}:3001`; // 构建 WebSocket URL
    connect(wsUrl, connectionId.value); // 使用 WebSocket 模块的 connect
    // 不在此处立即注册，等待 isConnected 变为 true
    // registerSshHandlers();
    // registerStatusHandlers();
  } else {
    console.error('[工作区视图] 缺少 connectionId 路由参数。');
  }
});

onBeforeUnmount(() => {
  disconnect(); // 使用 WebSocket 模块的 disconnect
  unregisterAllSshHandlers(); // 注销 SSH 终端处理器
  unregisterAllStatusHandlers(); // 使用状态监控模块的注销函数
});

// 监听 connectionId 变化 (例如，在工作区之间导航)
watch(connectionId, (newId, oldId) => {
    if (newId && newId !== oldId) {
        console.log(`[工作区视图] 连接 ID 从 ${oldId} 更改为 ${newId}。正在重新连接...`);
        // 断开现有连接，注销处理器，然后为新 ID 连接并注册
        disconnect();
        unregisterAllSshHandlers();
        unregisterAllStatusHandlers(); // 使用状态监控模块的注销函数
        // serverStatus 和 statusError 由 useStatusMonitor 自动管理，无需手动重置

        // 重新连接
        const wsUrl = `ws://${window.location.hostname}:3001`;
        connect(wsUrl, newId);
        // registerSshHandlers(); // 注册移至 isConnected watch
        // registerStatusHandlers(); // 注册移至 isConnected watch
    } else if (!newId && oldId) {
        // 导航离开工作区视图
        disconnect(); // isConnected 会变为 false，自动触发清理
        // unregisterAllSshHandlers(); // 注销移至 isConnected watch
        // unregisterAllStatusHandlers(); // 注销移至 isConnected watch
     }
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

 </script>

<template>
  <div class="workspace-view">
    <div class="status-bar">
      <!-- 使用 t 函数渲染状态栏文本 -->
      {{ t('workspace.statusBar', { status: statusMessage, id: connectionId }) }}
      <!-- 状态颜色仍然通过 class 绑定 -->
      <!-- 使用来自 useWebSocketConnection 的状态 -->
      <span :class="`status-${connectionStatus}`"></span>
    </div>
    <div class="main-content-area">
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
  </div>
</template>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  /* 调整高度计算以适应可能的 header/footer/status-bar */
  height: calc(100vh - 60px - 30px - 2rem); /* 假设 header 60px, footer 30px, padding 2rem */
  overflow: hidden; /* 防止页面滚动 */
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
    overflow: hidden; /* Prevent this container from scrolling */
}

.left-pane {
    display: flex;
    flex-direction: column;
    width: 80%; /* Example width, adjust as needed */
    height: 100%;
}

.terminal-wrapper {
  /* flex-grow: 1; */ /* 不再让终端独占剩余空间 */
  height: 60%; /* 示例：终端占 60% 高度 */
  /* width: 50%; */ /* Removed width */
  /* height: 100%; */ /* Removed height */
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
    /* width: 30%; */ /* Removed width */
    /* height: 100%; */ /* Removed height */
    /* border-left: 2px solid #ccc; */ /* Removed left border */
    border-top: 2px solid #ccc; /* Add top border */
    overflow: hidden; /* 防止自身滚动 */
    display: flex; /* Ensure FileManagerComponent fills this wrapper */
    flex-direction: column;
}
.file-manager-wrapper > * {
    flex-grow: 1; /* Make FileManagerComponent fill the wrapper */
}

.status-monitor-wrapper {
    width: 20%; /* Example width */
    height: 100%;
    border-left: 2px solid #ccc; /* Separator */
    overflow: hidden; /* Prevent scrolling */
    display: flex; /* Ensure StatusMonitorComponent fills this wrapper */
    flex-direction: column;
}
.status-monitor-wrapper > * {
    flex-grow: 1; /* Make StatusMonitorComponent fill the wrapper */
}
</style>
