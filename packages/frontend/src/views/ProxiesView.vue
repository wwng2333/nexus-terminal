<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProxiesStore, ProxyInfo } from '../stores/proxies.store';
import ProxyList from '../components/ProxyList.vue'; // 引入列表组件
import AddProxyForm from '../components/AddProxyForm.vue'; // 引入表单组件

const { t } = useI18n();
const proxiesStore = useProxiesStore();

const showForm = ref(false);
const editingProxy = ref<ProxyInfo | null>(null);

// 组件挂载时获取代理列表
onMounted(() => {
  proxiesStore.fetchProxies();
});

const handleProxyAdded = () => {
  showForm.value = false;
};

const handleProxyUpdated = () => {
  editingProxy.value = null;
  showForm.value = false;
};

const handleEditRequest = (proxy: ProxyInfo) => {
  editingProxy.value = proxy;
  showForm.value = true;
};

const openAddForm = () => {
  editingProxy.value = null;
  showForm.value = true;
};

const closeForm = () => {
  editingProxy.value = null;
  showForm.value = false;
};
</script>

<template>
  <div class="proxies-view">
    <h2>{{ t('proxies.title') }}</h2>

    <button @click="openAddForm" v-if="!showForm">{{ t('proxies.addProxy') }}</button>

    <!-- 添加/编辑代理表单 -->
    <AddProxyForm
      v-if="showForm"
      :proxy-to-edit="editingProxy"
      @close="closeForm"
      @proxy-added="handleProxyAdded"
      @proxy-updated="handleProxyUpdated"
    />

    <!-- 代理列表 -->
    <ProxyList @edit-proxy="handleEditRequest" />
  </div>
</template>

<style scoped>
.proxies-view {
  padding: var(--base-padding, 1rem); /* 使用变量 */
  color: var(--text-color);
  background-color: var(--app-bg-color);
}

button {
  margin-bottom: var(--base-margin, 1rem); /* 使用变量 */
  padding: 0.5rem 1rem;
  cursor: pointer;
  background-color: var(--button-bg-color, #007bff); /* 使用变量 */
  color: var(--button-text-color, #ffffff); /* 使用变量 */
  border: none; /* 移除默认边框 */
  border-radius: 4px;
}

button:hover:not(:disabled) {
  background-color: var(--button-hover-bg-color, #0056b3); /* 使用变量 */
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 保持 placeholder 样式，但使用变量 */
.placeholder-form, .placeholder-list {
    border: 1px dashed var(--border-color, #ccc); /* 使用变量 */
    padding: var(--base-padding, 1rem); /* 使用变量 */
    margin-top: var(--base-margin, 1rem); /* 使用变量 */
    background-color: var(--header-bg-color, #f9f9f9); /* 使用变量，选择一个合适的背景色 */
    color: var(--text-color-secondary); /* 使用次要文本颜色 */
}
</style>
