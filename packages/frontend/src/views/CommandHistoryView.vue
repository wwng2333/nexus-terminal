<template>
  <div class="command-history-view">
    <!-- 移除 PaneTitleBar -->
    <!-- Removed original top controls -->
    <div class="history-list-container">
      <!-- Moved controls inside the container -->
      <div class="embedded-controls">
        <input
          type="text"
          :placeholder="$t('commandHistory.searchPlaceholder', '搜索历史记录...')"
          :value="searchTerm"
          @input="updateSearchTerm($event)"
          class="search-input"
        />
        <button @click="confirmClearAll" class="clear-button" :title="$t('commandHistory.clear', '清空')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
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
  background-color: var(--app-bg-color); /* Use standard app background */
  padding: 0.5rem; /* Keep overall padding */
  box-sizing: border-box;
}

/* Remove original .history-controls styles */
/* .history-controls { ... } */

/* Styles for controls embedded within the list container */
.embedded-controls {
  display: flex;
  align-items: center;
  padding: 0.5rem; /* Add padding around embedded controls */
  /* Removed border-bottom and margin-bottom */
  flex-shrink: 0;
  gap: 0.25rem;
}

.search-input {
  flex-grow: 1;
  min-width: 8px; /* Added smaller min-width */
  padding: 0.3rem 0.5rem; /* Reduced padding */
  border: 1px solid var(--border-color); /* Use standard border color */
  border-radius: 4px; /* Consistent border radius */
  background-color: var(--app-bg-color); /* Use app background */
  color: var(--text-color); /* Use standard text color */
  /* margin-right: 8px; */ /* Replaced by gap */
  font-size: 0.9em;
}
.search-input:focus {
    outline: none;
    border-color: var(--button-bg-color); /* Highlight border on focus */
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25); /* Example focus shadow */
}

.clear-button {
  background: none;
  border: 1px solid var(--border-color); /* Add border */
  color: var(--text-color-secondary); /* Use standard secondary text color */
  cursor: pointer;
  padding: 0.3rem 0.5rem; /* Reduced padding */
  font-size: 0.9em; /* Match input font size */
  line-height: 1;
  border-radius: 4px; /* Consistent border radius */
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.clear-button:hover {
  color: var(--bs-danger, red); /* Use danger color on hover */
  border-color: var(--bs-danger, red);
  background-color: rgba(220, 53, 69, 0.1); /* Subtle danger background */
}
.clear-button i {
    display: block; /* Ensure icon takes space */
}


.history-list-container {
  flex-grow: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 超出时显示滚动条 */
  border: 1px solid var(--border-color); /* Keep border */
  border-radius: 5px; /* Keep radius */
  background-color: var(--app-bg-color); /* Ensure background */
  /* Add display:flex and flex-direction:column to stack controls and list */
  display: flex;
  flex-direction: column;
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
  padding: 0.4rem 0.75rem; /* Reduced padding */
  cursor: pointer; /* Make item clickable */
  border-bottom: 1px solid var(--border-color); /* Use standard border color */
  transition: background-color 0.15s ease;
}

.history-item:last-child {
  border-bottom: none; /* Keep removing border for last item */
}

.history-item:hover {
  background-color: var(--header-bg-color); /* Use header background for hover */
}

.command-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 10px;
  flex-grow: 1;
  font-family: var(--font-family-mono, monospace); /* Use mono font variable */
  font-size: 0.9em;
  color: var(--text-color); /* Use standard text color */
}

.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.action-button {
  background: none;
  border: none;
  color: var(--text-color-secondary); /* Use standard secondary text color */
  cursor: pointer;
  padding: 2px 4px; /* Reduced padding */
  margin-left: 4px; /* Reduced margin */
  font-size: 1em; /* Slightly larger icon size */
  line-height: 1;
  border-radius: 4px; /* Add radius for hover */
  transition: color 0.15s ease, background-color 0.15s ease;
}

.action-button:hover {
  background-color: rgba(128, 128, 128, 0.1); /* Subtle hover background */
  color: var(--link-hover-color); /* Use link hover color */
}

.action-button.delete:hover {
  color: var(--bs-danger, red); /* Use danger color */
  background-color: rgba(220, 53, 69, 0.1); /* Subtle danger background */
}

.loading-message,
.empty-message {
  padding: calc(var(--base-padding, 1rem) * 2); /* Increase padding */
  text-align: center;
  color: var(--text-color-secondary); /* Use standard secondary text color */
  font-style: italic;
}
</style>
