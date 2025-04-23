<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
// import apiClient from '../utils/apiClient'; // Removed apiClient
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../stores/session.store'; // Import session store
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '../stores/settings.store'; // +++ Import settings store +++

const { t } = useI18n();
const sessionStore = useSessionStore();
const { activeSession } = storeToRefs(sessionStore); // Get reactive active session
const settingsStore = useSettingsStore(); // +++ Get settings store instance +++
const { dockerDefaultExpandBoolean } = storeToRefs(settingsStore); // +++ Get reactive getter +++

// --- Interfaces ---
interface PortInfo {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: 'tcp' | 'udp' | string;
}

// --- Interfaces ---
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
  stats?: DockerStats | null; // ADDED: Assume stats are pushed with the container data
}

// --- NEW: Stats Interface (Example structure, adjust based on actual docker stats json output) ---
interface DockerStats {
    ID: string;
    Name: string;
    CPUPerc: string; // e.g., "0.07%"
    MemUsage: string; // e.g., "100MiB / 1.95GiB"
    MemPerc: string; // e.g., "5.00%"
    NetIO: string; // e.g., "1.5kB / 648B"
    BlockIO: string; // e.g., "10MB / 0B"
    PIDs: string; // e.g., "10"
    // Add other fields if available from `docker stats --format json`
}


// --- State ---
const containers = ref<DockerContainer[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const isDockerAvailable = ref(true); // This will now reflect remote docker availability
let refreshInterval: ReturnType<typeof setInterval> | null = null;
// REMOVED: statsRefreshInterval
let wsUnsubscribeHooks: (() => void)[] = []; // To store unsubscribe functions
// --- State for expansion (multiple allowed) ---
const expandedContainerIds = ref<Set<string>>(new Set()); // Use a Set to store multiple IDs
const initialLoadDone = ref(false); // +++ Flag for initial load processing +++
// REMOVED: containerStats, isStatsLoading, statsError maps


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

// Setup WebSocket listeners
const setupWsListeners = () => {
  clearWsListeners(); // Clear previous listeners first
  if (!activeSession.value) return;
  const wsManager = activeSession.value.wsManager;

  // Listener for Docker status updates
  // Listener for Docker status updates (SIMPLIFIED)
  const unsubStatus = wsManager.onMessage('docker:status:update', (payload) => {
      console.log('[DockerManager] Received docker:status:update', payload);
      isLoading.value = false; // Stop loading indicator

      if (payload && typeof payload.available === 'boolean') {
          isDockerAvailable.value = payload.available;
          if (payload.available && Array.isArray(payload.containers)) {
              // Directly replace the containers list with the received data
              // Assuming payload.containers includes the 'stats' property for each container
              containers.value = payload.containers as DockerContainer[];
              error.value = null;

              // Clean up expansion state for containers that no longer exist
              const currentIds = new Set(containers.value.map(c => c.id));
              const idsToRemove = new Set<string>();
              expandedContainerIds.value.forEach(id => {
                  if (!currentIds.has(id)) {
                      idsToRemove.add(id);
                  }
              });
              idsToRemove.forEach(id => expandedContainerIds.value.delete(id));

              // +++ Handle default expand on initial load +++
              if (!initialLoadDone.value && dockerDefaultExpandBoolean.value) {
                  console.log('[DockerManager] Applying default expand setting.');
                  containers.value.forEach(container => {
                      if (!expandedContainerIds.value.has(container.id)) {
                           expandedContainerIds.value.add(container.id);
                      }
                  });
                  initialLoadDone.value = true; // Mark initial load processed
              }
              // +++ End handle default expand +++

          } else {
              // Docker available but no containers, or Docker unavailable
              containers.value = [];
              error.value = null;
              expandedContainerIds.value.clear(); // Collapse all

              // Stop main refresh interval if Docker becomes unavailable remotely
              // (No stats interval to stop anymore)
              if (refreshInterval && !payload.available) {
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
          expandedContainerIds.value.clear(); // Collapse all

          if (refreshInterval) clearInterval(refreshInterval);
          refreshInterval = null;
          // No stats interval to stop
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

  // REMOVED: unsubStatsUpdate and unsubStatsError listeners

  wsUnsubscribeHooks.push(
      unsubStatus,
      unsubStatusError,
      unsubCommandError,
      unsubRequestUpdate
  );
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

// --- SIMPLIFIED: Method to toggle expansion ---
const toggleExpand = (containerId: string) => {
    if (expandedContainerIds.value.has(containerId)) {
        expandedContainerIds.value.delete(containerId);
        console.log(`[DockerManager] Collapsed container ${containerId}.`);
    } else {
        expandedContainerIds.value.add(containerId);
        console.log(`[DockerManager] Expanded container ${containerId}.`);
        // No need to request stats here, they should be in containers.value
    }
};

// REMOVED: requestExpandedStats function

// --- Lifecycle and Watchers ---

// --- SIMPLIFIED Watcher ---
watch([currentSessionId, sshConnectionStatus], ([newSessionId, newSshStatus], [oldSessionId, oldSshStatus]) => {
    console.log(`[DockerManager] Watch triggered. Session: ${oldSessionId}=>${newSessionId}, SSH Status: ${oldSshStatus}=>${newSshStatus}`);

    // --- Clear state and main interval on session change or SSH disconnect/error ---
    const resetStateAndInterval = () => {
        console.log('[DockerManager] Resetting state and clearing main interval.');
        containers.value = [];
        isLoading.value = false;
        error.value = null;
        isDockerAvailable.value = true; // Assume available until fetch attempt
        expandedContainerIds.value.clear(); // Clear expansion state
        initialLoadDone.value = false; // +++ Reset initial load flag +++

        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
            console.log('[DockerManager] Cleared main refresh interval.');
        }
        // No stats interval to clear
        clearWsListeners(); // Clear listeners
    };

    if (newSessionId !== oldSessionId || (newSessionId && (newSshStatus === 'disconnected' || newSshStatus === 'error'))) {
        resetStateAndInterval();
    }

    // --- Setup listeners and start main interval when session is active AND SSH is connected ---
    if (newSessionId && newSshStatus === 'connected') {
        // Only setup/start if we weren't already connected or interval isn't running
        if (oldSshStatus !== 'connected' || newSessionId !== oldSessionId || !refreshInterval) {
            console.log(`[DockerManager] Session ${newSessionId} connected. Setting up listeners and starting main interval.`);
            setupWsListeners();
            requestDockerStatus(); // Fetch initial status

            // Start main status refresh interval (if backend doesn't push automatically)
            // If backend *does* push automatically, this interval might be redundant or cause extra load.
            // Consider making the interval optional or configurable based on backend behavior.
            if (!refreshInterval) {
                 // Let's keep a slower interval for safety, maybe backend push fails sometimes
                refreshInterval = setInterval(requestDockerStatus, 15000); // Check status every 15 seconds
                console.log('[DockerManager] Main refresh interval started (15s).');
            }
            // No stats interval to start
        }
    } else if (newSessionId && newSshStatus === 'connecting') {
        isLoading.value = true;
        error.value = null;
        containers.value = [];
        isDockerAvailable.value = false;
        console.log('[DockerManager] SSH is connecting, waiting...');
        // Ensure main interval is stopped while connecting
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = null;
    } else {
        // Handle cases like no active session or other statuses
        isLoading.value = false;
        console.log('[DockerManager] No active session or SSH not connected/connecting.');
        // Ensure main interval is stopped if not connected
         if (refreshInterval) clearInterval(refreshInterval);
         refreshInterval = null;
    }

}, { immediate: true });


// --- SIMPLIFIED onUnmounted ---
onUnmounted(() => {
    console.log('[DockerManager] Component unmounted.');
    clearWsListeners(); // Clean up listeners
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('[DockerManager] Main refresh interval cleared on unmount.');
    }
    // No stats interval to clear
});

</script>

<template>
  <div class="docker-manager flex flex-col h-full overflow-hidden bg-background text-foreground">
     <!-- Case 1: No active session -->
     <div v-if="!currentSessionId" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
        <i class="fas fa-plug text-4xl mb-3"></i>
        <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.error.noActiveSession') }}</p>
        <small class="text-xs max-w-[80%] text-text-disabled">{{ t('dockerManager.error.connectFirst') }}</small>
    </div>
    <!-- Case 2: Active session, SSH connecting -->
    <div v-else-if="sshConnectionStatus === 'connecting'" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
        <i class="fas fa-spinner fa-spin text-4xl mb-3"></i>
        <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.waitingForSsh') }}</p>
        <small class="text-xs max-w-[80%] text-text-disabled">{{ activeSession?.wsManager.statusMessage.value || '...' }}</small>
     </div>
     <!-- Case 3: Active session, SSH disconnected -->
      <div v-else-if="sshConnectionStatus === 'disconnected'" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
         <i class="fas fa-unlink text-4xl mb-3"></i>
         <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.error.sshDisconnected') }}</p>
         <small class="text-xs max-w-[80%] text-text-disabled">{{ activeSession?.wsManager.statusMessage.value || '...' }}</small>
      </div>
     <!-- Case 4: Active session, SSH error -->
      <div v-else-if="sshConnectionStatus === 'error'" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
         <i class="fas fa-exclamation-circle text-3xl text-red-500 mb-2"></i>
         <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.error.sshError') }}</p>
         <small class="text-xs max-w-[80%]">{{ activeSession?.wsManager.statusMessage.value || 'Unknown SSH error' }}</small>
      </div>
     <!-- Case 5: Active session, SSH connected, Docker loading -->
    <div v-else-if="isLoading && containers.length === 0" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
        <i class="fas fa-spinner fa-spin text-4xl mb-3"></i> {{ t('dockerManager.loading') }}
    </div>
     <!-- Case 6: Active session, SSH connected, Docker unavailable -->
    <div v-else-if="!isDockerAvailable" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
        <i class="fab fa-docker text-4xl mb-3"></i>
        <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.notAvailable') }}</p>
        <small class="text-xs max-w-[80%] text-text-disabled">{{ t('dockerManager.installHintRemote') }}</small>
    </div>
     <!-- Case 7: Active session, SSH connected, Fetch error -->
     <div v-else-if="error" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary p-4">
        <i class="fas fa-exclamation-triangle text-3xl text-red-500 mb-2"></i>
        <p class="mt-2 mb-1 font-medium">{{ t('dockerManager.error.fetchFailed') }}</p>
        <small class="text-xs max-w-[80%]">{{ error }}</small>
     </div>
     <!-- Case 8: Active session, SSH connected, Docker available, show list -->
    <div v-else class="docker-content-area flex-grow overflow-auto">
      <div v-if="containers.length === 0 && !isLoading" class="flex flex-col justify-center items-center text-center flex-grow text-text-secondary h-full">
        {{ t('dockerManager.noContainers') }}
      </div>
      <table v-else class="w-full border-collapse text-sm">
        <thead class="responsive-thead"> <!-- Use class for CSS control -->
          <tr class="bg-header">
            <th class="w-8 px-2 py-2 border-b border-border"></th> <!-- Expand Col -->
            <th class="px-3 py-2 border-b border-border text-left font-medium text-text-secondary uppercase tracking-wider">{{ t('dockerManager.header.name') }}</th>
            <th class="px-3 py-2 border-b border-border text-left font-medium text-text-secondary uppercase tracking-wider">{{ t('dockerManager.header.image') }}</th>
            <th class="px-3 py-2 border-b border-border text-left font-medium text-text-secondary uppercase tracking-wider">{{ t('dockerManager.header.status') }}</th>
            <th class="px-3 py-2 border-b border-border text-left font-medium text-text-secondary uppercase tracking-wider">{{ t('dockerManager.header.ports') }}</th>
            <th class="px-3 py-2 border-b border-border text-left font-medium text-text-secondary uppercase tracking-wider">{{ t('dockerManager.header.actions') }}</th>
          </tr>
        </thead>
        <!-- Use template v-for to render pairs of rows -->
        <tbody class="responsive-tbody"> <!-- Use class for CSS control -->
          <template v-for="container in containers" :key="container.id">
            <!-- Main Row / Card Container -->
            <tr class="responsive-tr mb-4 border border-border rounded p-3 bg-background shadow-sm relative hover:bg-header/30 transition-colors duration-150"
                :class="{'expanded': expandedContainerIds.has(container.id)}">
              <!-- Expand Button Cell (Desktop only) -->
              <td class="responsive-td-expand w-8 px-2 py-2 border-b border-border text-center align-middle">
                <button @click="toggleExpand(container.id)" class="text-text-secondary hover:text-foreground transition-colors duration-150 p-1 text-xs" :title="expandedContainerIds.has(container.id) ? t('common.collapse') : t('common.expand')">
                  <i :class="['fas', expandedContainerIds.has(container.id) ? 'fa-chevron-down' : 'fa-chevron-right']"></i>
                </button>
              </td>
              <!-- Name Cell -->
              <td class="responsive-td px-3 py-2 border-b border-border align-middle text-right" :data-label="t('dockerManager.header.name')">
                <span class="font-medium">{{ container.Names?.join(', ') || 'N/A' }}</span>
              </td>
              <!-- Image Cell -->
              <td class="responsive-td px-3 py-2 border-b border-border align-middle text-right break-all" :data-label="t('dockerManager.header.image')">
                {{ container.Image }}
              </td>
              <!-- Status Cell -->
              <td class="responsive-td px-3 py-2 border-b border-border align-middle text-right" :data-label="t('dockerManager.header.status')">
                  <span :class="['px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap',
                                 container.State === 'running' ? 'bg-green-500' :
                                 container.State === 'exited' ? 'bg-red-500' :
                                 container.State === 'paused' ? 'bg-yellow-500 text-gray-800' :
                                 container.State === 'restarting' ? 'bg-blue-500' :
                                 'bg-gray-500']">
                      {{ container.Status }}
                  </span>
              </td>
              <!-- Ports Cell -->
              <td class="responsive-td px-3 py-2 border-b border-border align-middle text-right break-all" :data-label="t('dockerManager.header.ports')">
                {{ container.Ports?.map(p => `${p.IP ? p.IP + ':' : ''}${p.PublicPort ? p.PublicPort + '->' : ''}${p.PrivatePort}/${p.Type}`).join(', ') || 'N/A' }}
              </td>
              <!-- Actions Cell -->
              <td class="responsive-td px-3 py-2 border-b border-border align-middle text-right" :data-label="t('dockerManager.header.actions')">
                <div class="responsive-actions-container flex justify-end gap-2 flex-wrap pt-2">
                  <button @click="sendDockerCommand(container.id, 'start')" :title="t('dockerManager.action.start')" class="text-text-secondary hover:text-green-500 disabled:text-text-disabled disabled:cursor-not-allowed transition-colors duration-150 p-0.5 text-base" :disabled="container.State === 'running'">
                    <i class="fas fa-play"></i>
                  </button>
                  <button @click="sendDockerCommand(container.id, 'stop')" :title="t('dockerManager.action.stop')" class="text-text-secondary hover:text-yellow-500 disabled:text-text-disabled disabled:cursor-not-allowed transition-colors duration-150 p-0.5 text-base" :disabled="container.State !== 'running'">
                     <i class="fas fa-stop"></i>
                  </button>
                  <button @click="sendDockerCommand(container.id, 'restart')" :title="t('dockerManager.action.restart')" class="text-text-secondary hover:text-blue-500 disabled:text-text-disabled disabled:cursor-not-allowed transition-colors duration-150 p-0.5 text-base" :disabled="container.State !== 'running'">
                     <i class="fas fa-sync-alt"></i>
                  </button>
                   <button @click="sendDockerCommand(container.id, 'remove')" :title="t('dockerManager.action.remove')" class="text-text-secondary hover:text-red-500 disabled:text-text-disabled disabled:cursor-not-allowed transition-colors duration-150 p-0.5 text-base" :disabled="container.State === 'running'">
                     <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              </td>

              <!-- Card Expansion Cell (Mobile only) -->
              <td class="responsive-td-card-expand w-full p-0 border-t border-border mt-3">
                <!-- Card Footer Button (Show when NOT expanded) -->
                <div v-if="!expandedContainerIds.has(container.id)">
                   <button @click="toggleExpand(container.id)" class="flex items-center justify-center w-full h-10 text-text-secondary hover:text-foreground hover:bg-header/50 transition-colors duration-150 text-sm rounded-b">
                     <i class="fas fa-chevron-down mr-1.5"></i> {{ t('common.expand') }}
                   </button>
                </div>
                <!-- Card Expansion Content (Show when expanded) -->
                <div v-if="expandedContainerIds.has(container.id)" class="bg-header/30 rounded-b">
                   <div class="p-4"> <!-- Stats Container -->
                      <dl v-if="container.stats" class="grid grid-cols-[max-content_auto] gap-x-4 gap-y-2 text-xs">
                        <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.cpu') }}</dt>
                        <dd class="font-mono">{{ container.stats.CPUPerc ?? 'N/A' }}</dd>
                        <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.memory') }}</dt>
                        <dd class="font-mono">{{ container.stats.MemUsage ?? 'N/A' }} ({{ container.stats.MemPerc ?? 'N/A' }})</dd>
                        <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.netIO') }}</dt>
                        <dd class="font-mono">{{ container.stats.NetIO ?? 'N/A' }}</dd>
                        <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.blockIO') }}</dt>
                        <dd class="font-mono">{{ container.stats.BlockIO ?? 'N/A' }}</dd>
                        <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.pids') }}</dt>
                        <dd class="font-mono">{{ container.stats.PIDs ?? 'N/A' }}</dd>
                      </dl>
                      <div v-else class="text-center text-text-secondary italic text-xs py-2">
                          {{ t('dockerManager.stats.noData') }}
                      </div>
                   </div>
                   <!-- Collapse Button for Card View -->
                   <button @click="toggleExpand(container.id)" class="flex items-center justify-center w-full h-10 text-text-secondary hover:text-foreground hover:bg-header/50 transition-colors duration-150 text-sm border-t border-border rounded-b">
                       <i class="fas fa-chevron-up mr-1.5"></i> {{ t('common.collapse') }}
                   </button>
                </div>
              </td>
            </tr>

          <!-- Desktop Expansion Row (Hidden on mobile) -->
          <tr v-if="expandedContainerIds.has(container.id)" class="responsive-expansion-row">
            <td :colspan="6" class="p-0 border-b border-border">
              <div class="bg-header/30 p-4"> <!-- Stats Container -->
                <dl v-if="container.stats" class="grid grid-cols-[max-content_auto] gap-x-4 gap-y-2 text-xs">
                  <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.cpu') }}</dt>
                  <dd class="font-mono">{{ container.stats.CPUPerc ?? 'N/A' }}</dd>
                  <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.memory') }}</dt>
                  <dd class="font-mono">{{ container.stats.MemUsage ?? 'N/A' }} ({{ container.stats.MemPerc ?? 'N/A' }})</dd>
                  <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.netIO') }}</dt>
                  <dd class="font-mono">{{ container.stats.NetIO ?? 'N/A' }}</dd>
                  <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.blockIO') }}</dt>
                  <dd class="font-mono">{{ container.stats.BlockIO ?? 'N/A' }}</dd>
                  <dt class="font-medium text-text-secondary">{{ t('dockerManager.stats.pids') }}</dt>
                  <dd class="font-mono">{{ container.stats.PIDs ?? 'N/A' }}</dd>
                </dl>
                 <div v-else class="text-center text-text-secondary italic text-xs py-2">
                     {{ t('dockerManager.stats.noData') }}
                 </div>
              </div>
            </td>
          </tr>
          <!-- Removed original separate card-footer-row and expansion-card-row -->
        </template> <!-- End v-for template -->
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Define the component root as a size container */
.docker-manager {
  container-type: inline-size; /* Define as a size container */
  container-name: docker-manager-pane; /* Optional: give it a name */
}

/* --- Responsive Table Styles using Container Query --- */

/* Default styles (Table view) - Applied via classes in template */
.responsive-thead { display: table-header-group; }
.responsive-tbody { display: table-row-group; }
.responsive-tr { display: table-row; }
.responsive-td { display: table-cell; vertical-align: middle; } /* Added vertical-align */
.responsive-td-expand { display: table-cell; vertical-align: middle; } /* Desktop expand button cell */
.responsive-td-card-expand { display: none; } /* Hide card expansion cell */
.responsive-expansion-row { display: table-row; } /* Desktop expansion row */
.responsive-actions-container { justify-content: flex-start; } /* Align actions left in table */

/* Styles for Card View when container is narrow */
@container docker-manager-pane (max-width: 600px) { /* Use container query, adjust breakpoint if needed */
  /* +++ Add padding to content area in card view +++ */
  .docker-content-area {
    padding: 1rem; /* Equivalent to p-4 */
  }
  /* +++ End padding rule +++ */

  .responsive-thead.responsive-thead { /* Increased specificity */
    display: none; /* Hide table header */
  }

  .responsive-tbody.responsive-tbody { /* Increased specificity */
    display: block; /* Make body behave like block */
  }

  .responsive-tr.responsive-tr { /* Increased specificity */
    display: block; /* Make rows behave like blocks/cards */
    /* Tailwind classes in template handle margin, border, padding, bg, shadow */
  }

  .responsive-td.responsive-td { /* Increased specificity */
    display: block; /* Stack cells vertically */
    text-align: right; /* Align cell content to the right */
    padding-left: 50%; /* Make space for the label */
    position: relative; /* Needed for pseudo-element positioning */
    /* Tailwind classes in template handle padding-top/bottom */
    border-bottom: 1px dashed var(--border-color-light); /* Add separator */
  }
   /* Remove border from last visible cell in card view (which is now the actions cell) */
   /* Specificity already high enough with td context */
   .responsive-tr td.responsive-td:last-of-type {
       border-bottom: none;
   }
   /* Also remove border from the hidden card expansion cell if it were visible */
    .responsive-tr td.responsive-td-card-expand {
         border-bottom: none;
    }


  .responsive-td.responsive-td::before { /* Increased specificity */
    content: attr(data-label); /* Display the label */
    position: absolute;
    left: 0.75rem; /* Corresponds to p-3 left padding in template */
    width: calc(50% - 1.5rem); /* Calculate label width based on p-3 */
    padding-right: 10px;
    white-space: nowrap;
    text-align: left; /* Align label text to the left */
    font-weight: 600; /* Tailwind font-bold */
    color: var(--text-color-secondary); /* Tailwind text-text-secondary */
  }

  /* Hide desktop expand button cell in card view */
  .responsive-td-expand.responsive-td-expand { /* Increased specificity */
      display: none; /* Removed !important */
  }

  /* Show card expansion cell in card view */
  .responsive-td-card-expand.responsive-td-card-expand { /* Increased specificity */
    display: block;
    /* Tailwind classes in template handle width, padding, border, margin */
  }
   .responsive-td-card-expand.responsive-td-card-expand::before { /* Increased specificity */
     display: none; /* No label for this cell */
   }

  /* Align actions right in card view */
  .responsive-actions-container.responsive-actions-container { /* Increased specificity */
    justify-content: flex-end;
    /* Tailwind pt-2 in template handles top padding */
  }
   /* Remove label for actions cell in card view */
   /* Specificity already high enough with attribute selector */
   .responsive-td[data-label*="Actions"]::before {
       content: ''; /* Override label */
       display: none; /* Hide label space */
   }
    .responsive-td[data-label*="Actions"] {
        padding-left: 0.75rem; /* Reset padding-left for actions cell */
        /* border-bottom: none; /* Already handled by last-of-type */
    }


   /* Hide the table-specific expansion row in card view */
   .responsive-expansion-row.responsive-expansion-row { /* Increased specificity */
       display: none; /* Removed !important */
   }
}
/* --- End Responsive Table Styles --- */

/* Minimal styles needed - Tailwind handles most */

</style>
