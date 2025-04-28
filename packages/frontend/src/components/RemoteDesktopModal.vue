<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
// @ts-ignore - guacamole-common-js lacks official types
import Guacamole from 'guacamole-common-js';
import apiClient from '../utils/apiClient';
import { ConnectionInfo } from '../stores/connections.store';

const { t } = useI18n();

const props = defineProps<{
  connection: ConnectionInfo | null;
}>();

const emit = defineEmits(['close']);

const rdpDisplayRef = ref<HTMLDivElement | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guacClient = ref<any | null>(null);
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
const statusMessage = ref('');
const keyboard = ref<any | null>(null);
const mouse = ref<any | null>(null);
const inputWidth = ref(1024);
const inputHeight = ref(768);
// const modalStyle = ref({}); // Replaced by computedModalStyle
const rdpContainerStyle = ref<{ height?: string }>({}); // Only height is needed now
const modalWidth = ref(1064); // Initial default based on 1024 + padding
const modalHeight = ref(858); // Initial default based on 768 + padding

const RDP_BACKEND_API_BASE = 'http://localhost:9090';
const RDP_BACKEND_WEBSOCKET_URL = 'ws://localhost:8081';

const connectRdp = async (useInputValues = false) => {
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

    let widthToSend = 1024;
    let heightToSend = 768;
    const dpiToSend = 96;

    if (useInputValues) {
        widthToSend = parseInt(String(inputWidth.value), 10) || widthToSend;
        heightToSend = parseInt(String(inputHeight.value), 10) || heightToSend;
    } else {
        if (rdpDisplayRef.value && rdpDisplayRef.value.clientWidth > 0 && rdpDisplayRef.value.clientHeight > 0) {
            widthToSend = rdpDisplayRef.value.clientWidth;
            heightToSend = rdpDisplayRef.value.clientHeight;
        } else {
            widthToSend = parseInt(String(inputWidth.value), 10) || widthToSend;
            heightToSend = parseInt(String(inputHeight.value), 10) || heightToSend;
        }
    }

    inputWidth.value = widthToSend;
    inputHeight.value = heightToSend;

    const extraWidth = 40;
    const headerHeight = 45;
    const footerHeight = 35;

    // Update modal size refs based on RDP size + padding
    modalWidth.value = widthToSend + extraWidth;
    modalHeight.value = heightToSend + headerHeight + footerHeight + 10;

    rdpContainerStyle.value = {
        // width: `${widthToSend}px`, // Remove width setting
        height: `${heightToSend}px`,
    };

    const tunnelUrl = `${RDP_BACKEND_WEBSOCKET_URL}/?token=${encodeURIComponent(token)}&width=${widthToSend}&height=${heightToSend}&dpi=${dpiToSend}`;
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

    guacClient.value.connect(''); // Keep the '' change

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
        keyboard.value = new Guacamole.Keyboard(displayEl);

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


const reconnectWithNewSize = () => {
  const width = parseInt(String(inputWidth.value), 10);
  const height = parseInt(String(inputHeight.value), 10);
  if (!width || width <= 0 || !height || height <= 0) {
      statusMessage.value = t('remoteDesktopModal.errors.invalidSize');
      return;
  }
  disconnectRdp();
  nextTick(() => {
      connectRdp(true);

      const headerHeight = 45;
      const footerHeight = 35;
      const extraWidth = 40;

      rdpContainerStyle.value = {
          // width: `${width}px`, // Remove width setting
          height: `${height}px`,
      };
      // Update modal size refs based on new RDP size + padding
      modalWidth.value = width + extraWidth;
      modalHeight.value = height + headerHeight + footerHeight + 10;
  });
};

const closeModal = () => {
  disconnectRdp();
  emit('close');
};

onMounted(() => {
  if (props.connection) {
    nextTick(() => {
        connectRdp(false);
    });
  } else {
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

onUnmounted(() => {
  disconnectRdp();
});

watch(() => props.connection, (newConnection, oldConnection) => {
  if (newConnection && newConnection.id !== oldConnection?.id) {
     nextTick(() => {
        connectRdp(false);
     });
  } else if (!newConnection) {
      disconnectRdp();
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

const computedModalStyle = computed(() => ({
  width: `${modalWidth.value}px`,
  height: `${modalHeight.value}px`,
}));

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

      <div class="relative bg-black overflow-hidden flex-1" :style="rdpContainerStyle">
        <div ref="rdpDisplayRef" class="rdp-display-container w-full h-full">
        </div>
         <div v-if="connectionStatus === 'connecting' || connectionStatus === 'error'"
              class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white p-4 z-10">
            <div class="text-center">
              <i v-if="connectionStatus === 'connecting'" class="fas fa-spinner fa-spin fa-2x mb-3"></i>
              <i v-else class="fas fa-exclamation-triangle fa-2x mb-3 text-red-400"></i>
              <p class="text-sm">{{ statusMessage }}</p>
               <button v-if="connectionStatus === 'error'"
                       @click="() => connectRdp(false)"
                       class="mt-4 px-3 py-1 bg-primary text-white rounded text-xs hover:bg-primary-dark">
                 {{ t('common.retry') }}
               </button>
            </div>
         </div>
      </div>

       <div class="p-2 border-t border-border flex-shrink-0 text-xs text-text-secondary bg-header flex items-center justify-between">
         <span>{{ statusMessage }}</span>
         <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <label for="modal-width" class="text-xs ml-2">Modal W:</label>
            <input
              id="modal-width"
              type="number"
              v-model="modalWidth"
              min="200"
              step="10"
              class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <label for="modal-height" class="text-xs">Modal H:</label>
            <input
              id="modal-height"
              type="number"
              v-model="modalHeight"
              min="200"
              step="10"
              class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <span class="border-l border-border h-4 mx-2"></span>

            <label for="rdp-width" class="text-xs">RDP W:</label>
            <input
              id="rdp-width"
              type="number"
              v-model="inputWidth"
              min="100"
              step="10"
              class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              @keyup.enter="reconnectWithNewSize"
            />
            <label for="rdp-height" class="text-xs">H:</label>
             <input
               id="rdp-height"
               type="number"
               v-model="inputHeight"
               min="100"
               step="10"
               class="w-16 px-1 py-0.5 text-xs border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
               @keyup.enter="reconnectWithNewSize"
             />
             <button
                @click="reconnectWithNewSize"
                :disabled="connectionStatus === 'connecting'"
                class="px-2 py-0.5 text-xs bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                :title="t('remoteDesktopModal.reconnectTooltip')"
             >
                <i class="fas fa-sync-alt mr-1"></i>
                {{ t('remoteDesktopModal.reconnect') }}
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