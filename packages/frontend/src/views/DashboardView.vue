<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useConnectionsStore } from '../stores/connections.store';
import { useAuditLogStore } from '../stores/audit.store';
import { useSessionStore } from '../stores/session.store';
// Removed settings store import for sorting
import type { SortField, SortOrder } from '../stores/settings.store'; // Keep type import
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { ConnectionInfo } from '../stores/connections.store';
import { storeToRefs } from 'pinia'; // Keep for other stores if needed
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS, ja } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const { t, locale } = useI18n();
const router = useRouter();
const connectionsStore = useConnectionsStore();
const auditLogStore = useAuditLogStore();
const sessionStore = useSessionStore();
// Removed settings store instantiation

const { connections, isLoading: isLoadingConnections } = storeToRefs(connectionsStore);
const { logs: auditLogs, isLoading: isLoadingLogs, totalLogs } = storeToRefs(auditLogStore);
// Removed refs from settings store

// Local state for sorting
const localSortBy = ref<SortField>('last_connected_at');
const localSortOrder = ref<SortOrder>('desc');

const maxRecentLogs = 5;

const sortOptions: { value: SortField; labelKey: string }[] = [
  { value: 'last_connected_at', labelKey: 'dashboard.sortOptions.lastConnected' },
  { value: 'name', labelKey: 'dashboard.sortOptions.name' },
  { value: 'type', labelKey: 'dashboard.sortOptions.type' },
  { value: 'updated_at', labelKey: 'dashboard.sortOptions.updated' },
  { value: 'created_at', labelKey: 'dashboard.sortOptions.created' },
];

const sortedConnections = computed(() => {
  const sortBy = localSortBy.value; // Use local state
  const sortOrderVal = localSortOrder.value; // Use local state
  const factor = sortOrderVal === 'desc' ? -1 : 1;

  return [...connections.value].sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (sortBy) {
      case 'name':
        valA = a.name || '';
        valB = b.name || '';
        return valA.localeCompare(valB) * factor;
      case 'type':
        valA = a.type || '';
        valB = b.type || '';
        return valA.localeCompare(valB) * factor;
      case 'created_at':
        valA = a.created_at ?? 0;
        valB = b.created_at ?? 0;
        return (valA - valB) * factor;
      case 'updated_at':
        valA = a.updated_at ?? 0;
        valB = b.updated_at ?? 0;
        return (valA - valB) * factor;
      case 'last_connected_at':
        // Handle null/undefined last_connected_at based on sort order for consistent sorting
        valA = a.last_connected_at ?? (sortOrderVal === 'desc' ? -Infinity : Infinity);
        valB = b.last_connected_at ?? (sortOrderVal === 'desc' ? -Infinity : Infinity);
        // Ensure consistent comparison for potentially infinite values
        if (valA === valB) return 0;
        if (valA < valB) return -1 * factor;
        return 1 * factor;
      default:
        return 0;
    }
  });
});

const recentAuditLogs = computed(() => {
  return auditLogs.value.slice(0, maxRecentLogs);
});

onMounted(async () => {
  if (connections.value.length === 0) {
    try {
      await connectionsStore.fetchConnections();
    } catch (error) {
      console.error("加载连接列表失败:", error);
    }
  }
  try {
    await auditLogStore.fetchLogs({
        page: 1,
        limit: maxRecentLogs,
        sortOrder: 'desc',
        isDashboardRequest: true
    });
  } catch (error) {
    console.error("加载审计日志失败:", error);
  }
});

const connectTo = (connection: ConnectionInfo) => {
  sessionStore.handleConnectRequest(connection);
};

const toggleSortOrder = () => {
  // Only update the local sort order state
  localSortOrder.value = localSortOrder.value === 'asc' ? 'desc' : 'asc';
};

const isAscending = computed(() => localSortOrder.value === 'asc'); // Use local state

// Removed watch for saving preferences

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

      <!-- Connection List -->
      <div class="bg-card text-card-foreground shadow rounded-lg overflow-hidden border border-border">
        <div class="px-4 py-3 border-b border-border flex justify-between items-center">
          <h2 class="text-lg font-medium">{{ t('dashboard.connectionList', '连接列表') }}</h2>
          <div class="flex items-center space-x-2">
             <select
                v-model="localSortBy"
                class="h-8 px-2 py-1 text-sm border border-border rounded bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-no-repeat bg-right pr-8"
                style="background-image: url('data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%236c757d\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M2 5l6 6 6-6\'/%3e%3c/svg%3e'); background-position: right 0.5rem center; background-size: 16px 12px;"
                aria-label="Sort connections by"
              >
                <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                  {{ t(option.labelKey, option.value.replace('_', ' ')) }}
                </option>
              </select>
              <button
                @click="toggleSortOrder"
                class="h-8 px-1.5 py-1 border border-border rounded hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary flex items-center justify-center"
                :aria-label="isAscending ? t('common.sortAscending') : t('common.sortDescending')"
                :title="isAscending ? t('common.sortAscending') : t('common.sortDescending')"
              >
                <i :class="['fas', isAscending ? 'fa-arrow-up-a-z' : 'fa-arrow-down-z-a', 'w-4 h-4']"></i>
              </button>
          </div>
        </div>
        <div class="p-4">
          <div v-if="isLoadingConnections && sortedConnections.length === 0" class="text-center text-text-secondary">{{ t('common.loading') }}</div>
          <ul v-else-if="sortedConnections.length > 0" class="space-y-3">
            <li v-for="conn in sortedConnections" :key="conn.id" class="flex items-center justify-between p-3 bg-header/50 border border-border/50 rounded transition duration-150 ease-in-out">
              <div class="flex-grow mr-4 overflow-hidden">
                <span class="font-medium block truncate flex items-center" :title="conn.name || ''">
                  <i :class="['fas', conn.type === 'RDP' ? 'fa-desktop' : 'fa-server', 'mr-2 w-4 text-center text-text-secondary']"></i>
                  <span>{{ conn.name || t('connections.unnamed') }}</span>
                </span>
                <span class="text-sm text-text-secondary block truncate" :title="`${conn.username}@${conn.host}:${conn.port}`">
                  {{ conn.username }}@{{ conn.host }}:{{ conn.port }}
                </span>
                <span class="text-xs text-text-alt block">
                  {{ t('dashboard.lastConnected', '上次连接:') }} {{ formatRelativeTime(conn.last_connected_at) }}
                </span>
              </div>
              <button @click="connectTo(conn)" class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition duration-150 ease-in-out text-sm font-medium flex-shrink-0"> <!-- Applied standard button style -->
                {{ t('connections.actions.connect') }}
              </button>
            </li>
          </ul>
          <div v-else class="text-center text-text-secondary">{{ t('dashboard.noConnections', '没有连接记录') }}</div>
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
