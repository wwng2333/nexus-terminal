<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import TerminalComponent from '../components/Terminal.vue'; // 引入终端组件
import FileManagerComponent from '../components/FileManager.vue'; // 引入文件管理器组件
import StatusMonitorComponent from '../components/StatusMonitor.vue'; // 引入状态监控组件
import type { Terminal } from 'xterm'; // 引入 Terminal 类型

// --- Interfaces ---
// Updated interface to match StatusMonitor and backend
interface ServerStatus {
  cpuPercent?: number;
  memPercent?: number;
  memUsed?: number; // MB
  memTotal?: number; // MB
  diskPercent?: number;
  diskUsed?: number; // KB
  diskTotal?: number; // KB
  cpuModel?: string;
}

const { t } = useI18n(); // 获取 t 函数
const route = useRoute();
const connectionId = computed(() => route.params.connectionId as string); // 从路由获取 connectionId

const terminalInstance = ref<Terminal | null>(null); // 终端实例引用
const ws = ref<WebSocket | null>(null); // WebSocket 实例引用
const connectionStatus = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
const statusMessage = ref<string>(t('workspace.status.initializing')); // 使用 i18n
const terminalOutputBuffer = ref<string[]>([]); // 缓冲 WebSocket 消息直到终端准备好
const serverStatus = ref<ServerStatus | null>(null); // 存储服务器状态数据
const statusError = ref<string | null>(null); // 存储状态获取错误

// 辅助函数：根据状态码获取 i18n 状态文本
const getStatusText = (statusKey: string, params?: Record<string, any>): string => {
    return t(`workspace.status.${statusKey}`, params || {});
};

// 辅助函数：获取终端消息文本
const getTerminalText = (key: string, params?: Record<string, any>): string => {
    return t(`workspace.terminal.${key}`, params || {});
};


// 处理终端准备就绪事件
const onTerminalReady = (term: Terminal) => {
  terminalInstance.value = term;
  // 将缓冲区的输出写入终端
  terminalOutputBuffer.value.forEach(data => term.write(data));
  terminalOutputBuffer.value = []; // 清空缓冲区
  console.log('终端准备就绪');
};

// 处理终端用户输入
const onTerminalData = (data: string) => {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'ssh:input', payload: { data } }));
  }
};

// 处理终端大小调整
const onTerminalResize = (dimensions: { cols: number; rows: number }) => {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    console.log('发送终端大小调整:', dimensions);
    ws.value.send(JSON.stringify({ type: 'ssh:resize', payload: dimensions }));
  }
};

// 初始化 WebSocket 连接
const initializeWebSocketConnection = () => {
  // 使用当前页面的协议和主机，但端口固定为后端端口 (3001)，路径为 /
  // 注意：这里假设后端 WebSocket 监听根路径，如果不是，需要修改路径
  // 并且假设前端和后端在同一主机上，只是端口不同
  const wsUrl = `ws://${window.location.hostname}:3001`; // 构建 WebSocket URL

  console.log(`尝试连接 WebSocket: ${wsUrl}`);
  statusMessage.value = getStatusText('connectingWs', { url: wsUrl });
  connectionStatus.value = 'connecting';

  ws.value = new WebSocket(wsUrl);

  ws.value.onopen = () => {
    console.log('WebSocket 连接已打开');
    statusMessage.value = getStatusText('wsConnected');
    // 连接打开后，发送 ssh:connect 消息
    if (ws.value) {
      ws.value.send(JSON.stringify({ type: 'ssh:connect', payload: { connectionId: connectionId.value } }));
    }
  };

  ws.value.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      // console.log('收到 WebSocket 消息:', message); // Debug log

      switch (message.type) {
        case 'ssh:output':
          let outputData = message.payload;
          // 检查是否为 Base64 编码
          if (message.encoding === 'base64' && typeof outputData === 'string') {
            try {
              // 解码 Base64 并尝试用 UTF-8 解释
              // 注意：atob 在浏览器中可用，但在 Node.js 环境中可能需要 Buffer.from(..., 'base64').toString()
              outputData = atob(outputData);
            } catch (e) {
              console.error('Base64 解码失败:', e, '原始数据:', message.payload);
              outputData = `\r\n[解码错误: ${e}]\r\n`; // 在终端显示解码错误
            }
          }
          // 写入终端
          if (terminalInstance.value) {
            terminalInstance.value.write(outputData);
          } else {
            // 如果终端还没准备好，先缓冲输出 (缓冲解码后的数据)
            terminalOutputBuffer.value.push(message.payload);
          }
          break;
        case 'ssh:connected':
          console.log('SSH 会话已连接');
          connectionStatus.value = 'connected';
          statusMessage.value = getStatusText('connected');
          terminalInstance.value?.focus(); // 连接成功后聚焦终端
          break;
        case 'ssh:disconnected':
          const reasonDisconnect = message.payload || '未知原因';
          console.log('SSH 会话已断开:', reasonDisconnect);
          connectionStatus.value = 'disconnected';
          statusMessage.value = getStatusText('disconnected', { reason: reasonDisconnect });
          terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('disconnectMsg', { reason: reasonDisconnect })}\x1b[0m`);
          break;
        case 'ssh:error':
          const errorMsg = message.payload || '未知 SSH 错误';
          console.error('SSH 错误:', errorMsg);
          connectionStatus.value = 'error';
          // 尝试匹配特定的错误 key
          let errorKey = 'sshError';
          if (errorMsg.includes('解密')) errorKey = 'decryptError';
          else if (errorMsg.includes('未找到 ID')) errorKey = 'noConnInfo';
          else if (errorMsg.includes('缺少密码')) errorKey = 'noPassword';
          else if (errorMsg.includes('打开 Shell 失败')) errorKey = 'shellError';
          else if (errorMsg.includes('已存在活动的 SSH 连接')) errorKey = 'alreadyConnected';

          statusMessage.value = getStatusText(errorKey, { message: errorMsg, id: connectionId.value });
          terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('genericErrorMsg', { message: errorMsg })}\x1b[0m`);
          break;
         case 'ssh:status':
             const statusKey = message.payload?.key || 'unknown'; // 假设后端会发送 key
             const statusParams = message.payload?.params || {};
             console.log('SSH 状态:', statusKey, statusParams);
             statusMessage.value = getStatusText(statusKey, statusParams); // 更新状态信息
             break;
        case 'info': // 处理后端发送的普通信息
             console.log('后端信息:', message.payload);
             terminalInstance.value?.writeln(`\r\n\x1b[34m${getTerminalText('infoPrefix')} ${message.payload}\x1b[0m`);
             break;
        case 'error': // 处理后端发送的通用错误
             console.error('后端错误:', message.payload);
             connectionStatus.value = 'error';
             statusMessage.value = getStatusText('error', { message: message.payload });
              terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('errorPrefix')} ${message.payload}\x1b[0m`);
              break;
        // --- Handle Status Updates ---
        case 'ssh:status:update':
            // console.log('收到状态更新:', message.payload); // Debug log
            serverStatus.value = message.payload;
            statusError.value = null; // Clear previous error on successful update
            break;
        // Optional: Handle status errors if backend sends them
        // case 'ssh:status:error':
        //     console.error('获取服务器状态时出错:', message.payload);
        //     statusError.value = message.payload || '无法获取服务器状态';
        //     serverStatus.value = null; // Clear status data on error
        //     break;
         // default: // Removed default case to allow other components to handle messages
         //   console.warn('WorkspaceView: 收到未处理的 WebSocket 消息类型:', message.type);
       }
     } catch (e) {
      console.error('处理 WebSocket 消息时出错:', e);
      // 如果收到的不是 JSON，直接写入终端
      if (terminalInstance.value && typeof event.data === 'string') {
          terminalInstance.value.write(event.data);
      }
    }
  };

  ws.value.onerror = (error) => {
    console.error('WebSocket 错误:', error);
    connectionStatus.value = 'error';
    statusMessage.value = getStatusText('wsError');
    terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('wsErrorMsg')}\x1b[0m`);
  };

  ws.value.onclose = (event) => {
    console.log('WebSocket 连接已关闭:', event.code, event.reason);
    if (connectionStatus.value !== 'disconnected' && connectionStatus.value !== 'error') {
        connectionStatus.value = 'disconnected';
        statusMessage.value = getStatusText('wsClosed', { code: event.code });
        terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('wsCloseMsg', { code: event.code })}\x1b[0m`);
    }
    ws.value = null; // 清理引用
    serverStatus.value = null; // Clear server status on disconnect
    statusError.value = null; // Clear status error on disconnect
  };
};

onMounted(() => {
  if (connectionId.value) {
    initializeWebSocketConnection();
  } else {
    statusMessage.value = getStatusText('error', { message: '缺少连接 ID' });
    connectionStatus.value = 'error';
    console.error('WorkspaceView: 缺少 connectionId 路由参数。');
  }
});

onBeforeUnmount(() => {
  if (ws.value) {
    console.log('组件卸载，关闭 WebSocket 连接...');
    ws.value.close();
  }
});

</script>

<template>
  <div class="workspace-view">
    <div class="status-bar">
      <!-- 使用 t 函数渲染状态栏文本 -->
      {{ t('workspace.statusBar', { status: statusMessage, id: connectionId }) }}
      <!-- 状态颜色仍然通过 class 绑定 -->
      <span :class="`status-${connectionStatus}`"></span>
    </div>
    <div class="main-content-area">
      <div class="left-pane">
        <div class="terminal-wrapper">
          <TerminalComponent
            @ready="onTerminalReady"
            @data="onTerminalData"
            @resize="onTerminalResize"
          />
        </div>
        <!-- 文件管理器窗格 -->
        <div class="file-manager-wrapper">
           <FileManagerComponent :ws="ws" :is-connected="connectionStatus === 'connected'" />
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
