<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router'; // 引入 useRouter
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 类型

const { t } = useI18n(); // 获取 t 函数
const router = useRouter(); // 获取 router 实例
const connectionsStore = useConnectionsStore();
// 使用 storeToRefs 来保持 state 属性的响应性
const { connections, isLoading, error } = storeToRefs(connectionsStore);

// 组件挂载时获取连接列表
onMounted(() => {
  connectionsStore.fetchConnections();
});

// 辅助函数：格式化时间戳
const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return t('connections.status.never'); // 使用 i18n
  // TODO: 可以考虑使用更专业的日期格式化库 (如 date-fns 或 dayjs) 并结合 i18n locale
  return new Date(timestamp * 1000).toLocaleString(); // 乘以 1000 转换为毫秒
};
</script>

<template>
  <div class="connection-list">
    <!-- 标题移到父组件 ConnectionsView.vue 中 -->
    <div v-if="isLoading" class="loading">{{ t('connections.loading') }}</div>
    <div v-else-if="error" class="error">{{ t('connections.error', { error: error }) }}</div>
    <div v-else-if="connections.length === 0" class="no-connections">
      {{ t('connections.noConnections') }}
    </div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t('connections.table.name') }}</th>
          <th>{{ t('connections.table.host') }}</th>
          <th>{{ t('connections.table.port') }}</th>
          <th>{{ t('connections.table.user') }}</th>
          <th>{{ t('connections.table.authMethod') }}</th>
          <th>{{ t('connections.table.lastConnected') }}</th>
          <th>{{ t('connections.table.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="conn in connections" :key="conn.id">
          <td>{{ conn.name }}</td>
          <td>{{ conn.host }}</td>
          <td>{{ conn.port }}</td>
          <td>{{ conn.username }}</td>
          <td>{{ conn.auth_method }}</td>
          <td>{{ formatTimestamp(conn.last_connected_at) }}</td>
          <td>
            <button @click="connectToServer(conn.id)">{{ t('connections.actions.connect') }}</button>
            <button @click="">{{ t('connections.actions.edit') }}</button> <!-- TODO: 实现编辑逻辑 -->
            <button @click="">{{ t('connections.actions.delete') }}</button> <!-- TODO: 实现删除逻辑 -->
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts">
// 在 <script setup> 之外定义需要在模板中调用的方法
export default {
  methods: {
    connectToServer(connectionId: number) {
      console.log(`请求连接到服务器 ID: ${connectionId}`);
      // 使用 router 实例进行导航
      this.$router.push({ name: 'Workspace', params: { connectionId: connectionId.toString() } });
    }
  }
}
</script>

<style scoped>
.connection-list {
  margin-top: 1rem;
}

.loading, .error, .no-connections {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.error {
  color: red;
  border-color: red;
}

.no-connections {
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
