<template>
  <div class="quick-commands-view">
    <!-- Removed original top controls -->
    <div class="commands-list-container">
      <!-- Moved controls inside the container -->
      <div class="embedded-controls">
        <input
          type="text"
          :placeholder="$t('quickCommands.searchPlaceholder', '搜索名称或指令...')"
          :value="searchTerm"
          data-focus-id="quickCommandsSearch"
          @input="updateSearchTerm($event)"
          @keydown="handleKeydown"
          ref="searchInputRef"
          class="search-input"
        />
        <button @click="toggleSortBy" class="sort-toggle-button" :title="sortButtonTitle">
          <i :class="sortButtonIcon"></i>
        </button>
        <button @click="openAddForm" class="add-button icon-only" :title="$t('quickCommands.add', '添加快捷指令')">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <ul v-if="filteredAndSortedCommands.length > 0" class="commands-list">
        <li
          v-for="(cmd, index) in filteredAndSortedCommands"
          :key="cmd.id"
          class="command-item"
          :class="{ selected: index === selectedIndex }"
          @mouseover="hoveredItemId = cmd.id; selectedIndex = index"
          @mouseleave="hoveredItemId = null; selectedIndex = -1"
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
import { ref, onMounted, onBeforeUnmount, computed, nextTick, defineExpose } from 'vue';
import { useQuickCommandsStore, type QuickCommandFE, type QuickCommandSortByType } from '../stores/quickCommands.store';
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { useI18n } from 'vue-i18n';
import AddEditQuickCommandForm from '../components/AddEditQuickCommandForm.vue'; // 导入表单组件
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++

const quickCommandsStore = useQuickCommandsStore();
const uiNotificationsStore = useUiNotificationsStore(); // 如果需要显示通知
const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++

const hoveredItemId = ref<number | null>(null);
const isFormVisible = ref(false);
const commandToEdit = ref<QuickCommandFE | null>(null);
const selectedIndex = ref<number>(-1); // -1 表示没有选中
const commandListRef = ref<HTMLUListElement | null>(null); // Ref for the command list UL
const searchInputRef = ref<HTMLInputElement | null>(null); // +++ Ref for the search input +++
let unregisterFocus: (() => void) | null = null; // +++ 保存注销函数 +++

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

// +++ 注册/注销自定义聚焦动作 +++
onMounted(() => {
  // +++ 保存返回的注销函数 +++
  unregisterFocus = focusSwitcherStore.registerFocusAction('quickCommandsSearch', focusSearchInput);
});
onBeforeUnmount(() => {
  // +++ 调用保存的注销函数 +++
  if (unregisterFocus) {
    unregisterFocus();
  }
});

// --- 事件处理 ---

const updateSearchTerm = (event: Event) => {
  const target = event.target as HTMLInputElement;
  quickCommandsStore.setSearchTerm(target.value);
  selectedIndex.value = -1; // Reset selection when search term changes
};

// 滚动到选中的项目
const scrollToSelected = async () => {
  await nextTick(); // 等待 DOM 更新
  if (selectedIndex.value < 0 || !commandListRef.value) return;

  const listElement = commandListRef.value;
  const selectedItem = listElement.children[selectedIndex.value] as HTMLLIElement;

  if (selectedItem) {
    const listRect = listElement.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();

    if (itemRect.top < listRect.top) {
      // Item is above the visible area
      listElement.scrollTop -= listRect.top - itemRect.top;
    } else if (itemRect.bottom > listRect.bottom) {
      // Item is below the visible area
      listElement.scrollTop += itemRect.bottom - listRect.bottom;
    }
    // For smooth scrolling (optional):
    // selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};


// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  const commands = filteredAndSortedCommands.value;
  if (!commands.length) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % commands.length;
      scrollToSelected();
      break;
    case 'ArrowUp':
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value - 1 + commands.length) % commands.length;
      scrollToSelected();
      break;
    case 'Enter':
      event.preventDefault();
      if (selectedIndex.value >= 0 && selectedIndex.value < commands.length) {
        executeCommand(commands[selectedIndex.value]);
      }
      break;
  }
};


// 切换排序方式
const toggleSortBy = () => {
  const newSortBy = sortBy.value === 'name' ? 'usage_count' : 'name';
  quickCommandsStore.setSortBy(newSortBy);
};

// 计算排序按钮的 title 和 icon
const sortButtonTitle = computed(() => {
  return sortBy.value === 'name'
    ? t('quickCommands.sortByName', '按名称排序')
    : t('quickCommands.sortByUsage', '按使用频率排序');
});

const sortButtonIcon = computed(() => {
  // 使用 Font Awesome 图标示例
  return sortBy.value === 'name' ? 'fas fa-sort-alpha-down' : 'fas fa-sort-numeric-down';
});


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
  // Optionally reset selection after execution
  // selectedIndex.value = -1;
};

// +++ 新增：聚焦搜索框的方法 +++
const focusSearchInput = (): boolean => {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
    return true;
  }
  return false;
};
defineExpose({ focusSearchInput });

</script>

<style scoped>
.quick-commands-view {
  display: flex;
  flex-direction: column;
  height: 100%; /* Occupy available height */
  overflow: hidden;
  background-color: var(--app-bg-color); /* Use standard app background */
  padding: 0.5rem; /* Keep overall padding */
  box-sizing: border-box;
}

/* Remove original .view-header styles */
/* .view-header { ... } */

/* Styles for controls embedded within the list container */
.embedded-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* Allow wrapping */
  padding: 0.5rem; /* Add padding around embedded controls */
  /* Removed border-bottom and margin-bottom */
  flex-shrink: 0;
  gap: 0.25rem;
}

.search-input {
  flex-grow: 1; /* Allow search to grow */
  flex-basis: 10px; /* Give search a base width before growing */
  min-width: 8px; /* Reduced min-width */
  padding: 0.3rem 0.5rem; /* Reduced padding */
  border: 1px solid var(--border-color); /* Use standard border color */
  border-radius: 4px; /* Consistent border radius */
  background-color: var(--app-bg-color); /* Use app background for input */
  color: var(--text-color); /* Use standard text color */
  /* margin-right: 12px; */ /* Replaced by gap */
  font-size: 0.9em;
}
.search-input:focus {
    outline: none;
    border-color: var(--button-bg-color); /* Highlight border on focus */
    box-shadow: 0 0 5px var(--button-bg-color, #007bff); /* Use theme variable for glow */
}

/* 移除 .sort-controls 和 select 样式 */

.sort-toggle-button {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 0.3rem 0.5rem; /* Match input padding */
  font-size: 0.9em; /* Match input font size */
  line-height: 1;
  border-radius: 4px;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  flex-shrink: 0; /* Prevent shrinking */
}
.sort-toggle-button:hover {
  color: var(--text-color);
  border-color: var(--button-bg-color);
  background-color: rgba(128, 128, 128, 0.1);
}
.sort-toggle-button i {
    display: block; /* Ensure icon takes space */
}


.add-button {
  padding: 0.3rem 0.6rem; /* Default padding */
  background-color: var(--button-bg-color); /* Use standard button color */
  color: var(--button-text-color); /* Use standard button text color */
  border: none;
  border-radius: 4px; /* Consistent border radius */
  cursor: pointer;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  white-space: nowrap;
  transition: background-color 0.15s ease;
  flex-shrink: 0; /* Prevent shrinking */
}
.add-button.icon-only {
    padding: 0.3rem 0.5rem; /* Slightly adjust padding for icon only */
}
.add-button i {
    margin-right: 0; /* Remove margin when text is gone */
}
.add-button:hover {
  background-color: var(--button-hover-bg-color); /* Use standard hover color */
}

.commands-list-container {
  flex-grow: 1;
  overflow-y: auto;
  /* Add subtle border/background for visual separation */
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background-color: var(--app-bg-color);
  /* Add display:flex and flex-direction:column to stack controls and list */
  display: flex;
  flex-direction: column;
}

.commands-list {
  list-style: none;
  padding: 0;
  margin: 0;
  /* Ensure the list itself can scroll if needed, although container handles it */
  /* overflow-y: auto; */ /* Let container handle scroll */
}

.command-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.75rem; /* Reduced padding */
  cursor: pointer;
  border-bottom: 1px solid var(--border-color); /* Use standard border color */
  transition: background-color 0.15s ease;
}

.command-item:last-child {
  border-bottom: none; /* Keep removing border for last item */
}

.command-item:hover {
  background-color: var(--header-bg-color); /* Use header background for hover */
}
/* Style for the keyboard-selected item */
.command-item.selected {
  background-color: var(--button-bg-color, #007bff); /* Use button background or fallback */
  color: var(--button-text-color, white); /* Use button text color or fallback */
}
.command-item.selected .command-name,
.command-item.selected .command-text,
.command-item.selected .usage-count,
.command-item.selected .action-button {
    color: var(--button-text-color, white); /* Ensure text inside selected item is readable */
}


.command-info {
    display: flex;
    flex-direction: column; /* 名称和指令垂直排列 */
    overflow: hidden; /* 防止内容溢出 */
    margin-right: 10px;
    flex-grow: 1;
}

.command-name {
    font-weight: 500; /* Medium weight */
    color: var(--text-color); /* Use standard text color */
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
  font-family: var(--font-family-sans-serif);
  font-size: 0.85em;
  color: var(--text-color-secondary); /* Use standard secondary text color */
}
.command-text.full-width { /* 当没有名称时，指令占据全部空间 */
    font-size: 0.9em; /* 可以稍微大一点 */
    color: var(--text-color); /* Use standard text color */
}


.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.usage-count {
    font-size: 0.8em;
    color: var(--text-color-secondary); /* Use standard secondary text color */
    margin-right: 4px; /* Reduced margin */
    background-color: var(--header-bg-color); /* Use header background */
    padding: 2px 4px; /* Reduced padding */
    border-radius: 4px; /* Consistent border radius */
    min-width: 18px; /* Adjust min-width */
    text-align: center;
    font-weight: 500;
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
  border-radius: 4px; /* Add radius for hover effect */
  transition: color 0.15s ease, background-color 0.15s ease;
}

.action-button:hover {
  background-color: rgba(128, 128, 128, 0.1); /* Subtle hover background */
}
.action-button.edit:hover {
    color: var(--bs-warning, orange); /* Use Bootstrap warning or fallback */
}
.action-button.delete:hover {
  color: var(--bs-danger, red); /* Use Bootstrap danger or fallback */
}

.loading-message,
.empty-message {
  padding: var(--base-padding, 1rem) * 2; /* Increase padding */
  text-align: center;
  color: var(--text-color-secondary); /* Use standard secondary text color */
  font-style: italic;
}
</style>
