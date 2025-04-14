<script setup lang="ts">
import { onMounted, computed } from 'vue'; // 引入 computed
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router'; // 引入 useRouter
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 类型
import { useTagsStore } from '../stores/tags.store'; // 引入 Tags Store

const { t } = useI18n(); // 获取 t 函数
const router = useRouter(); // 获取 router 实例
const connectionsStore = useConnectionsStore();
const tagsStore = useTagsStore(); // 获取 Tags Store 实例
// 使用 storeToRefs 来保持 state 属性的响应性
const { connections, isLoading, error } = storeToRefs(connectionsStore);
const { tags: allTags } = storeToRefs(tagsStore); // 获取所有标签

// 定义组件发出的事件 (添加 edit-connection)
const emit = defineEmits(['edit-connection']);

// 组件挂载时获取连接和标签列表
onMounted(() => {
  connectionsStore.fetchConnections();
  tagsStore.fetchTags(); // 获取标签列表
});

// 创建标签 ID 到名称的映射
const tagMap = computed(() => {
    const map = new Map<number, string>();
    allTags.value.forEach(tag => {
        map.set(tag.id, tag.name);
    });
    return map;
});

// 获取连接的标签名称数组
const getConnectionTagNames = (conn: ConnectionInfo): string[] => {
    if (!conn.tag_ids || conn.tag_ids.length === 0) {
        return [];
    }
    return conn.tag_ids
        .map(tagId => tagMap.value.get(tagId)) // 使用映射获取名称
        .filter((name): name is string => !!name); // 过滤掉未找到的标签并确保类型为 string
};

// 辅助函数：格式化时间戳
const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return t('connections.status.never'); // 使用 i18n
  // TODO: 可以考虑使用更专业的日期格式化库 (如 date-fns 或 dayjs) 并结合 i18n locale
  return new Date(timestamp * 1000).toLocaleString(); // 乘以 1000 转换为毫秒
};

// 新增：处理删除连接的方法
const handleDelete = async (conn: ConnectionInfo) => {
    // 使用 i18n 获取确认消息
    const confirmMessage = t('connections.prompts.confirmDelete', { name: conn.name });
    if (window.confirm(confirmMessage)) {
        const success = await connectionsStore.deleteConnection(conn.id);
        if (!success) {
            // 如果删除失败，显示 store 中的错误信息 (或自定义错误)
            // 可以考虑使用更友好的提示方式，例如 toast 通知库
            alert(t('connections.errors.deleteFailed', { error: connectionsStore.error || '未知错误' }));
        }
        // 成功时列表会自动更新，无需额外操作
    }
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
          <th>{{ t('connections.table.tags') }}</th> <!-- 新增标签列 -->
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
          <td> <!-- 显示标签 -->
            <span v-if="getConnectionTagNames(conn).length > 0" class="tag-list">
                <span v-for="tagName in getConnectionTagNames(conn)" :key="tagName" class="tag-item">
                    {{ tagName }}
                </span>
            </span>
            <span v-else class="no-tags">-</span>
          </td>
          <td>{{ formatTimestamp(conn.last_connected_at) }}</td>
          <td>
            <button @click="connectToServer(conn.id)">{{ t('connections.actions.connect') }}</button>
            <button @click="emit('edit-connection', conn)">{{ t('connections.actions.edit') }}</button>
            <button @click="handleDelete(conn)">{{ t('connections.actions.delete') }}</button>
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

/* 标签样式 */
.tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
}
.tag-item {
    background-color: #e0e0e0;
    color: #333;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.85em;
    white-space: nowrap;
}
.no-tags {
    color: #999;
    font-style: italic;
}
</style>
