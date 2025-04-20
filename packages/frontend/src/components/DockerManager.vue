<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
// import apiClient from '../utils/apiClient'; // Removed apiClient
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../stores/session.store'; // Import session store
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const sessionStore = useSessionStore();
const { activeSession } = storeToRefs(sessionStore); // Get reactive active session

// --- Interfaces (Keep these) ---
interface PortInfo {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: 'tcp' | 'udp' | string;
}

interface DockerContainer {
  id: string; // <--- Changed from Id to id
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: 'created' | 'restarting' | 'running' | 'removing' | 'paused' | 'exited' | 'dead' | string;
  Status: string;
  Ports: PortInfo[];
  Labels: Record<string, string>;
}

// --- State ---
const containers = ref<DockerContainer[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const isDockerAvailable = ref(true); // This will now reflect remote docker availability
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let wsUnsubscribeHooks: (() => void)[] = []; // To store unsubscribe functions

// --- Computed ---
const currentSessionId = computed(() => activeSession.value?.sessionId);
// Add computed property for SSH connection status
const sshConnectionStatus = computed(() => activeSession.value?.wsManager.connectionStatus.value ?? 'disconnected');

// --- Methods ---

// Clear existing WebSocket listeners
const clearWsListeners = () => {
  wsUnsubscribeHooks.forEach(unsub => unsub());
  wsUnsubscribeHooks = [];
};

// Setup WebSocket listeners for the current active session
const setupWsListeners = () => {
  clearWsListeners(); // Clear previous listeners first
  if (!activeSession.value) return;

  const wsManager = activeSession.value.wsManager;

  // Listener for Docker status updates
  const unsubStatus = wsManager.onMessage('docker:status:update', (payload) => {
    console.log('[DockerManager] Received docker:status:update', payload);
    isLoading.value = false; // Stop loading indicator
    if (payload && typeof payload.available === 'boolean') {
      isDockerAvailable.value = payload.available;
      if (payload.available && Array.isArray(payload.containers)) {
        containers.value = payload.containers;
        error.value = null;
      } else {
        containers.value = [];
        error.value = null; // Clear error if Docker just unavailable
        // Stop interval if Docker becomes unavailable remotely
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
            console.log('[DockerManager] Stopped refresh interval due to remote Docker unavailability.');
        }
      }
    } else {
        // Handle invalid payload
        isDockerAvailable.value = false;
        containers.value = [];
        error.value = t('dockerManager.error.invalidResponse');
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = null;
    }
  });

  // Listener for Docker status fetch errors
  const unsubStatusError = wsManager.onMessage('docker:status:error', (payload) => {
      console.error('[DockerManager] Received docker:status:error', payload);
      isLoading.value = false;
      error.value = payload?.message || t('dockerManager.error.fetchFailed');
      isDockerAvailable.value = false; // Assume unavailable on error
      containers.value = [];
      if (refreshInterval) clearInterval(refreshInterval); // Stop interval on error
      refreshInterval = null;
  });

  // Listener for Docker command execution errors (optional, could use notifications)
  const unsubCommandError = wsManager.onMessage('docker:command:error', (payload) => {
      console.error('[DockerManager] Received docker:command:error', payload);
      // Display error to user (e.g., using a notification system)
      alert(`${t('dockerManager.error.commandFailed', { command: payload?.command || '?' })}: ${payload?.message || 'Unknown error'}`);
  });

  // --- NEW: Listener for backend requesting a status update ---
  const unsubRequestUpdate = wsManager.onMessage('request_docker_status_update', () => {
      console.log('[DockerManager] Received request_docker_status_update from backend.');
      // Debounce or add slight delay? Maybe not needed if backend delay is sufficient.
      requestDockerStatus(); // Trigger a status refresh immediately
  });

  wsUnsubscribeHooks.push(unsubStatus, unsubStatusError, unsubCommandError, unsubRequestUpdate); // Add new unsubscribe hook
};


// Request Docker status via WebSocket - NOW CHECKS SSH STATUS
const requestDockerStatus = () => {
  // Only request if SSH is connected
  if (sshConnectionStatus.value !== 'connected') {
    console.log(`[DockerManager] SSH not connected (status: ${sshConnectionStatus.value}), skipping Docker status request.`);
    // No need to set loading=false here, as it should only be set true when connected
    return;
  }
   if (!activeSession.value) { // Should not happen if ssh is connected, but for safety
       console.warn('[DockerManager] requestDockerStatus called without active session.');
       return;
   }

  console.log(`[DockerManager] Requesting Docker status for session ${activeSession.value.sessionId}`);
  isLoading.value = true; // Show loading indicator
  error.value = null; // Clear previous error
  activeSession.value.wsManager.sendMessage({ type: 'docker:get_status' });
};

// Send command for a specific container via WebSocket
const sendDockerCommand = (containerId: string, command: 'start' | 'stop' | 'restart' | 'remove') => {
   // Check SSH status first
   if (sshConnectionStatus.value !== 'connected') {
       console.warn('[DockerManager] Cannot send command, SSH not connected.');
       alert(t('dockerManager.error.sshNotConnected')); // Inform user
       return;
   }
   if (!activeSession.value) { // Safety check
       console.warn('[DockerManager] Cannot send command, no active session.');
       return;
   }
   if (!isDockerAvailable.value) {
      console.warn('[DockerManager] Cannot send command, remote Docker is not available.');
      alert(t('dockerManager.notAvailable'));
      return;
   }

  console.log(`[DockerManager] Sending command '${command}' for container ${containerId} via session ${activeSession.value.sessionId}`);
  activeSession.value.wsManager.sendMessage({
    type: 'docker:command',
    payload: { containerId, command }
  });
  // Optionally trigger a status refresh sooner after a command
  // setTimeout(requestDockerStatus, 500); // e.g., refresh after 0.5s

  // --- 添加日志，检查传入的 containerId ---
  console.log(`[DockerManager] Preparing to send command. containerId: "${containerId}" (Type: ${typeof containerId}), command: "${command}"`);
  // --- 结束日志 ---

  console.log(`[DockerManager] Sending command '${command}' for container ${containerId} via session ${activeSession.value.sessionId}`);
  activeSession.value.wsManager.sendMessage({
    type: 'docker:command',
    payload: { containerId, command }
  });
};

// --- Lifecycle and Watchers ---

// Watch for changes in the active session OR SSH connection status
watch([currentSessionId, sshConnectionStatus], ([newSessionId, newSshStatus], [oldSessionId, oldSshStatus]) => {
  console.log(`[DockerManager] Watch triggered. Session: ${oldSessionId}=>${newSessionId}, SSH Status: ${oldSshStatus}=>${newSshStatus}`);

  // --- Reset state on session change or SSH disconnect/error ---
  if (newSessionId !== oldSessionId || (newSessionId && (newSshStatus === 'disconnected' || newSshStatus === 'error'))) {
      console.log('[DockerManager] Resetting state due to session change or SSH disconnect/error.');
      containers.value = [];
      isLoading.value = false;
      error.value = null;
      isDockerAvailable.value = true; // Assume available until fetch attempt

      if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
          console.log('[DockerManager] Cleared refresh interval.');
      }
      clearWsListeners(); // Clear listeners on disconnect or session change
  }

  // --- Setup listeners and fetch data when session is active AND SSH is connected ---
  if (newSessionId && newSshStatus === 'connected') {
      // Only setup listeners/fetch if we weren't already connected in this session
      if (oldSshStatus !== 'connected' || newSessionId !== oldSessionId) {
          console.log(`[DockerManager] Session ${newSessionId} connected. Setting up listeners and fetching initial status.`);
          setupWsListeners();
          requestDockerStatus(); // Fetch initial status now that SSH is connected

          // Start interval only when SSH is connected
          if (!refreshInterval) {
              refreshInterval = setInterval(requestDockerStatus, 1000); // Check status every second
              console.log('[DockerManager] Refresh interval started.');
          }
      }
  } else if (newSessionId && newSshStatus === 'connecting') { // <--- Removed 'initializing' check
       // If connecting, ensure loading indicator is potentially active, but don't fetch yet
       isLoading.value = true; // Show loading as SSH connects
       error.value = null; // Clear previous errors
       containers.value = []; // Clear old containers
       isDockerAvailable.value = false; // Docker not available until SSH connects
       console.log('[DockerManager] SSH is connecting, waiting...');
  } else {
      // Handle cases like no active session (newSessionId is null)
      isLoading.value = false; // Ensure loading is off if no session
      console.log('[DockerManager] No active session or SSH not connected.');
  }

}, { immediate: true, deep: true }); // immediate: true to run on initial mount, deep might be needed for status object?


onUnmounted(() => {
  console.log('[DockerManager] Component unmounted.');
  clearWsListeners(); // Clean up listeners
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('[DockerManager] Refresh interval cleared on unmount.');
  }
});

</script>

<template>
  <div class="docker-manager pane-content">
     <!-- Case 1: No active session -->
     <div v-if="!currentSessionId" class="unavailable-placeholder">
        <i class="fas fa-plug"></i>
        <p>{{ t('dockerManager.error.noActiveSession') }}</p>
        <small>{{ t('dockerManager.error.connectFirst') }}</small>
    </div>
    <!-- Case 2: Active session, SSH connecting -->
    <div v-else-if="sshConnectionStatus === 'connecting'" class="loading-placeholder"> <!-- <--- Removed 'initializing' check -->
        <i class="fas fa-spinner fa-spin"></i>
        <p>{{ t('dockerManager.waitingForSsh') }}</p>
        <small>{{ activeSession?.wsManager.statusMessage.value || '...' }}</small>
     </div>
     <!-- Case 3: Active session, SSH disconnected -->
      <div v-else-if="sshConnectionStatus === 'disconnected'" class="unavailable-placeholder">
         <i class="fas fa-unlink"></i>
         <p>{{ t('dockerManager.error.sshDisconnected') }}</p>
         <small>{{ activeSession?.wsManager.statusMessage.value || '...' }}</small>
      </div>
     <!-- Case 4: Active session, SSH error -->
      <div v-else-if="sshConnectionStatus === 'error'" class="error-placeholder">
         <i class="fas fa-exclamation-circle error-icon"></i>
         <p>{{ t('dockerManager.error.sshError') }}</p>
         <small>{{ activeSession?.wsManager.statusMessage.value || 'Unknown SSH error' }}</small>
      </div>
     <!-- Case 5: Active session, SSH connected, Docker loading -->
    <div v-else-if="isLoading && containers.length === 0" class="loading-placeholder">
        <i class="fas fa-spinner fa-spin"></i> {{ t('dockerManager.loading') }}
    </div>
     <!-- Case 6: Active session, SSH connected, Docker unavailable -->
    <div v-else-if="!isDockerAvailable" class="unavailable-placeholder">
        <i class="fab fa-docker error-icon"></i>
        <p>{{ t('dockerManager.notAvailable') }}</p>
        <small>{{ t('dockerManager.installHintRemote') }}</small> <!-- Use a remote-specific hint -->
    </div>
     <!-- Case 7: Active session, SSH connected, Fetch error -->
     <div v-else-if="error" class="error-placeholder">
        <i class="fas fa-exclamation-triangle error-icon"></i>
        <p>{{ t('dockerManager.error.fetchFailed') }}</p>
        <small>{{ error }}</small>
     </div>
     <!-- Case 8: Active session, SSH connected, Docker available, show list -->
    <div v-else class="container-list">
      <div v-if="containers.length === 0 && !isLoading" class="empty-placeholder">
        {{ t('dockerManager.noContainers') }}
      </div>
      <!-- Add class="responsive-table" -->
      <table v-else class="responsive-table">
        <thead>
          <tr>
            <th>{{ t('dockerManager.header.name') }}</th>
            <th>{{ t('dockerManager.header.image') }}</th>
            <th>{{ t('dockerManager.header.status') }}</th>
            <th>{{ t('dockerManager.header.ports') }}</th>
            <th>{{ t('dockerManager.header.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="container in containers" :key="container.id">
            <!-- Add data-label attributes -->
            <td :data-label="t('dockerManager.header.name')">{{ container.Names?.join(', ') || 'N/A' }}</td>
            <td :data-label="t('dockerManager.header.image')">{{ container.Image }}</td>
            <td :data-label="t('dockerManager.header.status')">
                <span :class="['status-badge', `status-${container.State?.toLowerCase()}`]">
                    {{ container.Status }}
                </span>
            </td>
            <td :data-label="t('dockerManager.header.ports')">{{ container.Ports?.map(p => `${p.IP ? p.IP + ':' : ''}${p.PublicPort ? p.PublicPort + '->' : ''}${p.PrivatePort}/${p.Type}`).join(', ') || 'N/A' }}</td>
            <td :data-label="t('dockerManager.header.actions')" class="action-buttons">
              <button @click="sendDockerCommand(container.id, 'start')" :title="t('dockerManager.action.start')" class="action-btn start" :disabled="container.State === 'running'">
                <i class="fas fa-play"></i>
              </button>
              <button @click="sendDockerCommand(container.id, 'stop')" :title="t('dockerManager.action.stop')" class="action-btn stop" :disabled="container.State !== 'running'">
                 <i class="fas fa-stop"></i>
              </button>
              <button @click="sendDockerCommand(container.id, 'restart')" :title="t('dockerManager.action.restart')" class="action-btn restart" :disabled="container.State !== 'running'">
                 <i class="fas fa-sync-alt"></i>
              </button>
               <button @click="sendDockerCommand(container.id, 'remove')" :title="t('dockerManager.action.remove')" class="action-btn remove" :disabled="container.State === 'running'">
                 <i class="fas fa-trash-alt"></i>
              </button>
              <!-- Log button removed as per user request -->
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Styles remain largely the same */
/* --- Define the component root as a size container --- */
/* Remove padding from the main container */
.docker-manager {
  /* padding: var(--base-padding, 1rem); */ /* Removed */
  display: flex;
  flex-direction: column;
  height: 100%;
  /* overflow-y: auto; */ /* Let children handle scroll */
  background-color: var(--app-bg-color);
  color: var(--text-color);
  container-type: inline-size; /* Define as a size container */
  container-name: docker-manager-pane; /* Optional: give it a name */
  overflow: hidden; /* Prevent double scrollbars */
}

/* Add padding to placeholders */
.loading-placeholder,
.error-placeholder,
.unavailable-placeholder,
.empty-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  flex-grow: 1;
  color: var(--text-color-secondary);
  height: 100%;
  padding: var(--base-padding, 1rem); /* Added padding */
}
.unavailable-placeholder i:first-child, .loading-placeholder i:first-child { /* Target the icon */
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
}
.unavailable-placeholder p, .loading-placeholder p {
    margin-top: 0.5rem;
    margin-bottom: 0.3rem;
    font-weight: 500;
}
.unavailable-placeholder small, .loading-placeholder small {
    font-size: 0.8em;
    max-width: 80%;
    color: var(--text-color-disabled); /* Lighter color for subtext */
}


.error-placeholder p {
    margin-top: 0.5rem;
    margin-bottom: 0.3rem;
    font-weight: 500;
}
.error-placeholder small {
    font-size: 0.8em;
    max-width: 80%;
}

.error-icon {
    font-size: 2rem;
    color: var(--color-danger, #dc3545);
    margin-bottom: 0.5rem;
}
.unavailable-placeholder .error-icon { /* Style for docker icon when unavailable */
     color: var(--text-color-secondary);
}


/* Add padding to the scrollable container and handle overflow */
.container-list {
  flex-grow: 1;
  overflow: auto; /* Use auto for both x and y scroll */
  padding: var(--base-padding, 1rem); /* Added padding */
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

th, td {
  padding: 0.6rem 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color-light, #eee);
  white-space: nowrap;
}
td:first-child, th:first-child {
    white-space: normal;
}


th {
  background-color: var(--header-bg-color);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

tbody tr:hover {
  background-color: var(--hover-bg-color, #f5f5f5);
}

.status-badge {
    padding: 0.2em 0.6em;
    border-radius: 10px;
    font-size: 0.8em;
    font-weight: 500;
    color: #fff;
    background-color: var(--text-color-secondary);
}

.status-running { background-color: var(--color-success, #28a745); }
.status-exited { background-color: var(--color-danger, #dc3545); }
.status-paused { background-color: var(--color-warning, #ffc107); color: #333; }
.status-restarting { background-color: var(--color-info, #17a2b8); }
.status-created { background-color: var(--text-color-secondary); }


.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: none;
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 0.3rem;
  font-size: 1rem;
  transition: color 0.2s ease;
}
.action-btn[disabled] {
    color: var(--text-color-disabled);
    cursor: not-allowed;
}
.action-btn:not([disabled]):hover {
  color: var(--text-color);
}
.action-btn.start:not([disabled]):hover { color: var(--color-success, #28a745); }
.action-btn.stop:not([disabled]):hover { color: var(--color-warning, #ffc107); }
.action-btn.restart:not([disabled]):hover { color: var(--color-info, #17a2b8); }
.action-btn.remove:not([disabled]):hover { color: var(--color-danger, #dc3545); }

/* --- Responsive Table Styles using Container Query --- */
/* Target the container directly */
@container (max-width: 768px) {
  .responsive-table {
    border: none; /* Remove table border */
  }

  .responsive-table thead {
    display: none; /* Hide table header */
  }

  .responsive-table tr {
    display: block; /* Make rows behave like blocks/cards */
    margin-bottom: 1rem; /* Space between cards */
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-medium, 4px);
    padding: 0.8rem;
    background-color: var(--item-bg-color, var(--app-bg-color)); /* Card background */
    box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
  }

  .responsive-table td {
    display: block; /* Stack cells vertically */
    text-align: right; /* Align cell content to the right */
    padding-left: 50%; /* Make space for the label */
    position: relative; /* Needed for pseudo-element positioning */
    border-bottom: none; /* Remove default bottom border */
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
    white-space: normal; /* Keep allowing wrapping */
    word-break: break-all; /* Add this to force breaks in long strings */
  }
   .responsive-table td:not(:last-child) {
       /* Optional: add a subtle separator between fields in a card */
       border-bottom: 1px dashed var(--border-color-light);
   }


  .responsive-table td::before {
    content: attr(data-label); /* Display the label */
    position: absolute;
    left: 0.8rem; /* Position label on the left */
    width: calc(50% - 1.6rem); /* Calculate label width */
    padding-right: 10px;
    white-space: nowrap;
    text-align: left; /* Align label text to the left */
    font-weight: bold;
    color: var(--text-color-secondary);
  }

  /* Adjust specific cells if needed */
   .responsive-table td:first-child { /* e.g., Name */
       font-weight: 500; /* Make name slightly bolder */
   }

  .responsive-table .action-buttons {
    text-align: right; /* Keep buttons aligned right */
    padding-left: 0; /* Remove padding override for actions */
    padding-top: 0.8rem; /* Add some space above buttons */
    border-bottom: none; /* Ensure no border below buttons */
    display: flex; /* Use flex for better button alignment */
    justify-content: flex-end; /* Align buttons to the right */
    flex-wrap: wrap; /* Allow buttons to wrap */
    gap: 0.5rem; /* Keep gap between buttons */
  }
   .responsive-table .action-buttons::before {
       display: none; /* Hide label for action buttons cell */
   }
   .responsive-table .action-buttons button {
       /* Ensure buttons don't get too small */
       min-width: 30px;
   }

   /* Adjust status badge alignment and prevent wrapping */
   .responsive-table td[data-label*="Status"] {
       display: flex; /* Use flexbox for alignment */
       justify-content: flex-end; /* Align badge to the right */
       align-items: center; /* Vertically align if needed */
   }
   .responsive-table td[data-label*="Status"] span.status-badge {
       /* float: right; */ /* Removed float */
       white-space: nowrap; /* Prevent text inside badge from wrapping */
       flex-shrink: 0; /* Prevent badge from shrinking */
   }
}
/* --- End Responsive Table Styles --- */

</style>