<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'; // 引入 computed 和 onMounted
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia'; // 引入 storeToRefs
import ConnectionList from '../components/ConnectionList.vue';
import AddConnectionForm from '../components/AddConnectionForm.vue';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 和 Store
import { useTagsStore } from '../stores/tags.store'; // 引入 Tags Store

const { t } = useI18n();
const connectionsStore = useConnectionsStore(); // 获取 Connections Store
const tagsStore = useTagsStore(); // 获取 Tags Store
const { connections } = storeToRefs(connectionsStore); // 获取连接列表
const { tags } = storeToRefs(tagsStore); // 获取标签列表

const showForm = ref(false);
const editingConnection = ref<ConnectionInfo | null>(null);
const selectedTagId = ref<number | null>(null); // 用于存储选中的标签 ID，null 表示所有

// 计算筛选后的连接列表
const filteredConnections = computed(() => {
    if (selectedTagId.value === null) {
        return connections.value; // 返回所有连接
    }
    return connections.value.filter(conn =>
        conn.tag_ids?.includes(selectedTagId.value!) // 筛选包含选中标签 ID 的连接
    );
});

// 组件挂载时获取连接和标签列表
onMounted(() => {
    connectionsStore.fetchConnections(); // 添加获取连接列表的调用
    tagsStore.fetchTags();
});

const handleConnectionAdded = () => {
  showForm.value = false; // 使用新变量名
    // ConnectionList 组件会自动从 store 获取更新后的列表
    // 如果添加后需要清除筛选，可以在这里设置 selectedTagId.value = null;
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

    <div class="actions-bar">
        <button @click="openAddForm" v-if="!showForm">{{ t('connections.addConnection') }}</button>
        <!-- 标签筛选下拉框 -->
        <select v-model="selectedTagId" class="tag-filter-select">
            <option :value="null">{{ t('connections.filterAllTags') }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.id">
                {{ tag.name }}
            </option>
        </select>
    </div>

    <!-- 添加/编辑连接表单 (条件渲染) -->
    <AddConnectionForm
      v-if="showForm"
      :connection-to-edit="editingConnection"
      @close="closeForm"
      @connection-added="handleConnectionAdded"
      @connection-updated="handleConnectionUpdated"
    />

    <!-- 连接列表，传入筛选后的列表 -->
    <ConnectionList :connections="filteredConnections" @edit-connection="handleEditRequest" />
  </div>
</template>

<style scoped>
.connections-view {
  padding: 1rem;
}

.actions-bar {
    display: flex;
    justify-content: space-between; /* 让按钮和下拉框分开 */
    align-items: center;
    margin-bottom: 1rem;
}

.actions-bar button {
  /* margin-bottom: 1rem; */ /* 移除按钮的下边距 */
  padding: 0.5rem 1rem;
  cursor: pointer;
}

.tag-filter-select {
    padding: 0.4rem 0.8rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-width: 150px; /* 给下拉框一个最小宽度 */
}
</style>
