<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
// import { useRouter } from 'vue-router'; // 不再需要 router
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store';
import { useTagsStore, TagInfo } from '../stores/tags.store';

// 定义事件
const emit = defineEmits([
  'connect-request',        // 左键单击 - 请求激活或替换当前标签
  'open-new-session',       // 中键单击 - 请求在新标签中打开
  'request-add-connection', // 右键菜单 - 添加
  'request-edit-connection' // 右键菜单 - 编辑
]);

const { t } = useI18n();
// const router = useRouter(); // 不再需要
const connectionsStore = useConnectionsStore();
const tagsStore = useTagsStore();

const { connections, isLoading: connectionsLoading, error: connectionsError } = storeToRefs(connectionsStore);
const { tags, isLoading: tagsLoading, error: tagsError } = storeToRefs(tagsStore);

// 右键菜单状态
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextTargetConnection = ref<ConnectionInfo | null>(null);

// 分组展开状态
const expandedGroups = ref<Record<string, boolean>>({}); // 使用 Record<string, boolean>

// 计算属性：按标签分组连接
const groupedConnections = computed(() => {
  const groups: Record<string, ConnectionInfo[]> = {};
  const untagged: ConnectionInfo[] = [];
  const tagMap = new Map(tags.value.map(tag => [tag.id, tag]));

  connections.value.forEach(conn => {
    if (conn.tag_ids && conn.tag_ids.length > 0) {
      conn.tag_ids.forEach(tagId => {
        const tag = tagMap.get(tagId);
        const groupName = tag ? tag.name : t('workspaceConnectionList.untagged'); // Fallback if tag not found
        if (!groups[groupName]) {
          groups[groupName] = [];
          if (expandedGroups.value[groupName] === undefined) {
             expandedGroups.value[groupName] = true; // 默认展开
          }
        }
        groups[groupName].push(conn);
      });
    } else {
      untagged.push(conn);
    }
  });

  // 对每个分组内的连接按名称或主机排序
  for (const groupName in groups) {
      groups[groupName].sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));
  }
  untagged.sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));


  // 将未标记的分组放在最后
  const sortedGroupNames = Object.keys(groups).sort();
  const result: { groupName: string; connections: ConnectionInfo[] }[] = sortedGroupNames.map(name => ({
      groupName: name,
      connections: groups[name]
  }));

  if (untagged.length > 0) {
      const untaggedGroupName = t('workspaceConnectionList.untagged');
      if (expandedGroups.value[untaggedGroupName] === undefined) {
          expandedGroups.value[untaggedGroupName] = true; // 默认展开
      }
      result.push({ groupName: untaggedGroupName, connections: untagged });
  }

  return result;
});

// 切换分组展开/折叠
const toggleGroup = (groupName: string) => {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName];
};

// 处理单击连接
const handleConnect = (connectionId: number) => {
  emit('connect-request', connectionId);
  closeContextMenu(); // 点击连接后关闭菜单
};

// 显示右键菜单
const showContextMenu = (event: MouseEvent, connection: ConnectionInfo) => {
  contextTargetConnection.value = connection;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
  // 添加全局点击监听器以关闭菜单
  document.addEventListener('click', closeContextMenu, { once: true });
};

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false;
  contextTargetConnection.value = null;
  document.removeEventListener('click', closeContextMenu);
};

// 处理右键菜单操作
const handleMenuAction = (action: 'add' | 'edit' | 'delete') => {
  const conn = contextTargetConnection.value;
  closeContextMenu(); // 先关闭菜单

  if (action === 'add') {
    // router.push('/connections/add'); // 改为触发事件
    emit('request-add-connection');
  } else if (conn) {
    if (action === 'edit') {
      // router.push(`/connections/edit/${conn.id}`); // 改为触发事件
      emit('request-edit-connection', conn); // 传递整个连接对象
    } else if (action === 'delete') {
      if (confirm(t('connections.prompts.confirmDelete', { name: conn.name || conn.host }))) {
        connectionsStore.deleteConnection(conn.id);
        // 注意：删除后列表会自动更新，因为 store 是响应式的
      }
    }
  }
};

// 获取数据
onMounted(() => {
  connectionsStore.fetchConnections();
  tagsStore.fetchTags();
});

// 处理中键点击（在新标签页打开）
const handleOpenInNewTab = (connectionId: number) => {
  emit('open-new-session', connectionId);
  closeContextMenu(); // 如果右键菜单是打开的，也关闭它
};
</script>

<template>
  <div class="workspace-connection-list">
    <div v-if="connectionsLoading || tagsLoading" class="loading">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="connectionsError || tagsError" class="error">
      {{ connectionsError || tagsError }}
    </div>
    <div v-else-if="connections.length === 0" class="no-connections">
      {{ t('connections.noConnections') }}
      <button @click="handleMenuAction('add')">{{ t('connections.addConnection') }}</button>
    </div>
    <div v-else>
      <!-- 添加连接按钮（总是在顶部） -->
      <button class="add-connection-button" @click="handleMenuAction('add')">
        <i class="fas fa-plus"></i> {{ t('connections.addConnection') }}
      </button>
      <div v-for="group in groupedConnections" :key="group.groupName" class="connection-group">
        <div class="group-header" @click="toggleGroup(group.groupName)">
          <i :class="['fas', expandedGroups[group.groupName] ? 'fa-chevron-down' : 'fa-chevron-right']"></i>
          <span>{{ group.groupName }}</span>
        </div>
        <ul v-show="expandedGroups[group.groupName]" class="connection-items">
          <li
            v-for="conn in group.connections"
            :key="conn.id"
            class="connection-item"
            @click.left="handleConnect(conn.id)"
            @click.middle.prevent="handleOpenInNewTab(conn.id)"
            @auxclick.prevent="handleOpenInNewTab(conn.id)"
            @contextmenu.prevent="showContextMenu($event, conn)"
          >
            <i class="fas fa-server connection-icon"></i>
            <span class="connection-name" :title="conn.name || conn.host">
              {{ conn.name || conn.host }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
      @click.stop
    >
      <!-- 防止点击菜单内部关闭菜单 -->
      <ul>
        <li @click="handleMenuAction('add')"><i class="fas fa-plus"></i> {{ t('connections.addConnection') }}</li>
        <li v-if="contextTargetConnection" @click="handleMenuAction('edit')"><i class="fas fa-edit"></i> {{ t('connections.actions.edit') }}</li>
        <li v-if="contextTargetConnection" @click="handleMenuAction('delete')"><i class="fas fa-trash-alt"></i> {{ t('connections.actions.delete') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.workspace-connection-list {
  padding: 0.5rem 0;
  height: 100%;
  overflow-y: auto;
  background-color: #f8f9fa; /* Slightly different background */
  font-size: 0.9em;
}

.loading, .error, .no-connections {
  padding: 1rem;
  text-align: center;
  color: #6c757d;
}
.error {
    color: #dc3545;
}
.no-connections button {
    margin-top: 0.5rem;
    padding: 0.3rem 0.6rem;
}

.add-connection-button {
    display: block;
    width: calc(100% - 1rem); /* Adjust width */
    margin: 0.5rem;
    padding: 0.5rem;
    text-align: left;
    background-color: #e9ecef;
    border: 1px solid #ced4da;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    color: #495057;
}
.add-connection-button:hover {
    background-color: #dee2e6;
}
.add-connection-button i {
    margin-right: 0.5rem;
}


.connection-group {
  margin-bottom: 0.5rem;
}

.group-header {
  padding: 0.4rem 0.8rem;
  font-weight: bold;
  cursor: pointer;
  background-color: #e9ecef;
  border-top: 1px solid #dee2e6;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  color: #495057;
}
.group-header:hover {
    background-color: #ced4da;
}

.group-header i {
  margin-right: 0.5rem;
  width: 1em; /* Ensure icon takes space */
  text-align: center;
  transition: transform 0.2s ease-in-out;
}
/* Rotate chevron when collapsed */
.group-header i.fa-chevron-right {
    /* transform: rotate(0deg); */ /* Default state */
}
.group-header i.fa-chevron-down {
    /* transform: rotate(90deg); */ /* Rotated state */
}


.connection-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.connection-item {
  padding: 0.5rem 1rem 0.5rem 1.5rem; /* Indent items */
  cursor: pointer;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f1f3f5; /* Lighter separator */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-item:hover {
  background-color: #e9ecef;
}

.connection-icon {
  margin-right: 0.6rem;
  color: #6c757d;
  width: 1em;
  text-align: center;
}

.connection-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-grow: 1;
}

/* Context Menu Styles */
.context-menu {
  position: fixed;
  background-color: white;
  border: 1px solid #ccc;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  padding: 0.5rem 0;
  z-index: 1001; /* Above the list */
  min-width: 150px;
}

.context-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.context-menu li {
  padding: 0.5rem 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.context-menu li:hover {
  background-color: #f0f0f0;
}
.context-menu li i {
    margin-right: 0.75rem;
    width: 1em;
    text-align: center;
    color: #495057;
}
</style>
