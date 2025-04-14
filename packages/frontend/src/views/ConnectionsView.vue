<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import ConnectionList from '../components/ConnectionList.vue'; // 引入列表组件
import AddConnectionForm from '../components/AddConnectionForm.vue'; // 引入表单组件

const { t } = useI18n(); // 获取 t 函数
const showAddForm = ref(false); // 控制添加表单的显示状态

const handleConnectionAdded = () => {
  showAddForm.value = false; // 添加成功后隐藏表单
  // ConnectionList 组件会自动从 store 获取更新后的列表
};
</script>

<template>
  <div class="connections-view">
    <h2>{{ t('connections.title') }}</h2>

    <button @click="showAddForm = true" v-if="!showAddForm">{{ t('connections.addConnection') }}</button>

    <!-- 添加连接表单 (条件渲染) -->
    <AddConnectionForm
      v-if="showAddForm"
      @close="showAddForm = false"
      @connection-added="handleConnectionAdded"
    />

    <!-- 连接列表 -->
    <ConnectionList />
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
