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
  <div class="proxy-list">
    <div v-if="isLoading" class="loading">{{ t('proxies.loading') }}</div>
    <div v-else-if="error" class="error">{{ t('proxies.error', { error: error }) }}</div>
    <div v-else-if="proxies.length === 0" class="no-proxies">
      {{ t('proxies.noProxies') }}
    </div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t('proxies.table.name') }}</th>
          <th>{{ t('proxies.table.type') }}</th>
          <th>{{ t('proxies.table.host') }}</th>
          <th>{{ t('proxies.table.port') }}</th>
          <th>{{ t('proxies.table.user') }}</th>
          <th>{{ t('proxies.table.updatedAt') }}</th>
          <th>{{ t('proxies.table.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="proxy in proxies" :key="proxy.id">
          <td>{{ proxy.name }}</td>
          <td>{{ proxy.type }}</td>
          <td>{{ proxy.host }}</td>
          <td>{{ proxy.port }}</td>
          <td>{{ proxy.username || '-' }}</td>
          <td>{{ formatTimestamp(proxy.updated_at) }}</td>
          <td>
            <button @click="emit('edit-proxy', proxy)">{{ t('proxies.actions.edit') }}</button>
            <button @click="handleDelete(proxy)">{{ t('proxies.actions.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.proxy-list {
  margin-top: 1rem;
}

.loading, .error, .no-proxies {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.error {
  color: red;
  border-color: red;
}

.no-proxies {
  color: #666;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}

th {
  background-color: #f2f2f2;
}

button {
  margin-right: 0.5rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}
</style>
