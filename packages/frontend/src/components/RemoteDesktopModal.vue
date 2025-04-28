<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed, watchEffect } from 'vue'; // Import watchEffect
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '../stores/settings.store'; // Import settings store
// @ts-ignore - guacamole-common-js lacks official types
import Guacamole from 'guacamole-common-js';
import apiClient from '../utils/apiClient';
import { ConnectionInfo } from '../stores/connections.store';

const { t } = useI18n();
const settingsStore = useSettingsStore(); // Instantiate settings store

const props = defineProps<{
  connection: ConnectionInfo | null;
}>();

const emit = defineEmits(['close']);

let saveWidthTimeout: ReturnType<typeof setTimeout> | null = null;
let saveHeightTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY = 500; // ms

const rdpDisplayRef = ref<HTMLDivElement | null>(null);
const rdpContainerRef = ref<HTMLDivElement | null>(null); // Added ref for the container
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guacClient = ref<any | null>(null);
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
const statusMessage = ref('');
const keyboard = ref<any | null>(null);
const mouse = ref<any | null>(null);
// const inputWidth = ref(1024); // Removed, size determined by container
// const inputHeight = ref(768); // Removed, size determined by container
// const modalStyle = ref({}); // Replaced by computedModalStyle
// const rdpContainerStyle = ref<{ height?: string }>({}); // Removed, size determined by flex-1
const desiredModalWidth = ref(1064); // User sets the desired TOTAL modal width (1024 + 40 padding)
const desiredModalHeight = ref(858); // User sets the desired TOTAL modal height (768 + chrome)

const MIN_MODAL_WIDTH = 1024;
const MIN_MODAL_HEIGHT = 768;

// Dynamically construct WebSocket URL based on environment
let backendBaseUrl: string;
// const LOCAL_BACKEND_URL = 'ws://localhost:18112'
const LOCAL_BACKEND_URL = 'ws://localhost:8081'

// Determine WebSocket URL based on hostname
if (window.location.hostname === 'localhost') {
  backendBaseUrl = LOCAL_BACKEND_URL;
  console.log(`[RDP Modal] Using localhost WebSocket Base URL: ${backendBaseUrl}`);
} else {
  // Fallback: Construct URL based on current window location for production/other environments
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHostAndPort = window.location.host;
  backendBaseUrl = `${wsProtocol}//${wsHostAndPort}`;
  console.log(`[RDP Modal] Using production WebSocket Base URL from window.location: ${backendBaseUrl}`);
}

const connectRdp = async () => { // Removed useInputValues parameter
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

    // Get RDP container dimensions after DOM update
    await nextTick();

    let widthToSend = 800; // Default/fallback width
    let heightToSend = 600; // Default/fallback height
    const dpiToSend = 96;

    if (rdpContainerRef.value) {
        // Use clientWidth/clientHeight as they represent the inner dimensions available for content
        widthToSend = rdpContainerRef.value.clientWidth;
        heightToSend = rdpContainerRef.value.clientHeight - 1; // Subtract 1 based on feedback
        // Ensure minimum dimensions, adjust if necessary based on backend requirements
        widthToSend = Math.max(100, widthToSend);
        heightToSend = Math.max(100, heightToSend);
        console.log(`Calculated RDP dimensions: ${widthToSend}x${heightToSend}`);
    } else {
         console.warn("RDP container ref not available to get dimensions. Using defaults.");
         // Consider setting an error state or notifying the user
    }

    // Construct URL for the backend proxy endpoint using the determined base URL
    const tunnelUrl = `${backendBaseUrl}/rdp-proxy?token=${encodeURIComponent(token)}&width=${widthToSend}&height=${heightToSend}&dpi=${dpiToSend}`;
    console.log(`[RDP Modal] Connecting to tunnel: ${tunnelUrl}`); // Log the final URL
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


// Removed stopResizeObserver as ResizeObserver is no longer used

const disconnectRdp = () => {
  // stopResizeObserver(); // Removed
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


// Removed reconnectWithNewSize function

const closeModal = () => {
  disconnectRdp();
  emit('close');
};

// Removed setupResizeObserver as ResizeObserver is no longer used


// Removed loadDesiredModalSize function

// Watch local refs and save validated size to settings store
watch(desiredModalWidth, (newWidth) => {
  // Validate new width before saving
  const validatedWidth = Math.max(MIN_MODAL_WIDTH, Number(newWidth) || MIN_MODAL_WIDTH);
  // Debounce saving the *validated* width
  if (saveWidthTimeout) clearTimeout(saveWidthTimeout);
  saveWidthTimeout = setTimeout(() => {
    // Only save the validated width, don't change the input value here
    console.log(`[RDP Modal] Debounced Save - Saving width: ${validatedWidth} (Input value: ${newWidth})`);
    settingsStore.updateSetting('rdpModalWidth', String(validatedWidth));
  }, DEBOUNCE_DELAY);
});

watch(desiredModalHeight, (newHeight) => {
  // Validate new height before saving
  const validatedHeight = Math.max(MIN_MODAL_HEIGHT, Number(newHeight) || MIN_MODAL_HEIGHT);
  // Debounce saving the *validated* height
  if (saveHeightTimeout) clearTimeout(saveHeightTimeout);
  saveHeightTimeout = setTimeout(() => {
    // Only save the validated height, don't change the input value here
    console.log(`[RDP Modal] Debounced Save - Saving height: ${validatedHeight} (Input value: ${newHeight})`);
    settingsStore.updateSetting('rdpModalHeight', String(validatedHeight));
  }, DEBOUNCE_DELAY);
});

// Load initial size from settings store when component mounts or settings change
watchEffect(() => {
  const storeWidth = settingsStore.settings.rdpModalWidth;
  const storeHeight = settingsStore.settings.rdpModalHeight;
  console.log(`[RDP Modal] Loading size from store - Width: ${storeWidth}, Height: ${storeHeight}`); // +++ Add log +++
 
  // Use defaults from store if available, otherwise use component defaults
  const initialWidth = storeWidth ? parseInt(storeWidth, 10) : desiredModalWidth.value; // Use current ref value as fallback default
  const initialHeight = storeHeight ? parseInt(storeHeight, 10) : desiredModalHeight.value; // Use current ref value as fallback default

  // Validate against minimums
  const finalWidth = Math.max(MIN_MODAL_WIDTH, isNaN(initialWidth) ? MIN_MODAL_WIDTH : initialWidth);
  const finalHeight = Math.max(MIN_MODAL_HEIGHT, isNaN(initialHeight) ? MIN_MODAL_HEIGHT : initialHeight);
  console.log(`[RDP Modal] Applying validated size - Width: ${finalWidth}, Height: ${finalHeight}`); // +++ Add log +++
  desiredModalWidth.value = finalWidth;
  desiredModalHeight.value = finalHeight;
 });
 

onMounted(() => {
  // Initial size loading is now handled by watchEffect

  if (props.connection) {
    nextTick(async () => {
        await connectRdp(); // Connect using initial size
        // No need to setup observer anymore
    });
  } else {
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

onUnmounted(() => {
  disconnectRdp(); // This already calls stopResizeObserver
});

watch(() => props.connection, (newConnection, oldConnection) => {
  if (newConnection && newConnection.id !== oldConnection?.id) {
     nextTick(async () => {
        await connectRdp(); // Connect using initial size
        // No need to setup observer anymore
     });
  } else if (!newConnection) {
      disconnectRdp();
      statusMessage.value = t('remoteDesktopModal.errors.noConnection');
      connectionStatus.value = 'error';
  }
});

// Use the desired modal size directly for the style
const computedModalStyle = computed(() => {
  // const extraWidth = 40; // Removed from here as well
  // const headerHeight = 45; // Defined in connectRdp
  // const footerHeight = 35; // Defined in connectRdp
  // const extraHeight = headerHeight + footerHeight + 10; // Defined in connectRdp

  // Apply minimum constraints here for the actual modal style
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

       <div class="p-2 border-t border-border flex-shrink-0 text-xs text-text-secondary bg-header flex items-center justify-between">
         <span>{{ statusMessage }}</span>
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
             <!-- Add Reconnect Button -->
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