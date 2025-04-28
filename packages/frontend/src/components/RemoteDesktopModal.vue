<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
// @ts-ignore - guacamole-common-js lacks official types
import Guacamole from 'guacamole-common-js';
import apiClient from '../utils/apiClient'; // 假设 API 客户端路径
import { ConnectionInfo } from '../stores/connections.store'; // 假设 ConnectionInfo 类型路径

const { t } = useI18n();

// --- Props ---
const props = defineProps<{
  connection: ConnectionInfo | null; // 接收连接信息
}>();

// --- Emits ---
const emit = defineEmits(['close']);

// --- State Refs ---
const rdpDisplayRef = ref<HTMLDivElement | null>(null); // Guacamole 显示容器
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guacClient = ref<any | null>(null); // Guacamole 客户端实例 (使用 any 因为类型缺失)
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
const statusMessage = ref('');
const keyboard = ref<any | null>(null); // Guacamole Keyboard instance
const mouse = ref<any | null>(null); // Guacamole Mouse instance
// const resizeObserver = ref<ResizeObserver | null>(null); // Resize observer remains removed

// --- Configuration ---
// Configuration for the separate RDP backend service
// TODO: Make these configurable
const RDP_BACKEND_API_BASE = 'http://localhost:9090'; // Default port for test-rdp/packages/rdp API
const RDP_BACKEND_WEBSOCKET_URL = 'ws://localhost:8081'; // Default port for test-rdp/packages/rdp WebSocket

// --- Connection Logic ---
const connectRdp = async () => {
  if (!props.connection || !rdpDisplayRef.value) {
    statusMessage.value = t('remoteDesktopModal.errors.missingInfo');
    connectionStatus.value = 'error';
    console.error('[RDP Modal] Connection info or display element missing.');
    return;
  }

  // 清理之前的显示内容
  while (rdpDisplayRef.value.firstChild) {
    rdpDisplayRef.value.removeChild(rdpDisplayRef.value.firstChild);
  }
  disconnectRdp(); // Ensure any previous connection is cleaned up

  connectionStatus.value = 'connecting';
  statusMessage.value = t('remoteDesktopModal.status.fetchingToken');

  try {
    // 1. 从主后端获取 RDP 会话的 Guacamole Token
    // Construct the path relative to the apiClient's baseURL ('/api/v1')
    const apiUrl = `connections/${props.connection.id}/rdp-session`;
    console.log(`[RDP Modal] Fetching token from main backend: POST /api/v1/${apiUrl}`); // Log the expected full path

    // Use apiClient configured for the main backend
    const response = await apiClient.post<{ token: string }>(apiUrl);

    // apiClient should handle non-2xx responses by throwing an error
    // We just need to check if the token exists in the successful response data
    const token = response.data?.token;
    if (!token) {
         console.error('[RDP Modal] Token not found in main backend response:', response.data);
         throw new Error('Token not found in API response');
    }
    console.log('[RDP Modal] Received token from main backend.');
    statusMessage.value = t('remoteDesktopModal.status.connectingWs');

    // 2. 连接 WebSocket (仍然连接到独立的 RDP 后端的 WebSocket 服务器)
    const tunnelUrl = `${RDP_BACKEND_WEBSOCKET_URL}/?token=${encodeURIComponent(token)}`;
    console.log(`[RDP Modal] Connecting WebSocket to: ${RDP_BACKEND_WEBSOCKET_URL}/?token=...`);
    // @ts-ignore
    const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);

    tunnel.onerror = (status: any) => {
      console.error("[RDP Modal Tunnel] Tunnel Error Status:", status);
      const errorMessage = status.message || 'Unknown tunnel error';
      const errorCode = status.code || 'N/A';
      statusMessage.value = `${t('remoteDesktopModal.errors.tunnelError')} (${errorCode}): ${errorMessage}`;
      connectionStatus.value = 'error';
      disconnectRdp(); // Clean up on tunnel error
    };

    // 3. 创建 Guacamole 客户端
    // @ts-ignore
    guacClient.value = new Guacamole.Client(tunnel);

    // 4. 添加显示元素到 DOM
    rdpDisplayRef.value.appendChild(guacClient.value.getDisplay().getElement());

    // 5. 处理客户端状态变化
    guacClient.value.onstatechange = (state: number) => {
      console.log("[RDP Modal] Guacamole client state changed:", state);
      switch (state) {
        case 0: // IDLE
          statusMessage.value = t('remoteDesktopModal.status.idle');
          connectionStatus.value = 'disconnected';
          break;
        case 1: // CONNECTING
          statusMessage.value = t('remoteDesktopModal.status.connectingRdp');
          connectionStatus.value = 'connecting';
          break;
        case 2: // WAITING
          statusMessage.value = t('remoteDesktopModal.status.waiting');
          connectionStatus.value = 'connecting';
          break;
        case 3: // CONNECTED
          statusMessage.value = t('remoteDesktopModal.status.connected');
          connectionStatus.value = 'connected';
          setupInputListeners(); // 连接成功后设置输入监听

          // 使用 nextTick 确保 DOM 更新和尺寸计算准确
          // 稍微延迟处理，确保远程桌面准备就绪
          setTimeout(() => {
            nextTick(() => { // 仍然使用 nextTick 确保 DOM 尺寸计算准确
              if (rdpDisplayRef.value && guacClient.value) {
                // 强制修改 Guacamole canvas 的 z-index
                const canvases = rdpDisplayRef.value.querySelectorAll('canvas');
              canvases.forEach((canvas) => {
                canvas.style.zIndex = '999'; // 覆盖内联样式
              });
              console.log('[RDP Modal] Set canvas z-index to 999.');

              // 发送固定尺寸 1200x1200
              const width = 1200;
              const height = 1200;
              const dpi = Math.round(window.devicePixelRatio * 96); // 计算 DPI
              console.log(`[RDP Modal] Sending fixed size: ${width}x${height} @ ${dpi} DPI`);
              guacClient.value.sendSize(width, height, dpi);

              // 不再需要 ResizeObserver
              // setupResizeObserver(); // Ensure this remains commented out or removed
              }
            });
          }, 100); // 延迟 100 毫秒
          break;
        case 4: // DISCONNECTING
          statusMessage.value = t('remoteDesktopModal.status.disconnecting');
          connectionStatus.value = 'disconnected';
          break;
        case 5: // DISCONNECTED
          statusMessage.value = t('remoteDesktopModal.status.disconnected');
          connectionStatus.value = 'disconnected';
          // disconnectRdp(); // State change might already trigger cleanup, avoid double disconnect
          break;
        default:
          statusMessage.value = `${t('remoteDesktopModal.status.unknownState')}: ${state}`;
      }
    };

    // 6. 处理客户端错误
    guacClient.value.onerror = (status: any) => {
      console.error("[RDP Modal Client] Client Error Status:", status);
      const errorMessage = status.message || 'Unknown client error';
      statusMessage.value = `${t('remoteDesktopModal.errors.clientError')}: ${errorMessage}`;
      connectionStatus.value = 'error';
      disconnectRdp(); // Clean up on client error
    };

    // 7. (可选) 处理指令日志
    // guacClient.value.oninstruction = (opcode: string, args: any[]) => {
    //   if (['sync', 'size', 'name', 'error', 'disconnect'].includes(opcode)) {
    //        console.log(`[RDP Modal Client] Received instruction: ${opcode}`, args);
    //   }
    // };

    // 8. 开始连接
    console.log("[RDP Modal] Initiating Guacamole client connection...");
    // 连接参数（包括初始尺寸）似乎由后端在生成 token 时确定，
    // 前端 connect() 调用不应传递参数来覆盖它。
    guacClient.value.connect();

  } catch (error: any) {
    console.error("[RDP Modal] Connection failed:", error);
    statusMessage.value = `${t('remoteDesktopModal.errors.connectionFailed')}: ${error.response?.data?.message || error.message || String(error)}`;
    connectionStatus.value = 'error';
    disconnectRdp(); // Clean up on failure
  }
};

// --- Input Handling ---
const setupInputListeners = () => {
    if (!guacClient.value || !rdpDisplayRef.value) return;
    console.log("[RDP Modal Input] Setting up input listeners...");
    try {
        const displayEl = guacClient.value.getDisplay().getElement() as HTMLElement;

        // --- Mouse ---
        // @ts-ignore
        mouse.value = new Guacamole.Mouse(displayEl);
        // @ts-ignore
        mouse.value.onmousedown = mouse.value.onmouseup = mouse.value.onmousemove = (mouseState: any) => {
            if (guacClient.value) {
                guacClient.value.sendMouseState(mouseState);
            }
        };
        console.log("[RDP Modal Input] Mouse listeners attached.");

        // --- Keyboard ---
        // @ts-ignore
        keyboard.value = new Guacamole.Keyboard(document); // Listen on document for global key events

        // Prevent default browser actions for keys handled by Guacamole
        // keyboard.value.listenTo(document); // This might interfere with other inputs, attach carefully

        keyboard.value.onkeydown = (keysym: number) => {
            if (guacClient.value) {
                // console.log("[RDP Input] KeyDown:", keysym);
                guacClient.value.sendKeyEvent(1, keysym);
            }
        };
        keyboard.value.onkeyup = (keysym: number) => {
             if (guacClient.value) {
                // console.log("[RDP Input] KeyUp:", keysym);
                guacClient.value.sendKeyEvent(0, keysym);
             }
        };
        console.log("[RDP Modal Input] Keyboard listeners attached.");

    } catch (inputError) {
        console.error("[RDP Modal Input] Error setting up input listeners:", inputError);
        statusMessage.value = t('remoteDesktopModal.errors.inputError');
    }
};

const removeInputListeners = () => {
    console.log("[RDP Modal Input] Removing input listeners...");
    if (keyboard.value) {
        // If listenTo(document) was used, need a way to remove it,
        // otherwise just nullifying the handlers might be enough.
        // Guacamole.Keyboard doesn't have an obvious 'stopListening'
        keyboard.value.onkeydown = null;
        keyboard.value.onkeyup = null;
        keyboard.value = null; // Release reference
        console.log("[RDP Modal Input] Keyboard listeners removed.");
    }
     if (mouse.value) {
        // Mouse listeners are attached to the display element,
        // removing the element itself or nullifying handlers should work.
        mouse.value.onmousedown = null;
        mouse.value.onmouseup = null;
        mouse.value.onmousemove = null;
        mouse.value = null; // Release reference
        console.log("[RDP Modal Input] Mouse listeners removed.");
    }
};


// --- Disconnect Logic ---
const disconnectRdp = () => {
  // ResizeObserver cleanup remains removed/commented
  // if (resizeObserver.value) { ... }
  removeInputListeners(); // Remove listeners first
  if (guacClient.value) {
    console.log("[RDP Modal] Disconnecting Guacamole client.");
    guacClient.value.disconnect();
    guacClient.value = null;
  }
  // Clean up display manually if needed
  if (rdpDisplayRef.value) {
      while (rdpDisplayRef.value.firstChild) {
          rdpDisplayRef.value.removeChild(rdpDisplayRef.value.firstChild);
      }
  }
  if (connectionStatus.value !== 'error') { // Don't overwrite error messages
      connectionStatus.value = 'disconnected';
      statusMessage.value = t('remoteDesktopModal.status.disconnected');
  }
};

// --- Resize Observer Logic (Remains Removed) ---
// const setupResizeObserver = () => { ... };
// --- Modal Close Handler ---
const closeModal = () => {
  disconnectRdp(); // Ensure disconnection when modal is closed
  emit('close');
};

// --- Lifecycle Hooks ---
onMounted(() => {
  // Automatically connect when component mounts if connection is provided
  if (props.connection) {
    // Use nextTick to ensure the display ref is available
    nextTick(() => {
        connectRdp();
    });
  } else {
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

onUnmounted(() => {
  // Ensure disconnection on component unmount
  disconnectRdp();
});

// Watch for connection prop changes (e.g., if the modal is reused)
watch(() => props.connection, (newConnection, oldConnection) => {
  if (newConnection && newConnection.id !== oldConnection?.id) {
    console.log('[RDP Modal] Connection prop changed, reconnecting...');
    // Use nextTick to ensure the display ref is available after potential v-if changes
     nextTick(() => {
        connectRdp(); // Connect with the new connection info
     });
  } else if (!newConnection) {
      disconnectRdp(); // Disconnect if connection becomes null
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm">
    <div class="bg-background text-foreground rounded-lg shadow-xl w-11/12 max-w-6xl h-[90%] flex flex-col overflow-hidden border border-border"> <!-- Increased max-width and height -->
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-3 border-b border-border flex-shrink-0"> <!-- Reduced padding -->
        <h3 class="text-base font-semibold truncate"> <!-- Reduced text size, added truncate -->
          <i class="fas fa-desktop mr-2 text-text-secondary"></i>
          {{ t('remoteDesktopModal.title') }} - {{ props.connection?.name || props.connection?.host || t('remoteDesktopModal.titlePlaceholder') }}
        </h3>
        <div class="flex items-center space-x-2">
            <!-- Status Indicator -->
            <span class="text-xs px-2 py-0.5 rounded"
                  :class="{
                    'bg-yellow-200 text-yellow-800': connectionStatus === 'connecting',
                    'bg-green-200 text-green-800': connectionStatus === 'connected',
                    'bg-red-200 text-red-800': connectionStatus === 'error',
                    'bg-gray-200 text-gray-800': connectionStatus === 'disconnected'
                  }">
              {{ connectionStatus }}
            </span>
             <button
                @click="closeModal"
                class="text-text-secondary hover:text-foreground transition-colors duration-150 p-1 rounded hover:bg-hover"
                :title="t('common.close')"
             >
                <i class="fas fa-times fa-lg"></i>
             </button>
        </div>
      </div>

      <!-- Modal Body (Guacamole Display Area) -->
      <div class="flex-grow relative bg-black"> <!-- Added relative and bg-black -->
        <div ref="rdpDisplayRef" class="rdp-display-container w-full h-full">
          <!-- Guacamole display will be rendered here -->
        </div>
         <!-- Loading/Error Overlay -->
         <div v-if="connectionStatus === 'connecting' || connectionStatus === 'error'"
              class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white p-4 z-10">
            <div class="text-center">
              <i v-if="connectionStatus === 'connecting'" class="fas fa-spinner fa-spin fa-2x mb-3"></i>
              <i v-else class="fas fa-exclamation-triangle fa-2x mb-3 text-red-400"></i>
              <p class="text-sm">{{ statusMessage }}</p>
               <button v-if="connectionStatus === 'error'"
                       @click="connectRdp"
                       class="mt-4 px-3 py-1 bg-primary text-white rounded text-xs hover:bg-primary-dark">
                 {{ t('common.retry') }}
               </button>
            </div>
         </div>
      </div>

      <!-- Modal Footer (Status Bar) -->
       <div class="p-2 border-t border-border flex-shrink-0 text-xs text-text-secondary bg-header"> <!-- Reduced padding -->
         {{ statusMessage }}
       </div>
    </div>
  </div>
</template>

<style scoped>
.rdp-display-container {
  /* Ensure the container itself doesn't introduce scrollbars unnecessarily */
  overflow: hidden;
  position: relative; /* Needed for Guacamole's absolute positioning */
}

/* Guacamole injects its own elements, target them carefully if needed */
.rdp-display-container :deep(div) {
  /* Guacamole layers might need relative positioning */
   /* position: relative !important; */ /* Avoid !important if possible */
}

.rdp-display-container :deep(canvas) {
  /* Ensure canvas scales correctly if needed, Guacamole usually handles this */
  /* width: 100%; */
  /* height: 100%; */
  z-index: 999; /* 提升 canvas 层级，避免被遮挡 */
}
</style>