<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConnectionsStore } from '../stores/connections.store';
import { useAuditLogStore } from '../stores/audit.store'; // 修正 Store 名称
import { useSessionStore } from '../stores/session.store'; // +++ 引入 Session Store +++
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { ConnectionInfo } from '../stores/connections.store'; // 只导入 ConnectionInfo
import type { AuditLogEntry } from '../types/audit.types'; // 引入本地 AuditLogEntry 类型
import { storeToRefs } from 'pinia';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale'; // 导入语言包

const { t, locale } = useI18n();
const router = useRouter();
const connectionsStore = useConnectionsStore();
const auditLogStore = useAuditLogStore(); // 修正变量名
const sessionStore = useSessionStore(); // +++ 获取 Session Store 实例 +++

const { connections, isLoading: isLoadingConnections } = storeToRefs(connectionsStore);
const { logs: auditLogs, isLoading: isLoadingLogs, totalLogs } = storeToRefs(auditLogStore); // 使用修正后的变量名

const maxRecentConnections = 5;
const maxRecentLogs = 5;

// --- 最近连接 ---
const recentConnections = computed(() => {
  console.log('[Dashboard] Raw connections from store:', JSON.parse(JSON.stringify(connections.value)));

  // 优先尝试按 last_connected_at 过滤和排序
  const connected = connections.value.filter(c => c.last_connected_at);
  console.log('[Dashboard] Filtered connections (with last_connected_at):', JSON.parse(JSON.stringify(connected)));

  if (connected.length > 0) {
    connected.sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0));
    const result = connected.slice(0, maxRecentConnections);
    console.log('[Dashboard] Final recent connections (using last_connected_at):', JSON.parse(JSON.stringify(result)));
    return result;
  } else {
    // 如果没有带 last_connected_at 的连接，则按 updated_at 排序显示最近更新的
    console.log('[Dashboard] No connections with last_connected_at found. Falling back to sorting by updated_at.');
    const sortedByUpdate = [...connections.value].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
    const result = sortedByUpdate.slice(0, maxRecentConnections);
    console.log('[Dashboard] Final recent connections (fallback using updated_at):', JSON.parse(JSON.stringify(result)));
    return result;
  }
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
      console.log('[Dashboard] onMounted: Fetching connections...'); // 添加日志
      await connectionsStore.fetchConnections();
      console.log('[Dashboard] onMounted: Connections fetched.'); // 添加日志
    } catch (error) {
      console.error("加载连接列表失败:", error);
      // 可以在这里显示错误通知
    }
  }
  // 加载最新的审计日志
  try {
    // 只需要加载少量日志用于摘要，并按时间倒序
    // 调用 fetchLogs 并明确指示这是仪表盘请求以启用缓存
    await auditLogStore.fetchLogs({
        page: 1,
        limit: maxRecentLogs,
        sortOrder: 'desc',
        isDashboardRequest: true // <--- 添加此标志
    });
  } catch (error) {
    console.error("加载审计日志失败:", error);
    // 可以在这里显示错误通知
  }
});
// --- 方法 ---
// 修改函数签名，接受 ConnectionInfo 类型
const connectTo = (connection: ConnectionInfo) => {
  console.log(`[Dashboard] connectTo called for ID: ${connection.id}`);
  // 调用 session store 处理连接请求
  sessionStore.handleConnectRequest(connection.id);
  // 跳转到工作区
  router.push({ name: 'Workspace' });
};


// 修正函数签名，接受 number | null | undefined
const formatRelativeTime = (timestampInSeconds: number | null | undefined): string => {
  if (!timestampInSeconds) return t('connections.status.never');
  try {
    // 将秒级时间戳转换为毫秒级
    const timestampInMs = timestampInSeconds * 1000;
    // 检查转换后的值是否有效 (虽然输入是 number，但以防万一)
    if (isNaN(timestampInMs)) {
        console.warn(`[Dashboard] Invalid timestamp received: ${timestampInSeconds}`);
        return String(timestampInSeconds); // 返回原始值或错误提示
    }
    const date = new Date(timestampInMs);
    const currentLocale = locale.value === 'zh' ? zhCN : enUS;
    return formatDistanceToNow(date, { addSuffix: true, locale: currentLocale });
  } catch (e) {
    console.error("格式化日期失败:", e);
    return String(timestampInSeconds); // 出错时返回原始字符串
  }
};

const getActionTranslation = (actionType: string): string => {
  // 尝试从 i18n 获取翻译，如果找不到则返回原始 actionType
  const key = `auditLog.actions.${actionType}`;
  const translated = t(key);
  // 如果翻译结果等于 key 本身，说明没有找到翻译
  return translated === key ? actionType : translated;
};

// 辅助函数：判断活动类型是否表示失败
const isFailedAction = (actionType: string): boolean => {
  const lowerCaseAction = actionType.toLowerCase();
  // 检查常见的失败关键词
  return lowerCaseAction.includes('fail') || lowerCaseAction.includes('error') || lowerCaseAction.includes('denied');
  // 或者，如果 action_type 本身不包含明确的失败词，但翻译后包含，可以这样判断：
  // const translatedAction = getActionTranslation(actionType);
  // return translatedAction.includes('失败') || translatedAction.toLowerCase().includes('fail');
};
</script>

<template>
  <div class="p-4 md:p-6 lg:p-8 bg-background text-foreground">
    <h1 class="text-2xl font-semibold mb-6">{{ t('nav.dashboard') }}</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Recent Connections -->
      <div class="bg-card text-card-foreground shadow rounded-lg overflow-hidden border border-border">
        <div class="px-4 py-3 border-b border-border">
          <h2 class="text-lg font-medium">{{ t('dashboard.recentConnections', '最近连接') }}</h2>
        </div>
        <div class="p-4">
          <!-- Loading State (Only show if loading AND no connections are displayed yet) -->
          <div v-if="isLoadingConnections && recentConnections.length === 0" class="text-center text-text-secondary">{{ t('common.loading') }}</div>
          <ul v-else-if="recentConnections.length > 0" class="space-y-3">
            <li v-for="conn in recentConnections" :key="conn.id" class="flex items-center justify-between p-3 bg-header/50 border border-border/50 rounded transition duration-150 ease-in-out"> <!-- Applied audit log item style -->
              <div class="flex-grow mr-4 overflow-hidden">
                <span class="font-medium block truncate" :title="conn.name || ''">{{ conn.name || 'Unnamed' }}</span>
                <span class="text-sm text-text-secondary block truncate" :title="`${conn.username}@${conn.host}:${conn.port}`">
                  {{ conn.username }}@{{ conn.host }}:{{ conn.port }}
                </span>
                <span class="text-xs text-text-alt block">
                  {{ t('dashboard.lastConnected', '上次连接:') }} {{ formatRelativeTime(conn.last_connected_at) }}
                </span>
              </div>
              <button @click="connectTo(conn)" class="px-3 py-1.5 text-sm rounded border transition-colors duration-150 bg-primary text-white border-primary hover:bg-primary-dark hover:border-primary-dark flex-shrink-0"> <!-- Increased padding and font size -->
                {{ t('connections.actions.connect') }}
              </button>
            </li>
          </ul>
          <div v-else class="text-center text-text-secondary">{{ t('dashboard.noRecentConnections', '没有最近连接记录') }}</div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-card text-card-foreground shadow rounded-lg overflow-hidden border border-border">
        <div class="px-4 py-3 border-b border-border">
          <h2 class="text-lg font-medium">{{ t('dashboard.recentActivity', '最近活动') }}</h2>
        </div>
        <div class="p-4">
          <!-- Loading State (Only show if loading AND no logs are displayed yet) -->
          <div v-if="isLoadingLogs && recentAuditLogs.length === 0" class="text-center text-text-secondary">{{ t('common.loading') }}</div>
          <ul v-else-if="recentAuditLogs.length > 0" class="space-y-3">
            <li v-for="log in recentAuditLogs" :key="log.id" class="p-3 bg-header/50 border border-border/50 rounded"> <!-- Applied audit log item style -->
              <div class="flex justify-between items-start mb-1">
                <span class="font-medium text-sm" :class="{ 'text-error': isFailedAction(log.action_type) }">{{ getActionTranslation(log.action_type) }}</span>
                <span class="text-xs text-text-alt flex-shrink-0 ml-2">{{ formatRelativeTime(log.timestamp) }}</span>
              </div>
              <p class="text-sm text-text-secondary break-words">{{ log.details }}</p>
            </li>
          </ul>
          <div v-else class="text-center text-text-secondary">{{ t('dashboard.noRecentActivity', '没有最近活动记录') }}</div>
        </div>
        <div class="px-4 py-3 border-t border-border text-right">
          <RouterLink :to="{ name: 'AuditLogs' }" class="text-sm text-link hover:text-link-hover hover:underline">
            {{ t('dashboard.viewFullAuditLog', '查看完整审计日志') }}
          </RouterLink>
        </div>
      </div>

    </div>
  </div>
</template>
