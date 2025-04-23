<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProxiesStore, ProxyInfo } from '../stores/proxies.store';

const { t } = useI18n();
const proxiesStore = useProxiesStore();
const { proxies, isLoading, error } = storeToRefs(proxiesStore);

// 定义组件发出的事件
const emit = defineEmits(['edit-proxy']);

// 处理删除代理的方法
const handleDelete = async (proxy: ProxyInfo) => {
    const confirmMessage = t('proxies.prompts.confirmDelete', { name: proxy.name });
    if (window.confirm(confirmMessage)) {
        const success = await proxiesStore.deleteProxy(proxy.id);
        if (!success) {
            alert(t('proxies.errors.deleteFailed', { error: proxiesStore.error || '未知错误' }));
        }
    }
};

// 辅助函数：格式化时间戳 (可以考虑提取到公共工具函数)
const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};
</script>

<template>
  <div class="mt-4"> <!-- Container with top margin -->
    <div v-if="isLoading" class="p-4 border border-border rounded-md mb-4 text-text-secondary bg-header/50"> <!-- Loading state with Tailwind -->
      {{ t('proxies.loading') }}
    </div>
    <div v-else-if="error" class="p-4 border border-error/30 bg-error/10 text-error rounded-md mb-4"> <!-- Use semantic error colors -->
      {{ t('proxies.error', { error: error }) }}
    </div>
    <div v-else-if="proxies.length === 0" class="p-4 border border-border rounded-md mb-4 text-text-secondary"> <!-- No proxies state with Tailwind -->
      {{ t('proxies.noProxies') }}
    </div>
    <table v-else class="w-full border-collapse mt-4 text-sm"> <!-- Table with Tailwind -->
      <thead>
        <tr class="bg-header"> <!-- Table header row -->
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.name') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.type') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.host') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.port') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.user') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.updatedAt') }}</th>
          <th class="px-4 py-2 border border-border text-left font-medium text-text-secondary">{{ t('proxies.table.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="proxy in proxies" :key="proxy.id" class="odd:bg-background even:bg-header/50 hover:bg-link-active-bg/50"> <!-- Table body rows with alternating background and hover -->
          <td class="px-4 py-2 border border-border">{{ proxy.name }}</td>
          <td class="px-4 py-2 border border-border">{{ proxy.type }}</td>
          <td class="px-4 py-2 border border-border">{{ proxy.host }}</td>
          <td class="px-4 py-2 border border-border">{{ proxy.port }}</td>
          <td class="px-4 py-2 border border-border">{{ proxy.username || '-' }}</td>
          <td class="px-4 py-2 border border-border whitespace-nowrap">{{ formatTimestamp(proxy.updated_at) }}</td>
          <td class="px-4 py-2 border border-border space-x-2 whitespace-nowrap"> <!-- Actions cell with spacing -->
            <button @click="emit('edit-proxy', proxy)" class="text-link hover:text-link-hover hover:underline text-xs font-medium"> <!-- Edit button with link style -->
              {{ t('proxies.actions.edit') }}
            </button>
            <button @click="handleDelete(proxy)" class="text-error hover:text-error/80 hover:underline text-xs font-medium"> <!-- Use semantic error color for delete -->
              {{ t('proxies.actions.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Remove all scoped styles as they are now handled by Tailwind utility classes */
</style>
