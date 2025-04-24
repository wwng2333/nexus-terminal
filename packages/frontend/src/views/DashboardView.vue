<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConnectionsStore } from '../stores/connections.store';
import { useAuditLogStore } from '../stores/audit.store'; // 修正 Store 名称
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { ConnectionBase } from '../../../backend/src/types/connection.types'; // 修正导入的类型
import type { AuditLogEntry } from '../../../backend/src/types/audit.types'; // 引入 AuditLogEntry 类型
import { storeToRefs } from 'pinia';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale'; // 导入语言包

const { t, locale } = useI18n();
const router = useRouter();
const connectionsStore = useConnectionsStore();
const auditLogStore = useAuditLogStore(); // 修正变量名

const { connections, isLoading: isLoadingConnections } = storeToRefs(connectionsStore);
const { logs: auditLogs, isLoading: isLoadingLogs, totalLogs } = storeToRefs(auditLogStore); // 使用修正后的变量名

const maxRecentConnections = 5;
const maxRecentLogs = 5;

// --- 最近连接 ---
const recentConnections = computed(() => {
  // 过滤掉 last_connected_at 为 null 或 undefined 的连接
  const connected = connections.value.filter(c => c.last_connected_at); // 使用 last_connected_at
  // 按 last_connected_at 降序排序
  connected.sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0)); // 使用 last_connected_at
  // 取前 N 条
  return connected.slice(0, maxRecentConnections);
});

// --- 最近活动 ---
const recentAuditLogs = computed(() => {
  // 直接取最新的 N 条 (假设 store 中已按时间倒序)
  return auditLogs.value.slice(0, maxRecentLogs);
});

// --- 加载数据 ---
onMounted(async () => {
  // 如果 connections store 还没有加载过数据，则加载
  if (connections.value.length === 0) {
    try {
      await connectionsStore.fetchConnections();
    } catch (error) {
      console.error("加载连接列表失败:", error);
      // 可以在这里显示错误通知
    }
  }
  // 加载最新的审计日志
  try {
    // 只需要加载少量日志用于摘要
    await auditLogStore.fetchLogs(1, maxRecentLogs, '', 'desc'); // 使用修正后的变量名
  } catch (error) {
    console.error("加载审计日志失败:", error);
    // 可以在这里显示错误通知
  }
});

// --- 方法 ---
const connectTo = (connection: ConnectionBase) => { // 使用 ConnectionBase 类型
  // 跳转到 Workspace 页面，并传递连接信息 (如果需要)
  // 注意：当前 Workspace 路由不接受参数，需要依赖全局状态或 store
  // 可以在 connections.store 中添加一个设置当前活动连接的方法
  // connectionsStore.setActiveConnection(connection); // 假设有这个方法
  router.push({ name: 'Workspace' }); // 直接跳转
};

const formatRelativeTime = (dateString: string | undefined | null): string => {
  if (!dateString) return t('connections.status.never');
  try {
    const date = new Date(dateString);
    const currentLocale = locale.value === 'zh' ? zhCN : enUS;
    return formatDistanceToNow(date, { addSuffix: true, locale: currentLocale });
  } catch (e) {
    console.error("格式化日期失败:", e);
    return dateString; // 出错时返回原始字符串
  }
};

const getActionTranslation = (actionType: string): string => {
  // 尝试从 i18n 获取翻译，如果找不到则返回原始 actionType
  const key = `auditLog.actions.${actionType}`;
  const translated = t(key);
  // 如果翻译结果等于 key 本身，说明没有找到翻译
  return translated === key ? actionType : translated;
};

</script>

<template>
  <div class="dashboard-view p-4 md:p-6 lg:p-8">
    <h1 class="text-2xl font-semibold mb-6">{{ t('nav.dashboard') }}</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- 最近连接 -->
      <div class="card bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div class="card-header px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium">{{ t('dashboard.recentConnections', '最近连接') }}</h2> <!-- TODO: Add translation -->
        </div>
        <div class="card-body p-4">
          <div v-if="isLoadingConnections" class="text-center text-gray-500">{{ t('common.loading') }}</div>
          <ul v-else-if="recentConnections.length > 0" class="space-y-3">
            <li v-for="conn in recentConnections" :key="conn.id" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition duration-150 ease-in-out"> <!-- 使用 conn.id -->
              <div class="flex-grow mr-4 overflow-hidden">
                <span class="font-medium block truncate" :title="conn.name || ''">{{ conn.name || 'Unnamed' }}</span> <!-- 处理 name 可能为 null 的情况 -->
                <span class="text-sm text-gray-500 dark:text-gray-400 block truncate" :title="`${conn.username}@${conn.host}:${conn.port}`">
                  {{ conn.username }}@{{ conn.host }}:{{ conn.port }}
                </span>
                <span class="text-xs text-gray-400 dark:text-gray-500 block">
                  {{ t('dashboard.lastConnected', '上次连接:') }} {{ formatRelativeTime(conn.last_connected_at) }} <!-- TODO: Add translation --> <!-- 使用 last_connected_at -->
                </span>
              </div>
              <button @click="connectTo(conn)" class="button-primary button-small flex-shrink-0">
                {{ t('connections.actions.connect') }}
              </button>
            </li>
          </ul>
          <div v-else class="text-center text-gray-500">{{ t('dashboard.noRecentConnections', '没有最近连接记录') }}</div> <!-- TODO: Add translation -->
        </div>
        <div class="card-footer px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-right">
          <RouterLink :to="{ name: 'Workspace' }" class="text-sm text-link hover:text-link-hover">
            {{ t('dashboard.viewAllConnections', '查看所有连接') }} <!-- TODO: Add translation -->
          </RouterLink>
        </div>
      </div>

      <!-- 最近活动 -->
      <div class="card bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div class="card-header px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium">{{ t('dashboard.recentActivity', '最近活动') }}</h2> <!-- TODO: Add translation -->
        </div>
        <div class="card-body p-4">
          <div v-if="isLoadingLogs" class="text-center text-gray-500">{{ t('common.loading') }}</div>
          <ul v-else-if="recentAuditLogs.length > 0" class="space-y-3">
            <li v-for="log in recentAuditLogs" :key="log._id" class="p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div class="flex justify-between items-start mb-1">
                <span class="font-medium text-sm">{{ getActionTranslation(log.actionType) }}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">{{ formatRelativeTime(log.timestamp) }}</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300 break-words">{{ log.details }}</p>
            </li>
          </ul>
          <div v-else class="text-center text-gray-500">{{ t('dashboard.noRecentActivity', '没有最近活动记录') }}</div> <!-- TODO: Add translation -->
        </div>
        <div class="card-footer px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-right">
          <RouterLink :to="{ name: 'AuditLogs' }" class="text-sm text-link hover:text-link-hover">
            {{ t('dashboard.viewFullAuditLog', '查看完整审计日志') }} <!-- TODO: Add translation -->
          </RouterLink>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* 使用 Tailwind 类，这里可以添加一些特定于此视图的微调样式 */
.card {
  /* 卡片基础样式 */
}
.card-header {
  /* 卡片头部样式 */
}
.card-body {
  /* 卡片主体样式 */
}
.card-footer {
  /* 卡片底部样式 */
}

/* 按钮小型化 */
.button-small {
    padding: 0.3rem 0.6rem !important;
    font-size: 0.85rem !important;
}

/* 主按钮样式 (假设全局或组件库已定义) */
.button-primary {
    background-color: var(--button-bg-color);
    color: var(--button-text-color);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease;
}
.button-primary:hover {
    background-color: var(--button-hover-bg-color);
}

/* 链接样式 */
.text-link {
  color: var(--link-color);
  text-decoration: none;
  transition: color 0.2s ease;
}
.text-link-hover:hover {
  color: var(--link-hover-color);
  text-decoration: underline;
}

/* 暗黑模式下的颜色变量 (假设已通过全局 CSS 或 store 应用) */
.dark .dark\:bg-gray-800 { background-color: var(--app-bg-color); } /* 示例 */
.dark .dark\:bg-gray-700 { background-color: var(--header-bg-color); } /* 示例 */
.dark .dark\:border-gray-700 { border-color: var(--border-color); } /* 示例 */
.dark .dark\:text-gray-300 { color: var(--text-color); } /* 示例 */
.dark .dark\:text-gray-400 { color: var(--text-color-secondary); } /* 示例 */
.dark .dark\:text-gray-500 { color: var(--text-color-secondary); opacity: 0.7; } /* 示例 */
.dark .dark\:hover\:bg-gray-600:hover { background-color: rgba(255, 255, 255, 0.1); } /* 示例 */

</style>