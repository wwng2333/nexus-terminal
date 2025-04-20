<template>
  <div class="status-monitor">
    <h4>服务器状态</h4>
    <!-- Corrected state display logic -->
    <div v-if="statusError" class="status-error">
      错误: {{ statusError }}
    </div>
    <div v-else-if="!serverStatus" class="loading-status">
      <i class="fas fa-spinner fa-spin"></i>
      等待数据...
    </div>
    <div v-else class="status-grid">
      <!-- Status items remain here -->
      <div class="status-item cpu-model">
        <label>CPU 型号:</label>
        <!-- 使用 displayCpuModel 计算属性 -->
        <span class="cpu-model-value" :title="displayCpuModel">{{ displayCpuModel }}</span>
      </div>
      <!-- Added OS Name Display -->
      <div class="status-item os-name">
        <label>系统:</label>
        <!-- 使用 displayOsName 计算属性 -->
        <span class="os-name-value" :title="displayOsName">{{ displayOsName }}</span>
      </div>
      <div class="status-item">
        <label>CPU:</label>
        <!-- Wrap progress bar and percentage in a div -->
        <div class="value-wrapper">
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: `${serverStatus.cpuPercent ?? 0}%` }"></div>
          </div>
          <span>{{ serverStatus.cpuPercent?.toFixed(1) ?? 'N/A' }}%</span>
        </div>
      </div>
      <div class="status-item">
        <label>内存:</label>
        <div class="value-wrapper">
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: `${serverStatus.memPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details">{{ memDisplay }}</span>
        </div>
      </div>
       <!-- Removed v-if, Swap will always show -->
       <div class="status-item">
        <label>Swap:</label>
        <div class="value-wrapper">
          <div class="progress-bar-container">
            <div class="progress-bar swap-bar" :style="{ width: `${serverStatus.swapPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details">{{ swapDisplay }}</span>
        </div>
      </div>
      <div class="status-item">
        <label>磁盘:</label> <!-- 移除 (/) -->
        <div class="value-wrapper">
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: `${serverStatus.diskPercent ?? 0}%` }"></div>
          </div>
          <span class="mem-disk-details">{{ diskDisplay }}</span>
        </div>
      </div>
      <div class="status-item network-rate">
          <label>网络 ({{ serverStatus.netInterface || '...' }}):</label>
          <!-- Wrap rates in a div for alignment -->
          <div class="value-wrapper network-values">
            <span class="rate down">{{ formatBytesPerSecond(serverStatus.netRxRate) }}</span>
            <span class="rate up">{{ formatBytesPerSecond(serverStatus.netTxRate) }}</span>
          </div>
      </div>
    </div>
    <!-- Error display moved up for correct v-if/v-else-if logic -->
  </div>
  <!-- Removed extra closing div -->
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'; // 引入 watch
import { useI18n } from 'vue-i18n'; // 引入 useI18n

// 获取 t 函数
const { t } = useI18n();

// 接口定义，与后端 ServerStatusDetails 匹配
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
  osName?: string; // 操作系统名称
}

// 更新 Props 定义
const props = defineProps<{
  sessionId: string; // 添加会话 ID
  serverStatus: ServerStatus | null; // 更改名称从 statusData 到 serverStatus
  statusError?: string | null; // 更改名称从 error 到 statusError
}>();

// --- 缓存状态 ---
const cachedCpuModel = ref<string | null>(null);
const cachedOsName = ref<string | null>(null);

// 监听传入的 serverStatus 变化以更新缓存 (更新引用)
watch(() => props.serverStatus, (newData) => {
  if (newData) {
    // 仅当新数据有效时更新缓存
    if (newData.cpuModel !== undefined && newData.cpuModel !== null && newData.cpuModel !== '') {
      cachedCpuModel.value = newData.cpuModel;
    }
    if (newData.osName !== undefined && newData.osName !== null && newData.osName !== '') {
      cachedOsName.value = newData.osName;
    }
  }
  // 如果 newData 为 null (例如断开连接)，不清除缓存
}, { immediate: true }); // 立即执行一次以初始化缓存

// --- 显示计算属性 (包含缓存逻辑) - 更新引用 ---
const displayCpuModel = computed(() => {
  // 优先使用当前有效数据，否则回退到缓存，最后是 'N/A'
  return (props.serverStatus?.cpuModel ?? cachedCpuModel.value) || t('statusMonitor.notAvailable');
});

const displayOsName = computed(() => {
  // 优先使用当前有效数据，否则回退到缓存，最后是 'N/A'
  return (props.serverStatus?.osName ?? cachedOsName.value) || t('statusMonitor.notAvailable');
});


// 辅助函数：格式化字节/秒为合适的单位 (B, KB, MB, GB)
const formatBytesPerSecond = (bytes?: number): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return t('statusMonitor.notAvailable');
    if (bytes < 1024) return `${bytes} ${t('statusMonitor.bytesPerSecond')}`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t('statusMonitor.kiloBytesPerSecond')}`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('statusMonitor.megaBytesPerSecond')}`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ${t('statusMonitor.gigaBytesPerSecond')}`;
};


// 辅助函数：格式化 KB 为 GB
const formatKbToGb = (kb?: number): string => {
    if (kb === undefined || kb === null) return t('statusMonitor.notAvailable'); // 处理无效输入
    if (kb === 0) return `0.0 ${t('statusMonitor.gigaBytes')}`; // 处理 0 的情况
    const gb = kb / 1024 / 1024;
    return `${gb.toFixed(1)} ${t('statusMonitor.gigaBytes')}`;
};

// 计算属性用于显示内存信息 (更新引用)
const memDisplay = computed(() => {
    const data = props.serverStatus;
    if (!data || data.memUsed === undefined || data.memTotal === undefined) return t('statusMonitor.notAvailable'); // 检查数据有效性
    const percent = data.memPercent !== undefined ? `(${data.memPercent.toFixed(1)}%)` : '';
    // 确保 MB 值在是整数时不显示小数
    const usedMb = Number.isInteger(data.memUsed) ? data.memUsed : data.memUsed.toFixed(1);
    const totalMb = Number.isInteger(data.memTotal) ? data.memTotal : data.memTotal.toFixed(1);
    return `${usedMb} ${t('statusMonitor.megaBytes')} / ${totalMb} ${t('statusMonitor.megaBytes')} ${percent}`;
});

// 计算属性用于显示磁盘信息 (更新引用)
const diskDisplay = computed(() => {
    const data = props.serverStatus;
    if (!data || data.diskUsed === undefined || data.diskTotal === undefined) return t('statusMonitor.notAvailable'); // 检查数据有效性
    // 百分比代表已用空间
    const percent = data.diskPercent !== undefined ? `(${data.diskPercent.toFixed(1)}%)` : '';
    // 显示 已用 / 总量
    return `${formatKbToGb(data.diskUsed)} / ${formatKbToGb(data.diskTotal)} ${percent}`;
});

// 计算属性用于显示 Swap 信息 (更新引用)
const swapDisplay = computed(() => {
    const data = props.serverStatus;
    // 处理 swap 可能为 undefined 或 0 的情况
    const used = data?.swapUsed ?? 0;
    const total = data?.swapTotal ?? 0;
    const percentVal = data?.swapPercent ?? 0;

    const percent = `(${percentVal.toFixed(1)}%)`;
    const usedMb = Number.isInteger(used) ? used : used.toFixed(1);
    const totalMb = Number.isInteger(total) ? total : total.toFixed(1);
    return `${usedMb} ${t('statusMonitor.megaBytes')} / ${totalMb} ${t('statusMonitor.megaBytes')} ${percent}`;
});


</script>

<style scoped>
.status-monitor {
  padding: var(--base-padding); /* Use theme variable */
  border-left: 1px solid var(--border-color); /* Use theme variable */
  background-color: var(--app-bg-color); /* Use theme variable */
  height: 100%;
  overflow-y: auto;
  font-size: 0.9em;
}

.status-monitor h4 {
  margin-top: 0;
  margin-bottom: var(--base-padding); /* Use theme variable */
  border-bottom: 1px solid var(--border-color); /* Use theme variable */
  padding-bottom: var(--base-margin); /* Use theme variable */
  font-size: 1em;
  color: var(--text-color); /* Use theme variable */
}

.loading-status, .status-error {
    color: var(--text-color-secondary); /* Use theme variable */
    text-align: center;
    margin-top: var(--base-padding); /* Use theme variable */
}
.status-error {
    color: #dc3545;
}

.status-grid {
  display: grid;
  gap: 0.8rem;
}

.status-item {
  display: grid;
  /* Simplified grid columns: Label | Value Area - Further increased label width */
  grid-template-columns: 75px 1fr;
  align-items: center;
  gap: 0.8rem; /* Keep increased gap */
}

/* New wrapper for value area (progress bar + text or just text) */
.value-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem; /* Space between progress bar and text */
}

/* Specific style for CPU model row - Keep consistent with general status-item */
.status-item.cpu-model {
  /* grid-template-columns is inherited */
  /* gap is inherited */
  margin-bottom: 0.5rem; /* Add some space below CPU model */
}
.cpu-model-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* No longer needs grid-column span */
    text-align: left;
    color: var(--text-color); /* Use theme variable */
}

/* Specific style for OS name row - Keep consistent with general status-item */
.status-item.os-name {
  /* grid-template-columns is inherited */
  /* Ensure the item itself doesn't align right if the parent has text-align */
   text-align: left;
}
/* Increased specificity to override generic span rule */
/* OS name value should just occupy the second column */
.status-item.os-name .os-name-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left; /* Explicitly left align text */
    /* justify-self: start; No longer needed with 2-col grid */
    color: var(--text-color); /* Use theme variable */
    min-width: auto; /* Override generic min-width */
}


.status-item label {
  font-weight: bold;
  color: var(--text-color-secondary); /* Use theme variable */
  text-align: left; /* 改为左对齐 */
  white-space: nowrap;
}

.progress-bar-container {
  background-color: var(--header-bg-color); /* Use theme variable */
  border-radius: 0.25rem;
  height: 1rem; /* Adjust height */
  overflow: hidden;
  flex-grow: 1;
}

.progress-bar {
  background-color: var(--button-bg-color); /* Use theme variable for default bar */
  height: 100%;
  transition: width 0.3s ease-in-out;
  text-align: center;
  color: white;
  font-size: 0.75em;
  line-height: 1rem; /* Match container height */
}
.progress-bar.swap-bar {
    background-color: #ffc107; /* Yellow for Swap */
}


.status-item span:not(.cpu-model-value) { /* Style for percentage spans */
  font-variant-numeric: tabular-nums; /* Keep numbers aligned */
  min-width: 45px; /* Ensure space for percentage */
  text-align: left; /* 改为左对齐 */
  color: var(--text-color); /* Use theme variable */
}

.mem-disk-details {
    font-size: 0.9em; /* Slightly smaller font for details */
    white-space: nowrap;
    text-align: left; /* 改为左对齐 */
}

/* Network Rate Styles */
/* Network Rate Styles - uses the 2-col grid */
.status-item.network-rate {
    /* grid-template-columns is inherited */
    margin-top: 0.5rem; /* Add space above network */
    align-items: center; /* Try centering label and rates vertically */
}
/* Adjust network value wrapper */
.network-values {
    justify-content: start; /* Align rates to the start */
    gap: 1rem; /* Increase gap between rates */
    /* Removed margin-left, rely on grid gap */
    /* Ensure the wrapper itself aligns correctly if needed */
    /* align-self: center; */ /* Or baseline */
}
.network-rate .rate {
    font-size: 0.9em;
    white-space: nowrap;
    text-align: left; /* 改为左对齐 */
    min-width: auto; /* Remove min-width or adjust */
    /* Rely on parent flexbox for alignment */
    display: inline-flex; /* Ensure pseudo-element is part of flex flow */
    align-items: center; /* Vertically align arrow with text */
    gap: 0.3em; /* Add space between arrow and text */
}
.network-rate .rate.down {
    color: #28a745; /* Green for download */
}
.network-rate .rate.down::before {
    content: '⬇';
    /* Removed absolute positioning */
    font-size: 1em; /* Match parent font size */
    line-height: 1; /* Adjust line-height for better vertical alignment */
}

.network-rate .rate.up {
    color: #fd7e14; /* Orange for upload */
}
.network-rate .rate.up::before {
    content: '⬆';
    /* Removed absolute positioning */
    font-size: 1em; /* Match parent font size */
    line-height: 1; /* Adjust line-height for better vertical alignment */
}

</style>
