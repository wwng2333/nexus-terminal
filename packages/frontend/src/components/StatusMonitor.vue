<template>
  <div class="status-monitor">
    <h4>服务器状态</h4>
    <div v-if="!statusData" class="loading-status">
      等待数据...
    </div>
    <div v-else class="status-grid">
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
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${statusData.cpuPercent ?? 0}%` }"></div>
        </div>
        <span>{{ statusData.cpuPercent?.toFixed(1) ?? 'N/A' }}%</span>
      </div>
      <div class="status-item">
        <label>内存:</label>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${statusData.memPercent ?? 0}%` }"></div>
        </div>
        <span class="mem-disk-details">{{ memDisplay }}</span>
      </div>
       <!-- Removed v-if, Swap will always show -->
       <div class="status-item">
        <label>Swap:</label>
        <div class="progress-bar-container">
          <div class="progress-bar swap-bar" :style="{ width: `${statusData.swapPercent ?? 0}%` }"></div>
        </div>
        <span class="mem-disk-details">{{ swapDisplay }}</span>
      </div>
      <div class="status-item">
        <label>磁盘 (/):</label>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${statusData.diskPercent ?? 0}%` }"></div>
        </div>
        <span class="mem-disk-details">{{ diskDisplay }}</span>
      </div>
      <div class="status-item network-rate">
          <label>网络 ({{ statusData.netInterface || '...' }}):</label>
          <span class="rate down">⬇ {{ formatBytesPerSecond(statusData.netRxRate) }}</span>
          <span class="rate up">⬆ {{ formatBytesPerSecond(statusData.netTxRate) }}</span>
      </div>
    </div>
     <div v-if="error" class="status-error">
        错误: {{ error }}
     </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'; // 引入 watch

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

// Props 用于接收父组件传递的状态数据和错误信息
const props = defineProps<{
  statusData: ServerStatus | null;
  error?: string | null;
}>();

// --- 缓存状态 ---
const cachedCpuModel = ref<string | null>(null);
const cachedOsName = ref<string | null>(null);

// 监听传入的 statusData 变化以更新缓存
watch(() => props.statusData, (newData) => {
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

// --- 显示计算属性 (包含缓存逻辑) ---
const displayCpuModel = computed(() => {
  // 优先使用当前有效数据，否则回退到缓存，最后是 'N/A'
  return (props.statusData?.cpuModel ?? cachedCpuModel.value) || 'N/A';
});

const displayOsName = computed(() => {
  // 优先使用当前有效数据，否则回退到缓存，最后是 'N/A'
  return (props.statusData?.osName ?? cachedOsName.value) || 'N/A';
});


// 辅助函数：格式化字节/秒为合适的单位 (B, KB, MB, GB)
const formatBytesPerSecond = (bytes?: number): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
    if (bytes < 1024) return `${bytes} B/s`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
};


// 辅助函数：格式化 KB 为 GB
const formatKbToGb = (kb?: number): string => {
    if (kb === undefined || kb === null) return 'N/A'; // 处理无效输入
    if (kb === 0) return '0.0 GB'; // 处理 0 的情况
    const gb = kb / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
};

// 计算属性用于显示内存信息
const memDisplay = computed(() => {
    const data = props.statusData;
    if (!data || data.memUsed === undefined || data.memTotal === undefined) return 'N/A'; // 检查数据有效性
    const percent = data.memPercent !== undefined ? `(${data.memPercent.toFixed(1)}%)` : '';
    // 确保 MB 值在是整数时不显示小数
    const usedMb = Number.isInteger(data.memUsed) ? data.memUsed : data.memUsed.toFixed(1);
    const totalMb = Number.isInteger(data.memTotal) ? data.memTotal : data.memTotal.toFixed(1);
    return `${usedMb} MB / ${totalMb} MB ${percent}`;
});

// 计算属性用于显示磁盘信息
const diskDisplay = computed(() => {
    const data = props.statusData;
    if (!data || data.diskUsed === undefined || data.diskTotal === undefined) return 'N/A'; // 检查数据有效性
    // 百分比代表已用空间
    const percent = data.diskPercent !== undefined ? `(${data.diskPercent.toFixed(1)}%)` : '';
    // 显示 已用 / 总量
    return `${formatKbToGb(data.diskUsed)} / ${formatKbToGb(data.diskTotal)} ${percent}`;
});

// 计算属性用于显示 Swap 信息
const swapDisplay = computed(() => {
    const data = props.statusData;
    // 处理 swap 可能为 undefined 或 0 的情况
    const used = data?.swapUsed ?? 0;
    const total = data?.swapTotal ?? 0;
    const percentVal = data?.swapPercent ?? 0;

    const percent = `(${percentVal.toFixed(1)}%)`;
    const usedMb = Number.isInteger(used) ? used : used.toFixed(1);
    const totalMb = Number.isInteger(total) ? total : total.toFixed(1);
    return `${usedMb} MB / ${totalMb} MB ${percent}`;
});


</script>

<style scoped>
.status-monitor {
  padding: 1rem;
  border-left: 1px solid #ccc;
  background-color: #f9f9f9;
  height: 100%;
  overflow-y: auto;
  font-size: 0.9em;
}

.status-monitor h4 {
  margin-top: 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
  font-size: 1em;
  color: #333;
}

.loading-status, .status-error {
    color: #888;
    text-align: center;
    margin-top: 1rem;
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
  /* Adjusted grid columns for better alignment */
  grid-template-columns: 65px 1fr auto; /* Label slightly wider */
  align-items: center;
  gap: 0.5rem;
}

/* Specific style for CPU model row */
.status-item.cpu-model {
  grid-template-columns: 65px 1fr; /* Label, Value */
  gap: 0.5rem;
  margin-bottom: 0.5rem; /* Add some space below CPU model */
}
.cpu-model-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    grid-column: 2 / 4; /* Span across the value and percentage columns */
    text-align: left;
    color: #333;
}

/* Specific style for OS name row */
.status-item.os-name {
  grid-template-columns: 65px 1fr; /* Label, Value */
  /* Ensure the item itself doesn't align right if the parent has text-align */
   text-align: left;
}
/* Increased specificity to override generic span rule */
.status-item.os-name .os-name-value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left; /* Explicitly left align text */
    justify-self: start; /* Align grid item to start */
    color: #333;
    min-width: auto; /* Override generic min-width */
}


.status-item label {
  font-weight: bold;
  color: #555;
  text-align: right;
  white-space: nowrap;
}

.progress-bar-container {
  background-color: #e9ecef;
  border-radius: 0.25rem;
  height: 1rem; /* Adjust height */
  overflow: hidden;
  flex-grow: 1;
}

.progress-bar {
  background-color: #007bff; /* Blue for CPU/Mem/Disk */
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
  text-align: right;
  color: #333;
}

.mem-disk-details {
    font-size: 0.9em; /* Slightly smaller font for details */
    white-space: nowrap;
    text-align: right;
}

/* Network Rate Styles */
.status-item.network-rate {
    grid-template-columns: 65px auto auto; /* Label, Down Rate, Up Rate */
    margin-top: 0.5rem; /* Add space above network */
}
.network-rate .rate {
    font-size: 0.9em;
    white-space: nowrap;
    text-align: right;
    min-width: 80px; /* Adjust as needed */
}
.network-rate .rate.down {
    color: #28a745; /* Green for download */
}
.network-rate .rate.up {
    color: #fd7e14; /* Orange for upload */
}

</style>
