<template>
  <div class="command-history-view">
    <!-- 移除 PaneTitleBar -->
    <div class="history-controls">
      <input
        type="text"
        :placeholder="$t('commandHistory.searchPlaceholder', '搜索历史记录...')"
        :value="searchTerm"
        @input="updateSearchTerm($event)"
        class="search-input"
      />
      <button @click="confirmClearAll" class="clear-button" :title="$t('commandHistory.clear', '清空')">
        <i class="fas fa-trash-alt"></i> <!-- 假设使用 Font Awesome -->
      </button>
    </div>
    <div class="history-list-container">
      <ul v-if="filteredHistory.length > 0" class="history-list">
        <li
          v-for="entry in filteredHistory"
          :key="entry.id"
          class="history-item"
          @mouseover="hoveredItemId = entry.id"
          @mouseleave="hoveredItemId = null"
          @click="executeCommand(entry.command)"
        >
          <span class="command-text">{{ entry.command }}</span>
          <div class="item-actions" v-show="hoveredItemId === entry.id">
            <button @click.stop="copyCommand(entry.command)" class="action-button" :title="$t('commandHistory.copy', '复制')">
              <i class="fas fa-copy"></i>
            </button>
            <button @click.stop="deleteSingleCommand(entry.id)" class="action-button delete" :title="$t('commandHistory.delete', '删除')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </li>
      </ul>
      <div v-else-if="isLoading" class="loading-message">
        {{ $t('commandHistory.loading', '加载中...') }}
      </div>
      <div v-else class="empty-message">
        {{ $t('commandHistory.empty', '没有历史记录') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useCommandHistoryStore, CommandHistoryEntryFE } from '../stores/commandHistory.store';
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { useI18n } from 'vue-i18n';
import PaneTitleBar from '../components/PaneTitleBar.vue'; // 导入标题栏

const commandHistoryStore = useCommandHistoryStore();
const uiNotificationsStore = useUiNotificationsStore();
const { t } = useI18n();
const hoveredItemId = ref<number | null>(null);

// --- 从 Store 获取状态和 Getter ---
const searchTerm = computed(() => commandHistoryStore.searchTerm);
// 使用 store 的 filteredHistory getter
const filteredHistory = computed(() => commandHistoryStore.filteredHistory);
const isLoading = computed(() => commandHistoryStore.isLoading);

// --- 事件定义 ---
// 定义组件发出的事件
const emit = defineEmits<{
  (e: 'execute-command', command: string): void; // 定义新事件
}>();

// --- 生命周期钩子 ---
onMounted(() => {
  // 视图挂载时获取历史记录 (如果 store 中还没有的话)
  if (commandHistoryStore.historyList.length === 0) {
      commandHistoryStore.fetchHistory();
  }
});

// --- 事件处理 ---

// 更新搜索词
const updateSearchTerm = (event: Event) => {
  const target = event.target as HTMLInputElement;
  commandHistoryStore.setSearchTerm(target.value);
};

// 确认清空所有历史记录
const confirmClearAll = () => {
  if (window.confirm(t('commandHistory.confirmClear', '确定要清空所有历史记录吗？'))) {
    commandHistoryStore.clearAllHistory();
  }
};

// 复制命令到剪贴板
const copyCommand = async (command: string) => {
  try {
    await navigator.clipboard.writeText(command);
    uiNotificationsStore.showSuccess(t('commandHistory.copied', '已复制到剪贴板'));
  } catch (err) {
    console.error('复制命令失败:', err);
    uiNotificationsStore.showError(t('commandHistory.copyFailed', '复制失败'));
  }
};

// 删除单条历史记录
const deleteSingleCommand = (id: number) => {
  commandHistoryStore.deleteCommand(id);
};

// 新增：执行命令 (发出事件)
const executeCommand = (command: string) => {
  emit('execute-command', command);
};

</script>

<style scoped>
.command-history-view {
  display: flex;
  flex-direction: column;
  height: 100%; /* 填充父 Pane 高度 */
  overflow: hidden;
  background-color: var(--color-bg-secondary);
}

.history-controls {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  flex-shrink: 0; /* 防止被压缩 */
}

.search-input {
  flex-grow: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background-color: var(--color-input-bg);
  color: var(--color-text);
  margin-right: 8px;
  font-size: 0.9em;
}

.clear-button {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 5px;
  font-size: 1.1em;
  line-height: 1;
}
.clear-button:hover {
  color: var(--color-danger);
}

.history-list-container {
  flex-grow: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 超出时显示滚动条 */
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: default; /* 列表项本身不可点击 */
  border-bottom: 1px solid var(--color-border-light);
  transition: background-color 0.2s ease;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item:hover {
  background-color: var(--color-bg-hover);
}

.command-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 10px;
  flex-grow: 1;
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}

.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
