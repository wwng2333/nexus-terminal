<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConnectionsStore } from '../stores/connections.store';
import { useAuditLogStore } from '../stores/audit.store';
import { useSessionStore } from '../stores/session.store'; 
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { ConnectionInfo } from '../stores/connections.store'; 
import { storeToRefs } from 'pinia';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS, ja } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const { t, locale } = useI18n();
const router = useRouter();
const connectionsStore = useConnectionsStore();
const auditLogStore = useAuditLogStore();
const sessionStore = useSessionStore(); 

const { connections, isLoading: isLoadingConnections } = storeToRefs(connectionsStore);
const { logs: auditLogs, isLoading: isLoadingLogs, totalLogs } = storeToRefs(auditLogStore);

const maxRecentConnections = 5;
const maxRecentLogs = 5;

const recentConnections = computed(() => {


const connected = connections.value.filter(c => c.last_connected_at);

  if (connected.length > 0) {
    connected.sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0));
    const result = connected.slice(0, maxRecentConnections);
    return result;
  } else {
    const sortedByUpdate = [...connections.value].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
    const result = sortedByUpdate.slice(0, maxRecentConnections);
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
      await connectionsStore.fetchConnections();
    } catch (error) {
      console.error("加载连接列表失败:", error);
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
  // 将连接处理逻辑委托给 sessionStore
  sessionStore.handleConnectRequest(connection);
};


// --- 动态语言包映射 ---
const dateFnsLocales: Record<string, Locale> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': ja,
  // 主语言回退
  'en': enUS,
  'zh': zhCN,
  'ja': ja,
};

// 修正函数签名，接受 number | null | undefined
const formatRelativeTime = (timestampInSeconds: number | null | undefined): string => {
  if (!timestampInSeconds) return t('connections.status.never');
  try {
    // 将秒级时间戳转换为毫秒级
    const timestampInMs = timestampInSeconds * 1000;
    // 检查转换后的值是否有效
    if (isNaN(timestampInMs)) {
        console.warn(`[Dashboard] Invalid timestamp received: ${timestampInSeconds}`);
        return String(timestampInSeconds); // 返回原始值或错误提示
    }
    const date = new Date(timestampInMs);

    const currentI18nLocale = locale.value; // 获取 vue-i18n 当前 locale (e.g., 'zh-CN')
    const langPart = currentI18nLocale.split('-')[0]; // 获取主语言部分 (e.g., 'zh')

    // 1. 尝试精确匹配 (e.g., 'zh-CN' -> zhCN)
    let targetDateFnsLocale = dateFnsLocales[currentI18nLocale];

    // 2. 如果无精确匹配，尝试匹配主语言 (e.g., 'zh' -> zhCN)
    if (!targetDateFnsLocale) {
      targetDateFnsLocale = dateFnsLocales[langPart];
    }

    // 3. 如果仍然找不到，回退到默认 enUS
    if (!targetDateFnsLocale) {
      console.warn(`[Dashboard] date-fns locale not found for ${currentI18nLocale} or ${langPart}. Falling back to en-US.`);
      targetDateFnsLocale = enUS; // 默认回退到 enUS
    }

    return formatDistanceToNow(date, { addSuffix: true, locale: targetDateFnsLocale });
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
                <span class="font-medium block truncate flex items-center" :title="conn.name || ''">
                  <i :class="['fas', conn.type === 'RDP' ? 'fa-desktop' : 'fa-server', 'mr-2 w-4 text-center text-text-secondary']"></i>
                  <span>{{ conn.name || 'Unnamed' }}</span>
                </span>
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
