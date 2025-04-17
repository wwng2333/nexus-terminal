<script setup lang="ts">
import { onMounted, computed, ref, reactive } from 'vue'; // 统一导入
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 类型
import { useTagsStore } from '../stores/tags.store'; // 引入 Tags Store

const { t } = useI18n(); // 获取 t 函数
const router = useRouter(); // 获取 router 实例
const tagsStore = useTagsStore(); // 获取 Tags Store 实例
// 使用 storeToRefs 来保持 state 属性的响应性
// 不再直接从 connectionsStore 获取 connections, isLoading, error
// const { connections, isLoading, error } = storeToRefs(connectionsStore);
const { tags: allTags, isLoading: isTagsLoading, error: tagsError } = storeToRefs(tagsStore); // 获取所有标签及其状态

// 定义 Props，接收筛选后的连接列表
const props = defineProps<{
  connections: ConnectionInfo[];
}>();

// 定义组件发出的事件 (添加 edit-connection)
const emit = defineEmits(['edit-connection']);

// 新增：用于跟踪每个连接测试状态的响应式对象
const testingState = reactive<Record<number, boolean>>({});

// 组件挂载时获取标签列表 (连接列表由父组件传入)
onMounted(() => {
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

 // 新增：计算按标签分组的连接
 const groupedConnections = computed(() => {
     const groups: { [key: string]: ConnectionInfo[] } = {};
     const untaggedKey = '_untagged_'; // 特殊键，用于未标记的连接

     // 初始化所有标签组（包括未标记）
     groups[untaggedKey] = [];
     allTags.value.forEach(tag => {
         groups[tag.name] = []; // 使用标签名称作为键
     });

     // 将连接分配到对应的组
     props.connections.forEach(conn => {
         if (!conn.tag_ids || conn.tag_ids.length === 0) {
             groups[untaggedKey].push(conn);
         } else {
             conn.tag_ids.forEach(tagId => {
                 const tagName = tagMap.value.get(tagId);
                 if (tagName && groups[tagName]) { // 确保标签存在于映射和分组中
                     groups[tagName].push(conn);
                 } else if (tagName) {
                     // 如果标签存在但分组未初始化（理论上不应发生），则创建分组
                     groups[tagName] = [conn];
                 } else {
                     // 如果 tagId 无效或未找到对应标签名，归入未标记组
                     groups[untaggedKey].push(conn);
                 }
             });
         }
     });

     // 过滤掉没有连接的标签组（除了未标记组，即使为空也可能需要显示）
     const filteredGroups: { [key: string]: ConnectionInfo[] } = {};
     for (const groupName in groups) {
         if (groups[groupName].length > 0 || groupName === untaggedKey) {
              // 按连接名称排序每个分组内部的连接
              groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
              filteredGroups[groupName] = groups[groupName];
         }
     }

      // 对分组本身进行排序（未标记的放最后）
      const sortedGroupNames = Object.keys(filteredGroups).sort((a, b) => {
          if (a === untaggedKey) return 1; // 未标记的排在后面
          if (b === untaggedKey) return -1;
          return a.localeCompare(b); // 其他按名称排序
      });

      const sortedGroups: { [key: string]: ConnectionInfo[] } = {};
      sortedGroupNames.forEach(name => {
          sortedGroups[name] = filteredGroups[name];
      });


     return sortedGroups;
 });


 // 辅助函数：格式化时间戳
const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return t('connections.status.never'); // 使用 i18n
  // TODO: 可以考虑使用更专业的日期格式化库 (如 date-fns 或 dayjs) 并结合 i18n locale
  return new Date(timestamp * 1000).toLocaleString(); // 乘以 1000 转换为毫秒
};

// 新增：处理删除连接的方法
const handleDelete = async (conn: ConnectionInfo) => {
    // 在函数内部获取 store 实例
    const connectionsStore = useConnectionsStore();
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

 // 新增：处理测试连接的方法
 const handleTestConnection = async (connectionId: number) => {
     const connectionsStore = useConnectionsStore(); // 获取 store 实例
     testingState[connectionId] = true; // 设置为正在测试状态
     const result = await connectionsStore.testConnection(connectionId); // 调用 store action
     testingState[connectionId] = false; // 清除测试状态

     // 显示测试结果
     if (result.success) {
         alert(t('connections.test.success'));
     } else {
         alert(t('connections.test.failed', { error: result.message || '未知错误' }));
     }
 };

 </script>

<template>
  <div class="connection-list">
    <!-- 移除顶部的加载/错误/无数据状态，这些由父组件处理 -->
    <!-- <div v-if="isLoading" class="loading">{{ t('connections.loading') }}</div> -->
    <!-- <div v-else-if="error" class="error">{{ t('connections.error', { error: error }) }}</div> -->
    <!-- <div v-else-if="connections.length === 0" class="no-connections"> -->
    <!--   {{ t('connections.noConnections') }} -->
    <!-- </div> -->
    <div v-if="tagsError" class="error">{{ t('tags.error', { error: tagsError }) }}</div> <!-- 显示标签加载错误 -->

    <!-- 遍历分组 -->
    <div v-for="(groupConnections, groupName) in groupedConnections" :key="groupName" class="connection-group">
        <h4 class="group-title">
            {{ groupName === '_untagged_' ? t('connections.untaggedGroup') : groupName }}
            ({{ groupConnections.length }})
        </h4>
        <table v-if="groupConnections.length > 0">
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
                <!-- 遍历分组内的连接 -->
                <tr v-for="conn in groupConnections" :key="conn.id">
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
            <button @click="connectToServer(conn.id)" class="action-button connect-button">{{ t('connections.actions.connect') }}</button>
            <button @click="emit('edit-connection', conn)" class="action-button edit-button">{{ t('connections.actions.edit') }}</button>
            <button @click="handleTestConnection(conn.id)" class="action-button test-button" :disabled="testingState[conn.id]">{{ testingState[conn.id] ? t('connections.actions.testing') : t('connections.actions.test') }}</button> <!-- 新增测试按钮 -->
            <button @click="handleDelete(conn)" class="action-button delete-button">{{ t('connections.actions.delete') }}</button>
          </td>
        </tr>
            </tbody>
        </table>
        <!-- 如果未标记组为空，可以显示提示 -->
        <div v-else-if="groupName === '_untagged_'" class="no-connections-in-group">
             {{ t('connections.noUntaggedConnections') }}
        </div>
    </div>
     <!-- 如果所有分组都为空（即 props.connections 为空），显示整体提示 -->
     <div v-if="Object.keys(groupedConnections).length === 0 || (Object.keys(groupedConnections).length === 1 && groupedConnections['_untagged_']?.length === 0)" class="no-connections">
         {{ t('connections.noConnections') }}
     </div>

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
  margin-top: var(--base-margin, 0.5rem); /* Use theme variable */
  font-family: var(--font-family-sans-serif, sans-serif); /* Apply base font */
}

.connection-group {
    margin-bottom: calc(var(--base-padding, 1rem) * 1.5); /* Increase spacing */
    border: 1px solid var(--border-color, #eee); /* Add border to group */
    border-radius: 6px; /* Add rounding */
    overflow: hidden; /* Ensure child elements respect border radius */
    background-color: var(--app-bg-color); /* Ensure background */
}

.group-title {
    margin: 0; /* Remove default margin */
    padding: 0.6rem var(--base-padding, 1rem); /* Adjust padding */
    font-size: 1.05em; /* Adjust font size */
    font-weight: 600; /* Slightly bolder */
    background-color: var(--header-bg-color, #f8f9fa); /* Use header background */
    color: var(--text-color, #333); /* Use text color */
    border-bottom: 1px solid var(--border-color, #eee); /* Use theme border color */
}

.loading, .error, .no-connections, .no-connections-in-group {
  padding: var(--base-padding, 1rem); /* Use theme variable */
  border: 1px solid var(--border-color, #ccc); /* Use theme variable */
  border-radius: 4px;
  margin: var(--base-margin, 0.5rem); /* Add margin */
  color: var(--text-color-secondary, #666); /* Use theme variable */
  background-color: var(--app-bg-color); /* Use theme variable */
}

.error {
  color: #dc3545; /* Keep error color distinct */
  border-color: #f5c6cb;
  background-color: #f8d7da;
}

.no-connections {
  /* Style remains largely the same, but uses theme variables */
  color: var(--text-color-secondary, #666);
}

table {
  width: 100%;
  border-collapse: collapse; /* Keep collapsed */
  margin-top: 0; /* Remove margin, handled by group */
  border: none; /* Remove table border, handled by group */
}

th, td {
  /* border: 1px solid #ddd; */ /* Remove individual cell borders */
  border-bottom: 1px solid var(--border-color, #eee); /* Use bottom border */
  padding: 0.75rem var(--base-padding, 1rem); /* Increase padding */
  text-align: left;
  vertical-align: middle; /* Align vertically */
  font-size: 0.9em; /* Adjust base font size */
}
tbody tr:last-child td {
    border-bottom: none; /* Remove border from last row */
}

th {
  background-color: var(--header-bg-color, #f8f9fa); /* Use header background */
  color: var(--text-color-secondary, #666); /* Use secondary text color */
  font-weight: 500; /* Adjust weight */
  text-transform: uppercase; /* Uppercase headers */
  font-size: 0.8em; /* Smaller header font */
  border-bottom-width: 2px; /* Thicker bottom border */
}

tbody tr:hover {
    background-color: var(--header-bg-color); /* Use header bg for hover */
    filter: brightness(0.98); /* Subtle hover effect */
}

td {
    color: var(--text-color, #333); /* Ensure text color */
}
td:last-child { /* Actions column */
    white-space: nowrap; /* Prevent buttons wrapping */
}

/* General Button Reset (if needed, or rely on global styles) */
button {
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
  font-family: var(--font-family-sans-serif, sans-serif);
  font-size: 0.85em; /* Slightly smaller button text */
  padding: 0.3rem 0.7rem; /* Adjust padding */
  margin-right: 0.4rem; /* Adjust margin */
  border: 1px solid transparent; /* Start with transparent border */
  line-height: 1.4; /* Adjust line height */
}
button:last-child {
    margin-right: 0;
}

.action-button { /* Base style for action buttons */
    /* Inherits general button styles */
    min-width: 60px; /* Adjust min-width */
    text-align: center;
}

/* Specific button colors using theme variables where possible */
.connect-button {
    background-color: #28a745; /* Keep specific green */
    color: white;
    border-color: #28a745;
}
.connect-button:hover {
    background-color: #218838;
    border-color: #1e7e34;
}

.edit-button {
    background-color: #ffc107; /* Keep specific amber */
    color: #212529; /* Darker text for better contrast */
    border-color: #ffc107;
}
.edit-button:hover {
    background-color: #e0a800;
    border-color: #d39e00;
}

.test-button {
    background-color: #17a2b8; /* Keep specific teal */
    color: white;
    border-color: #17a2b8;
}
.test-button:hover {
    background-color: #138496;
    border-color: #117a8b;
}

.delete-button {
    background-color: #dc3545; /* Keep specific red */
    color: white;
    border-color: #dc3545;
}
.delete-button:hover {
    background-color: #c82333;
    border-color: #bd2130;
}

.action-button:disabled {
    opacity: 0.65; /* Slightly adjust opacity */
    cursor: not-allowed;
    background-color: var(--text-color-secondary, #6c757d); /* Use secondary text color for disabled bg */
    border-color: var(--text-color-secondary, #6c757d);
    color: #fff;
}


/* Tag Styles */
.tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem; /* Increase gap */
}
.tag-item {
    background-color: var(--header-bg-color, #e9ecef); /* Use header bg or similar */
    color: var(--text-color-secondary, #495057); /* Use secondary text color */
    padding: 0.2rem 0.5rem; /* Adjust padding */
    border-radius: 4px; /* Match button radius */
    font-size: 0.8em; /* Adjust font size */
    white-space: nowrap;
    border: 1px solid var(--border-color, #dee2e6); /* Add subtle border */
}
.no-tags {
    color: var(--text-color-secondary, #999); /* Use theme variable */
    font-style: italic;
}
</style>
