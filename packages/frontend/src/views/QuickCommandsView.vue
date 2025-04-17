<template>
  <div class="quick-commands-view">
    <div class="view-header">
      <input
        type="text"
        :placeholder="$t('quickCommands.searchPlaceholder', '搜索名称或指令...')"
        :value="searchTerm"
        @input="updateSearchTerm($event)"
        class="search-input"
      />
      <div class="sort-controls">
        <label for="sort-select">{{ t('quickCommands.sortBy', '排序:') }}</label>
        <select id="sort-select" :value="sortBy" @change="updateSortBy($event)">
          <option value="name">{{ t('quickCommands.sortByName', '名称') }}</option>
          <option value="usage_count">{{ t('quickCommands.sortByUsage', '使用频率') }}</option>
        </select>
      </div>
      <button @click="openAddForm" class="add-button" :title="$t('quickCommands.add', '添加快捷指令')">
        <i class="fas fa-plus"></i> {{ t('quickCommands.add', '添加') }}
      </button>
    </div>

    <div class="commands-list-container">
      <ul v-if="filteredAndSortedCommands.length > 0" class="commands-list">
        <li
          v-for="cmd in filteredAndSortedCommands"
          :key="cmd.id"
          class="command-item"
          @mouseover="hoveredItemId = cmd.id"
          @mouseleave="hoveredItemId = null"
          @click="executeCommand(cmd)"
        >
          <div class="command-info">
            <span v-if="cmd.name" class="command-name">{{ cmd.name }}</span>
            <span class="command-text" :class="{ 'full-width': !cmd.name }">{{ cmd.command }}</span>
          </div>
          <div class="item-actions" v-show="hoveredItemId === cmd.id">
             <span class="usage-count" :title="t('quickCommands.usageCount', '使用次数')">{{ cmd.usage_count }}</span>
            <button @click.stop="openEditForm(cmd)" class="action-button edit" :title="$t('common.edit', '编辑')">
              <i class="fas fa-edit"></i>
            </button>
            <button @click.stop="confirmDelete(cmd)" class="action-button delete" :title="$t('common.delete', '删除')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </li>
      </ul>
      <div v-else-if="isLoading" class="loading-message">
        {{ t('common.loading', '加载中...') }}
      </div>
      <div v-else class="empty-message">
        {{ $t('quickCommands.empty', '没有快捷指令。点击“添加”按钮创建一个吧！') }}
      </div>
    </div>

    <!-- 添加/编辑表单模态框 -->
    <AddEditQuickCommandForm
      v-if="isFormVisible"
      :command-to-edit="commandToEdit"
      @close="closeForm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useQuickCommandsStore, type QuickCommandFE, type QuickCommandSortByType } from '../stores/quickCommands.store';
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { useI18n } from 'vue-i18n';
import AddEditQuickCommandForm from '../components/AddEditQuickCommandForm.vue'; // 导入表单组件

const quickCommandsStore = useQuickCommandsStore();
const uiNotificationsStore = useUiNotificationsStore(); // 如果需要显示通知
const { t } = useI18n();

const hoveredItemId = ref<number | null>(null);
const isFormVisible = ref(false);
const commandToEdit = ref<QuickCommandFE | null>(null);

// --- 从 Store 获取状态和 Getter ---
const searchTerm = computed(() => quickCommandsStore.searchTerm);
const sortBy = computed(() => quickCommandsStore.sortBy);
const filteredAndSortedCommands = computed(() => quickCommandsStore.filteredAndSortedCommands);
const isLoading = computed(() => quickCommandsStore.isLoading);

// --- 事件定义 ---
const emit = defineEmits<{
  (e: 'execute-command', command: string): void; // 用于通知 WorkspaceView 执行命令
}>();

// --- 生命周期钩子 ---
onMounted(() => {
  quickCommandsStore.fetchQuickCommands(); // 组件挂载时获取数据
});

// --- 事件处理 ---

const updateSearchTerm = (event: Event) => {
  const target = event.target as HTMLInputElement;
  quickCommandsStore.setSearchTerm(target.value);
};

const updateSortBy = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const newSortBy = target.value as QuickCommandSortByType;
    quickCommandsStore.setSortBy(newSortBy);
};

const openAddForm = () => {
  commandToEdit.value = null;
  isFormVisible.value = true;
};

const openEditForm = (command: QuickCommandFE) => {
  commandToEdit.value = command;
  isFormVisible.value = true;
};

const closeForm = () => {
  isFormVisible.value = false;
  commandToEdit.value = null;
};

const confirmDelete = (command: QuickCommandFE) => {
  if (window.confirm(t('quickCommands.confirmDelete', { name: command.name || command.command }))) {
    quickCommandsStore.deleteQuickCommand(command.id);
  }
};

// 执行命令
const executeCommand = (command: QuickCommandFE) => {
  // 1. 增加使用次数 (后台操作，不阻塞执行)
  quickCommandsStore.incrementUsage(command.id);
  // 2. 发出执行事件给父组件
  emit('execute-command', command.command);
};

</script>

<style scoped>
.quick-commands-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg-secondary);
}

.view-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex-grow: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background-color: var(--color-input-bg);
  color: var(--color-text);
  margin-right: 12px;
  font-size: 0.9em;
}

.sort-controls {
    display: flex;
    align-items: center;
    margin-right: 12px;
}

.sort-controls label {
    margin-right: 6px;
    font-size: 0.9em;
    color: var(--color-text-secondary);
}

.sort-controls select {
    padding: 5px 8px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    background-color: var(--color-input-bg);
    color: var(--color-text);
    font-size: 0.9em;
}

.add-button {
  padding: 6px 12px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
  display: flex;
  align-items: center;
}
.add-button i {
    margin-right: 4px;
}
.add-button:hover {
  background-color: var(--color-primary-dark);
}

.commands-list-container {
  flex-grow: 1;
  overflow-y: auto;
}

.commands-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.command-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-light);
  transition: background-color 0.2s ease;
}

.command-item:last-child {
  border-bottom: none;
}

.command-item:hover {
  background-color: var(--color-bg-hover);
}

.command-info {
    display: flex;
    flex-direction: column; /* 名称和指令垂直排列 */
    overflow: hidden; /* 防止内容溢出 */
    margin-right: 10px;
    flex-grow: 1;
}

.command-name {
    font-weight: bold;
    color: var(--color-text);
    font-size: 0.95em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px; /* 名称和指令间距 */
}

.command-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-family-mono);
  font-size: 0.85em;
  color: var(--color-text-secondary);
}
.command-text.full-width { /* 当没有名称时，指令占据全部空间 */
    font-size: 0.9em; /* 可以稍微大一点 */
    color: var(--color-text); /* 颜色也可以更深 */
}


.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.usage-count {
    font-size: 0.8em;
    color: var(--color-text-muted);
    margin-right: 8px;
    background-color: var(--color-bg-tertiary);
    padding: 2px 5px;
    border-radius: 3px;
    min-width: 18px; /* 保证宽度 */
    text-align: center;
}

.action-button {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 2px 4px;
  margin-left: 6px;
  font-size: 0.9em;
  line-height: 1;
}

.action-button:hover {
  color: var(--color-primary);
}
.action-button.edit:hover {
    color: var(--color-warning); /* 编辑按钮用警告色 */
}
.action-button.delete:hover {
  color: var(--color-danger);
}

.loading-message,
.empty-message {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
