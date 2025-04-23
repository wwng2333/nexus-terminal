<template>
  <div class="flex flex-col h-full overflow-hidden bg-background">
    <!-- Container for controls and list -->
    <div class="flex flex-col flex-grow overflow-hidden bg-background">
      <!-- Controls embedded within the container -->
      <div class="flex items-stretch p-2 border-b border-border flex-shrink-0 gap-1 bg-header"> 
        <input
          type="text"
          :placeholder="$t('commandHistory.searchPlaceholder', '搜索历史记录...')"
          :value="searchTerm"
          data-focus-id="commandHistorySearch"
          @input="updateSearchTerm($event)"
          @keydown="handleKeydown"
          ref="searchInputRef"
          class="flex-grow min-w-[8px] px-2 py-1 border border-border rounded-sm bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        />
        <button @click="confirmClearAll" class="w-8 py-1 border border-border rounded-sm text-text-secondary hover:bg-error/10 hover:text-error hover:border-error/50 transition-colors duration-150 flex-shrink-0 flex" :title="$t('commandHistory.clear', '清空')">
          <i class="fas fa-trash-alt text-sm m-auto"></i>
        </button>
      </div>
      <!-- List Area -->
      <div class="flex-grow overflow-y-auto">
        <ul ref="historyListRef" v-if="filteredHistory.length > 0" class="list-none p-0 m-0">
          <li
            v-for="(entry, index) in filteredHistory"
            :key="entry.id"
            class="group flex justify-between items-center px-3 py-2 cursor-pointer border-b border-border last:border-b-0 hover:bg-header/50 transition-colors duration-150"
            :class="{ 'bg-primary/10 text-primary': index === selectedIndex }"
            @mouseover="hoveredItemId = entry.id; selectedIndex = index"
            @mouseleave="hoveredItemId = null; selectedIndex = -1"
            @click="executeCommand(entry.command)"
          >
            <span class="truncate mr-2 flex-grow font-mono text-sm text-foreground" :class="{'text-primary': index === selectedIndex}">{{ entry.command }}</span>
            <div class="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button @click.stop="copyCommand(entry.command)" class="p-1 text-text-secondary hover:text-primary transition-colors duration-150" :class="{'text-primary': index === selectedIndex}" :title="$t('commandHistory.copy', '复制')">
                <i class="fas fa-copy text-xs"></i>
              </button>
              <button @click.stop="deleteSingleCommand(entry.id)" class="ml-1 p-1 text-text-secondary hover:text-error transition-colors duration-150" :class="{'text-primary': index === selectedIndex}" :title="$t('commandHistory.delete', '删除')">
                <i class="fas fa-times text-xs"></i>
              </button>
            </div>
          </li>
        </ul>
        <div v-else-if="isLoading" class="p-6 text-center text-text-secondary text-sm">
          {{ $t('commandHistory.loading', '加载中...') }}
        </div>
        <div v-else class="p-6 text-center text-text-secondary text-sm italic">
          {{ $t('commandHistory.empty', '没有历史记录') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, defineExpose } from 'vue';
import { useCommandHistoryStore, CommandHistoryEntryFE } from '../stores/commandHistory.store';
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { useI18n } from 'vue-i18n';
import PaneTitleBar from '../components/PaneTitleBar.vue'; // 导入标题栏
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++

const commandHistoryStore = useCommandHistoryStore();
const uiNotificationsStore = useUiNotificationsStore();
const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++
const hoveredItemId = ref<number | null>(null);
const selectedIndex = ref<number>(-1); // -1 表示没有选中
const historyListRef = ref<HTMLUListElement | null>(null); // Ref for the history list UL
const searchInputRef = ref<HTMLInputElement | null>(null); // +++ Ref for the search input +++
let unregisterFocus: (() => void) | null = null; // +++ 保存注销函数 +++

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

// +++ 注册/注销自定义聚焦动作 +++
onMounted(() => {
  // +++ 保存返回的注销函数 +++
  unregisterFocus = focusSwitcherStore.registerFocusAction('commandHistorySearch', focusSearchInput);
});
onBeforeUnmount(() => {
  // +++ 调用保存的注销函数 +++
  if (unregisterFocus) {
    unregisterFocus();
  }
});

// --- 事件处理 ---

// 更新搜索词
const updateSearchTerm = (event: Event) => {
  const target = event.target as HTMLInputElement;
  commandHistoryStore.setSearchTerm(target.value);
  selectedIndex.value = -1; // Reset selection when search term changes
};

// 滚动到选中的项目
const scrollToSelected = async () => {
  await nextTick(); // 等待 DOM 更新
  if (selectedIndex.value < 0 || !historyListRef.value) return;

  const listElement = historyListRef.value;
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
  }
};

// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  const history = filteredHistory.value;
  if (!history.length) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % history.length;
      scrollToSelected();
      break;
    case 'ArrowUp':
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value - 1 + history.length) % history.length;
      scrollToSelected();
      break;
    case 'Enter':
      event.preventDefault();
      if (selectedIndex.value >= 0 && selectedIndex.value < history.length) {
        executeCommand(history[selectedIndex.value].command);
      }
      break;
  }
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

