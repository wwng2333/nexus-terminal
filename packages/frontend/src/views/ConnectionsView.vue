<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConnectionList from '../components/ConnectionList.vue';
import AddConnectionForm from '../components/AddConnectionForm.vue';
import { ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo

const { t } = useI18n();
const showForm = ref(false); // 重命名，控制表单显示状态
const editingConnection = ref<ConnectionInfo | null>(null); // 存储正在编辑的连接

const handleConnectionAdded = () => {
  showForm.value = false; // 使用新变量名
  // ConnectionList 组件会自动从 store 获取更新后的列表
};

// 新增：处理编辑成功后的逻辑
const handleConnectionUpdated = () => {
    editingConnection.value = null; // 清除正在编辑的连接
    showForm.value = false; // 编辑成功后隐藏表单
};

// 新增：处理来自 ConnectionList 的编辑请求
const handleEditRequest = (connection: ConnectionInfo) => {
    editingConnection.value = connection; // 设置要编辑的连接
    showForm.value = true; // 显示表单
};

// 新增：显式打开添加表单的方法
const openAddForm = () => {
    editingConnection.value = null; // 确保不在编辑模式
    showForm.value = true;
};

// 新增：统一的关闭表单方法
const closeForm = () => {
    editingConnection.value = null; // 清除编辑状态
    showForm.value = false;
};
</script>

<template>
  <div class="connections-view">
    <h2>{{ t('connections.title') }}</h2>

    <button @click="openAddForm" v-if="!showForm">{{ t('connections.addConnection') }}</button>

    <!-- 添加/编辑连接表单 (条件渲染) -->
    <AddConnectionForm
      v-if="showForm"
      :connection-to-edit="editingConnection"
      @close="closeForm"
      @connection-added="handleConnectionAdded"
      @connection-updated="handleConnectionUpdated"
    />

    <!-- 连接列表，监听 edit-connection 事件 -->
    <ConnectionList @edit-connection="handleEditRequest" />
  </div>
</template>

<style scoped>
.connections-view {
  padding: 1rem;
}

button {
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
</style>
