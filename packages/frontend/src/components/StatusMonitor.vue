<template>
  <!-- Root element with padding, background, border, and text styles -->
  <div class="status-monitor p-4 bg-background text-foreground h-full overflow-y-auto text-sm">
    <!-- Title with margin, border, padding, font size, and color -->
    <h4 class="mt-0 mb-4 border-b border-border pb-2 text-base font-medium">
      {{ t('statusMonitor.title') }}
    </h4>

    <!-- Error State -->
    <div v-if="statusError" class="status-error flex flex-col items-center justify-center text-center text-red-500 mt-4 h-full">
       <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
       <span>{{ t('statusMonitor.errorPrefix') }} {{ statusError }}</span>
    </div>

    <!-- Loading State -->
    <div v-else-if="!serverStatus" class="loading-status flex flex-col items-center justify-center text-center text-text-secondary mt-4 h-full">
      <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
      <span>{{ t('statusMonitor.loading') }}</span>
    </div>

    <!-- Status Grid -->
    <div v-else class="status-grid grid gap-3">
      <!-- CPU Model -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.cpuModelLabel') }}</label>
        <span class="cpu-model-value truncate text-left" :title="displayCpuModel">{{ displayCpuModel }}</span>
      </div>

      <!-- OS Name -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.osLabel') }}</label>
        <span class="os-name-value truncate text-left" :title="displayOsName">{{ displayOsName }}</span>
      </div>

      <!-- CPU Usage -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.cpuLabel') }}</label>
        <div class="value-wrapper flex items-center gap-2">
          <div class="progress-bar-container bg-header rounded h-3 overflow-hidden flex-grow"> <!-- Reduced height -->
            <div class="progress-bar bg-blue-500 h-full transition-width duration-300 ease-in-out" :style="{ width: `${serverStatus.cpuPercent ?? 0}%` }"></div>
          </div>
          <span class="font-mono text-left text-xs w-12 text-right">{{ serverStatus.cpuPercent?.toFixed(1) ?? t('statusMonitor.notAvailable') }}%</span> <!-- Fixed width and right align -->
        </div>
      </div>

      <!-- Memory Usage -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.memoryLabel') }}</label>
        <div class="value-wrapper flex items-center gap-2">
          <div class="progress-bar-container bg-header rounded h-3 overflow-hidden flex-grow">
            <div class="progress-bar bg-green-500 h-full transition-width duration-300 ease-in-out" :style="{ width: `${serverStatus.memPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details font-mono text-xs whitespace-nowrap text-left">{{ memDisplay }}</span>
        </div>
      </div>

       <!-- Swap Usage -->
       <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.swapLabel') }}</label>
        <div class="value-wrapper flex items-center gap-2">
          <div class="progress-bar-container bg-header rounded h-3 overflow-hidden flex-grow">
            <!-- Conditional color for swap -->
            <div class="progress-bar h-full transition-width duration-300 ease-in-out"
                 :class="serverStatus.swapPercent && serverStatus.swapPercent > 0 ? 'bg-yellow-500' : 'bg-gray-500'"
                 :style="{ width: `${serverStatus.swapPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details font-mono text-xs whitespace-nowrap text-left">{{ swapDisplay }}</span>
        </div>
      </div>

      <!-- Disk Usage -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3">
        <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.diskLabel') }}</label>
        <div class="value-wrapper flex items-center gap-2">
          <div class="progress-bar-container bg-header rounded h-3 overflow-hidden flex-grow">
            <div class="progress-bar bg-purple-500 h-full transition-width duration-300 ease-in-out" :style="{ width: `${serverStatus.diskPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details font-mono text-xs whitespace-nowrap text-left">{{ diskDisplay }}</span>
        </div>
      </div>

      <!-- Network Rate -->
      <div class="status-item grid grid-cols-[auto_1fr] items-center gap-3 mt-2">
          <label class="font-semibold text-text-secondary text-left whitespace-nowrap">{{ t('statusMonitor.networkLabel') }} ({{ serverStatus.netInterface || '...' }}):</label>
          <div class="network-values flex items-center justify-start gap-4"> <!-- Reduced gap -->
            <span class="rate down inline-flex items-center gap-1 text-green-500 text-xs whitespace-nowrap">
              <i class="fas fa-arrow-down w-3 text-center"></i> <!-- Font Awesome icon -->
              <span class="font-mono">{{ formatBytesPerSecond(serverStatus.netRxRate) }}</span>
            </span>
            <span class="rate up inline-flex items-center gap-1 text-orange-500 text-xs whitespace-nowrap">
               <i class="fas fa-arrow-up w-3 text-center"></i> <!-- Font Awesome icon -->
               <span class="font-mono">{{ formatBytesPerSecond(serverStatus.netTxRate) }}</span>
            </span>
          </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Interface remains the same
interface ServerStatus {
  cpuPercent?: number;
  memPercent?: number;
  memUsed?: number; // MB
  memTotal?: number; // MB
  swapPercent?: number;
  swapUsed?: number; // MB
  swapTotal?: number; // MB
  diskPercent?: number;
  diskUsed?: number; // KB
  diskTotal?: number; // KB
  cpuModel?: string;
  netRxRate?: number; // Bytes per second
  netTxRate?: number; // Bytes per second
  netInterface?: string;
  osName?: string;
}

const props = defineProps<{
  sessionId: string;
  serverStatus: ServerStatus | null;
  statusError?: string | null;
}>();

// --- Caching logic remains the same ---
const cachedCpuModel = ref<string | null>(null);
const cachedOsName = ref<string | null>(null);

watch(() => props.serverStatus, (newData) => {
  if (newData) {
    if (newData.cpuModel !== undefined && newData.cpuModel !== null && newData.cpuModel !== '') {
      cachedCpuModel.value = newData.cpuModel;
    }
    if (newData.osName !== undefined && newData.osName !== null && newData.osName !== '') {
      cachedOsName.value = newData.osName;
    }
  }
}, { immediate: true });

// --- Computed properties remain the same ---
const displayCpuModel = computed(() => {
  return (props.serverStatus?.cpuModel ?? cachedCpuModel.value) || t('statusMonitor.notAvailable');
});

const displayOsName = computed(() => {
  return (props.serverStatus?.osName ?? cachedOsName.value) || t('statusMonitor.notAvailable');
});

const formatBytesPerSecond = (bytes?: number): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return t('statusMonitor.notAvailable');
    if (bytes < 1024) return `${bytes} ${t('statusMonitor.bytesPerSecond')}`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t('statusMonitor.kiloBytesPerSecond')}`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('statusMonitor.megaBytesPerSecond')}`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ${t('statusMonitor.gigaBytesPerSecond')}`;
};

const formatKbToGb = (kb?: number): string => {
    if (kb === undefined || kb === null) return t('statusMonitor.notAvailable');
    if (kb === 0) return `0.0 ${t('statusMonitor.gigaBytes')}`;
    const gb = kb / 1024 / 1024;
    return `${gb.toFixed(1)} ${t('statusMonitor.gigaBytes')}`;
};

const memDisplay = computed(() => {
    const data = props.serverStatus;
    if (!data || data.memUsed === undefined || data.memTotal === undefined) return t('statusMonitor.notAvailable');
    const percent = data.memPercent !== undefined ? `(${(data.memPercent).toFixed(1)}%)` : ''; // Keep 1 decimal for percent
    const usedMb = Number.isInteger(data.memUsed) ? data.memUsed : data.memUsed.toFixed(1);
    const totalMb = Number.isInteger(data.memTotal) ? data.memTotal : data.memTotal.toFixed(1);
    return `${usedMb} / ${totalMb} ${t('statusMonitor.megaBytes')} ${percent}`; // Removed extra space before MB
});

const diskDisplay = computed(() => {
    const data = props.serverStatus;
    if (!data || data.diskUsed === undefined || data.diskTotal === undefined) return t('statusMonitor.notAvailable');
    const percent = data.diskPercent !== undefined ? `(${(data.diskPercent).toFixed(1)}%)` : ''; // Keep 1 decimal for percent
    return `${formatKbToGb(data.diskUsed)} / ${formatKbToGb(data.diskTotal)} ${percent}`;
});

const swapDisplay = computed(() => {
    const data = props.serverStatus;
    const used = data?.swapUsed ?? 0;
    const total = data?.swapTotal ?? 0;
    const percentVal = data?.swapPercent ?? 0;

    // Only show details if swap total > 0
    if (total === 0) {
        return t('statusMonitor.swapNotAvailable'); // Or a more specific message
    }

    const percent = `(${(percentVal).toFixed(1)}%)`; // Keep 1 decimal for percent
    const usedMb = Number.isInteger(used) ? used : used.toFixed(1);
    const totalMb = Number.isInteger(total) ? total : total.toFixed(1);
    return `${usedMb} / ${totalMb} ${t('statusMonitor.megaBytes')} ${percent}`; // Removed extra space before MB
});

</script>

<!-- No <style scoped> needed anymore -->
