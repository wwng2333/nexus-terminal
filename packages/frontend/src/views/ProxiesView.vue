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
  padding: 1rem;
}

button {
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
}

.placeholder-form, .placeholder-list {
    border: 1px dashed #ccc;
    padding: 1rem;
    margin-top: 1rem;
    background-color: #f9f9f9;
}
</style>
