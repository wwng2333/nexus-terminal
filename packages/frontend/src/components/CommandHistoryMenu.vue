<template>
  <div class="command-history-menu">
    <div class="history-header">
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
    <div class="history-list-container" ref="listContainer">
      <ul v-if="filteredHistory.length > 0" class="history-list">
        <li
          v-for="entry in filteredHistory"
          :key="entry.id"
          class="history-item"
          @mouseover="hoveredItemId = entry.id"
          @mouseleave="hoveredItemId = null"
          @click="selectCommand(entry.command)"
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
import { useUiNotificationsStore } from '../stores/uiNotifications.store'; // 引入 UI 通知 store
import { useI18n } from 'vue-i18n'; // 引入 i18n

const commandHistoryStore = useCommandHistoryStore();
const uiNotificationsStore = useUiNotificationsStore(); // 实例化 UI 通知 store
const { t } = useI18n(); // 使用 i18n
const hoveredItemId = ref<number | null>(null);
const listContainer = ref<HTMLElement | null>(null);

// --- 从 Store 获取状态和 Getter ---
const searchTerm = computed(() => commandHistoryStore.searchTerm);
const filteredHistory = computed(() => commandHistoryStore.filteredHistory);
const isLoading = computed(() => commandHistoryStore.isLoading);

// --- 事件定义 ---
// 定义组件发出的事件
const emit = defineEmits<{
  (e: 'select-command', command: string): void;
}>();

// --- 生命周期钩子 ---
onMounted(() => {
  commandHistoryStore.fetchHistory(); // 组件挂载时获取历史记录
});

// --- 事件处理 ---

// 更新搜索词 (防抖可以后续优化)
const updateSearchTerm = (event: Event) => {
  const target = event.target as HTMLInputElement;
  commandHistoryStore.setSearchTerm(target.value);
};

// 确认清空所有历史记录
const confirmClearAll = () => {
  // 使用浏览器的 confirm 对话框进行确认
  if (window.confirm(t('commandHistory.confirmClear', '确定要清空所有历史记录吗？'))) {
    commandHistoryStore.clearAllHistory();
  }
};

// 复制命令到剪贴板
const copyCommand = async (command: string) => {
  try {
    await navigator.clipboard.writeText(command);
    // 可以选择性地显示一个复制成功的提示
    uiNotificationsStore.showSuccess(t('commandHistory.copied', '已复制到剪贴板')); // 使用独立的 uiNotificationsStore
  } catch (err) {
    console.error('复制命令失败:', err);
    uiNotificationsStore.showError(t('commandHistory.copyFailed', '复制失败')); // 使用独立的 uiNotificationsStore
  }
};

// 删除单条历史记录
const deleteSingleCommand = (id: number) => {
  // 可以选择性地添加确认对话框
  commandHistoryStore.deleteCommand(id);
};

// 选中命令 (通知父组件)
const selectCommand = (command: string) => {
  emit('select-command', command);
};

</script>

<style scoped>
.command-history-menu {
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-secondary); /* 使用 CSS 变量 */
  border: 1px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden; /* 防止内容溢出 */
}

.history-header {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
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
  color: var(--color-danger); /* 悬浮时变红 */
}

.history-list-container {
  max-height: 300px; /* 限制最大高度 */
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
  cursor: pointer;
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
  text-overflow: ellipsis; /* 超长时显示省略号 */
  margin-right: 10px; /* 给右侧按钮留出空间 */
  flex-grow: 1; /* 占据剩余空间 */
  font-family: var(--font-family-mono); /* 使用等宽字体 */
  font-size: 0.9em;
}

.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0; /* 防止按钮被压缩 */
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
  color: var(--color-danger); /* 删除按钮悬浮时变红 */
}

.loading-message,
.empty-message {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
