<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed, watchEffect } from 'vue'; 
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '../stores/settings.store';
// @ts-ignore - guacamole-common-js 缺少官方类型定义
import Guacamole from 'guacamole-common-js';
import apiClient from '../utils/apiClient';
import { ConnectionInfo } from '../stores/connections.store';

const { t } = useI18n();
const settingsStore = useSettingsStore(); 

const props = defineProps<{
  connection: ConnectionInfo | null;
}>();

const emit = defineEmits(['close']);

let saveWidthTimeout: ReturnType<typeof setTimeout> | null = null;
let saveHeightTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY = 500; // ms

const rdpDisplayRef = ref<HTMLDivElement | null>(null);
const rdpContainerRef = ref<HTMLDivElement | null>(null);
const guacClient = ref<any | null>(null);
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
const statusMessage = ref('');
const keyboard = ref<any | null>(null);
const mouse = ref<any | null>(null);
const desiredModalWidth = ref(1064); 
const desiredModalHeight = ref(858); 

const MIN_MODAL_WIDTH = 1024;
const MIN_MODAL_HEIGHT = 768;

// Dynamically construct WebSocket URL based on environment
let backendBaseUrl: string;
const LOCAL_BACKEND_URL = 'ws://localhost:3001'

// Determine WebSocket URL based on hostname
if (window.location.hostname === 'localhost') {
  backendBaseUrl = LOCAL_BACKEND_URL;
  console.log(`[RDP 模态框] 使用 localhost WebSocket 基础 URL: ${backendBaseUrl}`);
} else {
  // 备选方案: 根据当前 window.location 为生产环境或其他环境构建 URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHostAndPort = window.location.host;
  backendBaseUrl = `${wsProtocol}//${wsHostAndPort}`;
  console.log(`[RDP 模态框] 使用生产环境 WebSocket 基础 URL (来自 window.location): ${backendBaseUrl}`);
}

const connectRdp = async () => {
  if (!props.connection || !rdpDisplayRef.value) {
    statusMessage.value = t('remoteDesktopModal.errors.missingInfo');
    connectionStatus.value = 'error';
    return;
  }

  while (rdpDisplayRef.value.firstChild) {
    rdpDisplayRef.value.removeChild(rdpDisplayRef.value.firstChild);
  }
  disconnectRdp();

  connectionStatus.value = 'connecting';
  statusMessage.value = t('remoteDesktopModal.status.fetchingToken');

  try {
    const apiUrl = `connections/${props.connection.id}/rdp-session`;

    const response = await apiClient.post<{ token: string }>(apiUrl);

    const token = response.data?.token;
    if (!token) {
         throw new Error('Token not found in API response');
    }
    statusMessage.value = t('remoteDesktopModal.status.connectingWs');

    // DOM 更新后获取 RDP 容器尺寸
    await nextTick();

    let widthToSend = 800; // 默认/备用宽度
    let heightToSend = 600; // 默认/备用高度
    const dpiToSend = 96;

    if (rdpContainerRef.value) {
        // 使用 clientWidth/clientHeight，因为它们代表可用于内容的内部尺寸
        widthToSend = rdpContainerRef.value.clientWidth;
        heightToSend = rdpContainerRef.value.clientHeight - 1; // 根据反馈减去 1
        // 确保最小尺寸，必要时根据后端要求进行调整
        widthToSend = Math.max(100, widthToSend);
        heightToSend = Math.max(100, heightToSend);
        console.log(`计算出的 RDP 尺寸: ${widthToSend}x${heightToSend}`);
    } else {
         console.warn("RDP 容器引用不可用，无法获取尺寸。使用默认值。");
         // 考虑设置错误状态或通知用户
    }

    // 使用确定的基础 URL 构建后端代理端点的 URL
    let tunnelUrl = `${backendBaseUrl}/rdp-proxy?token=${encodeURIComponent(token)}&width=${widthToSend}&height=${heightToSend}&dpi=${dpiToSend}`;
    // 强制移除末尾可能存在的 '?'
    if (tunnelUrl.endsWith('?')) {
      tunnelUrl = tunnelUrl.slice(0, -1);
      console.warn(`[RDP 模态框] 移除了末尾多余的 '?'`);
    }
   console.log(`[RDP 模态框] 连接到隧道: ${tunnelUrl}`); // 记录最终 URL
    // @ts-ignore
    const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);

    tunnel.onerror = (status: any) => {
      const errorMessage = status.message || 'Unknown tunnel error';
      const errorCode = status.code || 'N/A';
      statusMessage.value = `${t('remoteDesktopModal.errors.tunnelError')} (${errorCode}): ${errorMessage}`;
      connectionStatus.value = 'error';
      disconnectRdp();
    };

    // @ts-ignore
    guacClient.value = new Guacamole.Client(tunnel);
// 添加此行以启用 keep-alive (每 3 秒发送 NOP)
    guacClient.value.keepAliveFrequency = 3000; // 毫秒

    rdpDisplayRef.value.appendChild(guacClient.value.getDisplay().getElement());

    guacClient.value.onstatechange = (state: number) => {
      switch (state) {
        case 0:
          statusMessage.value = t('remoteDesktopModal.status.idle');
          connectionStatus.value = 'disconnected';
          break;
        case 1:
          statusMessage.value = t('remoteDesktopModal.status.connectingRdp');
          connectionStatus.value = 'connecting';
          break;
        case 2:
          statusMessage.value = t('remoteDesktopModal.status.waiting');
          connectionStatus.value = 'connecting';
          break;
        case 3:
          statusMessage.value = t('remoteDesktopModal.status.connected');
          connectionStatus.value = 'connected';
          setupInputListeners();

          setTimeout(() => {
            nextTick(() => {
              if (rdpDisplayRef.value && guacClient.value) {
                const canvases = rdpDisplayRef.value.querySelectorAll('canvas');
              canvases.forEach((canvas) => {
                canvas.style.zIndex = '999';
              });
              }
            });
          }, 100);
          break;
        case 4:
          statusMessage.value = t('remoteDesktopModal.status.disconnecting');
          connectionStatus.value = 'disconnected';
          break;
        case 5:
          statusMessage.value = t('remoteDesktopModal.status.disconnected');
          connectionStatus.value = 'disconnected';
          break;
        default:
          statusMessage.value = `${t('remoteDesktopModal.status.unknownState')}: ${state}`;
      }
    };

    guacClient.value.onerror = (status: any) => {
      const errorMessage = status.message || 'Unknown client error';
      statusMessage.value = `${t('remoteDesktopModal.errors.clientError')}: ${errorMessage}`;
      connectionStatus.value = 'error';
      disconnectRdp();
    };

    guacClient.value.connect(''); // 保留 '' 的更改

  } catch (error: any) {
    statusMessage.value = `${t('remoteDesktopModal.errors.connectionFailed')}: ${error.response?.data?.message || error.message || String(error)}`;
    connectionStatus.value = 'error';
    disconnectRdp();
  }
};

const setupInputListeners = () => {
    if (!guacClient.value || !rdpDisplayRef.value) return;
    try {
        const displayEl = guacClient.value.getDisplay().getElement() as HTMLElement;

        // @ts-ignore
        mouse.value = new Guacamole.Mouse(displayEl);
        // @ts-ignore
        mouse.value.onmousedown = mouse.value.onmouseup = mouse.value.onmousemove = (mouseState: any) => {
            if (guacClient.value) {
                guacClient.value.sendMouseState(mouseState);
            }
        };

        // @ts-ignore
        keyboard.value = new Guacamole.Keyboard(document); // 将监听器附加到 document 以便更好地捕获

        keyboard.value.onkeydown = (keysym: number) => {
            if (guacClient.value) {
                guacClient.value.sendKeyEvent(1, keysym);
            }
        };
        keyboard.value.onkeyup = (keysym: number) => {
             if (guacClient.value) {
                guacClient.value.sendKeyEvent(0, keysym);
             }
        };

    } catch (inputError) {
        statusMessage.value = t('remoteDesktopModal.errors.inputError');
    }
};

const removeInputListeners = () => {
    if (keyboard.value) {
        keyboard.value.onkeydown = null;
        keyboard.value.onkeyup = null;
        keyboard.value = null;
    }
     if (mouse.value) {
        mouse.value.onmousedown = null;
        mouse.value.onmouseup = null;
        mouse.value.onmousemove = null;
        mouse.value = null;
    }
};


const disconnectRdp = () => {
  removeInputListeners();
  if (guacClient.value) {
    guacClient.value.disconnect();
    guacClient.value = null;
  }
  if (rdpDisplayRef.value) {
      while (rdpDisplayRef.value.firstChild) {
          rdpDisplayRef.value.removeChild(rdpDisplayRef.value.firstChild);
      }
  }
  if (connectionStatus.value !== 'error') {
      connectionStatus.value = 'disconnected';
      statusMessage.value = t('remoteDesktopModal.status.disconnected');
  }
};


const closeModal = () => {
  disconnectRdp();
  emit('close');
};


// 监听本地 ref 并将验证后的尺寸保存到设置存储
watch(desiredModalWidth, (newWidth, oldWidth) => {
  // 只有当值真正改变时才处理
  if (newWidth === oldWidth) {
      console.log(`[RDP 模态框] 宽度监听触发，但值 (${newWidth}) 未改变。跳过保存。`);
      return;
  }
  console.log(`[RDP 模态框] 监听 desiredModalWidth 触发: ${oldWidth} -> ${newWidth}`); // 添加日志
  // 保存前验证新宽度
  const validatedWidth = Math.max(MIN_MODAL_WIDTH, Number(newWidth) || MIN_MODAL_WIDTH);
  // 防抖保存 *验证后* 的宽度
  if (saveWidthTimeout) clearTimeout(saveWidthTimeout);
  saveWidthTimeout = setTimeout(() => {
    // 只保存验证后的宽度，不要在此处更改输入值
    console.log(`[RDP 模态框] 防抖保存 - 保存宽度: ${validatedWidth} (输入值: ${newWidth})`);
    // 再次检查，确保在延迟期间值没有变回原来的 store 值
    if (String(validatedWidth) !== settingsStore.settings.rdpModalWidth) {
         settingsStore.updateSetting('rdpModalWidth', String(validatedWidth));
    } else {
         console.log(`[RDP 模态框] 防抖保存 - 宽度 ${validatedWidth} 与存储值匹配。跳过冗余保存。`);
    }
  }, DEBOUNCE_DELAY);
});

watch(desiredModalHeight, (newHeight, oldHeight) => {
   // 只有当值真正改变时才处理
   if (newHeight === oldHeight) {
       console.log(`[RDP 模态框] 高度监听触发，但值 (${newHeight}) 未改变。跳过保存。`);
       return;
   }
   console.log(`[RDP 模态框] 监听 desiredModalHeight 触发: ${oldHeight} -> ${newHeight}`);
  // 保存前验证新高度
  const validatedHeight = Math.max(MIN_MODAL_HEIGHT, Number(newHeight) || MIN_MODAL_HEIGHT);
  // 防抖保存 *验证后* 的高度
  if (saveHeightTimeout) clearTimeout(saveHeightTimeout);
  saveHeightTimeout = setTimeout(() => {
    // 只保存验证后的高度，不要在此处更改输入值
    console.log(`[RDP 模态框] 防抖保存 - 保存高度: ${validatedHeight} (输入值: ${newHeight})`);
    // 再次检查
    if (String(validatedHeight) !== settingsStore.settings.rdpModalHeight) {
        settingsStore.updateSetting('rdpModalHeight', String(validatedHeight));
    } else {
        console.log(`[RDP 模态框] 防抖保存 - 高度 ${validatedHeight} 与存储值匹配。跳过冗余保存。`);
    }
  }, DEBOUNCE_DELAY);
});

// 组件挂载或设置更改时从设置存储加载初始尺寸
watchEffect(() => {
  const storeWidth = settingsStore.settings.rdpModalWidth;
  const storeHeight = settingsStore.settings.rdpModalHeight;
  console.log(`[RDP 模态框] 从存储加载尺寸 - 宽度: ${storeWidth}, 高度: ${storeHeight}`);
 
  // 如果存储中有默认值则使用，否则使用组件默认值
  const initialWidth = storeWidth ? parseInt(storeWidth, 10) : desiredModalWidth.value; // 使用当前 ref 值作为备用默认值
  const initialHeight = storeHeight ? parseInt(storeHeight, 10) : desiredModalHeight.value; // 使用当前 ref 值作为备用默认值

  // 根据最小值进行验证
  const finalWidth = Math.max(MIN_MODAL_WIDTH, isNaN(initialWidth) ? MIN_MODAL_WIDTH : initialWidth);
  const finalHeight = Math.max(MIN_MODAL_HEIGHT, isNaN(initialHeight) ? MIN_MODAL_HEIGHT : initialHeight);
  console.log(`[RDP 模态框] 应用验证后的尺寸 - 宽度: ${finalWidth}, 高度: ${finalHeight}`);
  desiredModalWidth.value = finalWidth;
  desiredModalHeight.value = finalHeight;
 });
 

onMounted(() => {
  // 初始尺寸加载现在由 watchEffect 处理

  if (props.connection) {
    nextTick(async () => {
        await connectRdp(); // 使用初始尺寸连接
        // 不再需要设置 observer
    });
  } else {
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

onUnmounted(() => {
  disconnectRdp(); // 这里已经调用了 removeInputListeners
});

watch(() => props.connection, (newConnection, oldConnection) => {
  if (newConnection && newConnection.id !== oldConnection?.id) {
     nextTick(async () => {
        await connectRdp(); // 使用初始尺寸连接
        // 不再需要设置 observer
     });
  } else if (!newConnection) {
      disconnectRdp();
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

// 直接使用所需的模态框尺寸作为样式
const computedModalStyle = computed(() => {

  // 在此处为实际模态框样式应用最小约束
  const actualWidth = Math.max(MIN_MODAL_WIDTH, desiredModalWidth.value);
  const actualHeight = Math.max(MIN_MODAL_HEIGHT, desiredModalHeight.value);
  return {
    width: `${actualWidth}px`,
    height: `${actualHeight}px`,
  };
});

</script>
<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm">
     <div
        :style="computedModalStyle"
        class="bg-background text-foreground rounded-lg shadow-xl flex flex-col overflow-hidden border border-border"
     >
      <div class="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <h3 class="text-base font-semibold truncate">
          <i class="fas fa-desktop mr-2 text-text-secondary"></i>
          {{ t('remoteDesktopModal.title') }} - {{ props.connection?.name || props.connection?.host || t('remoteDesktopModal.titlePlaceholder') }}
        </h3>
        <div class="flex items-center space-x-2">
            <span class="text-xs px-2 py-0.5 rounded"
                  :class="{
                    'bg-yellow-200 text-yellow-800': connectionStatus === 'connecting',
                    'bg-green-200 text-green-800': connectionStatus === 'connected',
                    'bg-red-200 text-red-800': connectionStatus === 'error',
                    'bg-gray-200 text-gray-800': connectionStatus === 'disconnected'
                  }">
              {{ t('remoteDesktopModal.status.' + connectionStatus) }}
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

      <div ref="rdpContainerRef" class="relative bg-black overflow-hidden flex-1">
        <div ref="rdpDisplayRef" class="rdp-display-container w-full h-full">
        </div>
         <div v-if="connectionStatus === 'connecting' || connectionStatus === 'error'"
              class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white p-4 z-10">
            <div class="text-center">
              <i v-if="connectionStatus === 'connecting'" class="fas fa-spinner fa-spin fa-2x mb-3"></i>
              <i v-else class="fas fa-exclamation-triangle fa-2x mb-3 text-red-400"></i>
              <p class="text-sm">{{ statusMessage }}</p>
               <button v-if="connectionStatus === 'error'"
                       @click="() => connectRdp()"
                       class="mt-4 px-3 py-1 bg-primary text-white rounded text-xs hover:bg-primary-dark">
                 {{ t('common.retry') }}
               </button>
            </div>
         </div>
      </div>

       <div class="p-2 border-t border-border flex-shrink-0 text-xs text-text-secondary bg-header flex items-center justify-end">
         <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <label for="modal-width" class="text-xs ml-2">{{ t('common.width') }}:</label>
            <input
              id="modal-width"
              type="number"
              v-model.number="desiredModalWidth"
              step="10"
              class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <label for="modal-height" class="text-xs">{{ t('common.height') }}:</label>
            <input
              id="modal-height"
              type="number"
              v-model.number="desiredModalHeight"
              step="10"
              class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
             <!-- 添加重新连接按钮 -->
             <button
                @click="connectRdp"
                :disabled="connectionStatus === 'connecting'"
                class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                :title="t('remoteDesktopModal.reconnectTooltip')"
             >
                {{ t('common.reconnect') }}
             </button>
         </div>
       </div>
    </div>
  </div>
</template>
<style scoped>
.rdp-display-container {
  overflow: hidden;
  position: relative;
}

.rdp-display-container :deep(div) {
}

.rdp-display-container :deep(canvas) {
  z-index: 999;
}
</style>
