<template>
  <div class="flex flex-col h-full overflow-hidden bg-background">
    <!-- Container for controls and list -->
    <div class="flex flex-col flex-grow overflow-hidden bg-background">
      <!-- Controls Area -->
      <div class="flex items-center p-2  flex-shrink-0 gap-2 bg-background"> <!-- Reduced padding p-3 to p-2 -->
        <input
          type="text"
          :placeholder="$t('quickCommands.searchPlaceholder', '搜索名称或指令...')"
          :value="searchTerm"
          data-focus-id="quickCommandsSearch"
          @input="updateSearchTerm($event)"
          @keydown="handleSearchInputKeydown"
          @blur="handleSearchInputBlur"
          ref="searchInputRef"
          class="flex-grow min-w-0 px-4 py-1.5 border border-border/50 rounded-lg bg-input text-foreground text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out"
        />
        <!-- Sort Button -->
        <button @click="toggleSortBy" class="w-8 h-8 border border-border/50 rounded-lg text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150 flex-shrink-0 flex items-center justify-center" :title="sortButtonTitle"> <!-- Use w-8 h-8 -->
          <i :class="[sortButtonIcon, 'text-base']"></i>
        </button>
        <!-- Add Button -->
        <button @click="openAddForm" class="w-8 h-8 bg-primary text-white border-none rounded-lg text-sm font-semibold cursor-pointer shadow-md transition-colors duration-200 ease-in-out hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary flex-shrink-0 flex items-center justify-center" :title="$t('quickCommands.add', '添加快捷指令')"> <!-- Use w-8 h-8 -->
          <i class="fas fa-plus text-base"></i>
        </button>
      </div>
      <!-- List Area -->
      <div class="flex-grow overflow-y-auto p-2">
        <!-- Loading State -->
        <!-- Loading State (Only show if loading AND no commands are displayed yet) -->
        <div v-if="isLoading && filteredAndSortedCommands.length === 0" class="p-6 text-center text-text-secondary text-sm flex flex-col items-center justify-center h-full">
          <i class="fas fa-spinner fa-spin text-xl mb-2"></i>
          <p>{{ t('common.loading', '加载中...') }}</p>
        </div>
        <!-- Empty State -->
        <div v-else-if="filteredAndSortedCommands.length === 0" class="p-6 text-center text-text-secondary text-sm flex flex-col items-center justify-center h-full">
           <i class="fas fa-bolt text-xl mb-2"></i>
           <p class="mb-3">{{ $t('quickCommands.empty', '没有快捷指令。') }}</p>
           <button @click="openAddForm" class="px-4 py-2 bg-primary text-white border-none rounded-lg text-sm font-semibold cursor-pointer shadow-md transition-colors duration-200 ease-in-out hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
             {{ $t('quickCommands.addFirst', '创建第一个快捷指令') }}
           </button>
        </div>
        <!-- Command List -->
        <ul v-else class="list-none p-0 m-0" ref="commandListRef">
          <li
            v-for="(cmd, index) in filteredAndSortedCommands"
            :key="cmd.id"
            class="group flex justify-between items-center px-3 py-2.5 mb-1 cursor-pointer rounded-md hover:bg-primary/10 transition-colors duration-150"
            :class="{ 'bg-primary/20 font-medium': index === storeSelectedIndex }"
            @click="executeCommand(cmd)"
          >
            <!-- Command Info -->
            <div class="flex flex-col overflow-hidden mr-2 flex-grow">
              <span v-if="cmd.name" class="font-medium text-sm truncate mb-0.5 text-foreground">{{ cmd.name }}</span>
              <span class="text-xs truncate font-mono" :class="{ 'text-sm': !cmd.name, 'text-text-secondary': true }">{{ cmd.command }}</span>
            </div>
            <!-- Actions (Show on Hover) -->
            <div class="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
               <!-- Usage Count -->
               <span class="text-xs bg-border px-1.5 py-0.5 rounded mr-2 text-text-secondary" :title="t('quickCommands.usageCount', '使用次数')">{{ cmd.usage_count }}</span>
               <!-- Edit Button -->
              <button @click.stop="openEditForm(cmd)" class="p-1.5 rounded hover:bg-black/10 transition-colors duration-150 text-text-secondary hover:text-primary" :title="$t('common.edit', '编辑')">
                <i class="fas fa-edit text-sm"></i>
              </button>
              <!-- Delete Button -->
              <button @click.stop="confirmDelete(cmd)" class="p-1.5 rounded hover:bg-black/10 transition-colors duration-150 text-text-secondary hover:text-error" :title="$t('common.delete', '删除')">
                <i class="fas fa-times text-sm"></i>
              </button>
            </div>
          </li>
        </ul>
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
import { ref, onMounted, onBeforeUnmount, computed, nextTick, defineExpose, watch } from 'vue'; // Import watch
import { storeToRefs } from 'pinia'; // Import storeToRefs
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
// const selectedIndex = ref<number>(-1); // REMOVED: Use store's selectedIndex
const commandListRef = ref<HTMLUListElement | null>(null); // Ref for the command list UL
const searchInputRef = ref<HTMLInputElement | null>(null); // +++ Ref for the search input +++
let unregisterFocus: (() => void) | null = null; // +++ 保存注销函数 +++

// --- 从 Store 获取状态和 Getter ---
const searchTerm = computed(() => quickCommandsStore.searchTerm);
const sortBy = computed(() => quickCommandsStore.sortBy);
const filteredAndSortedCommands = computed(() => quickCommandsStore.filteredAndSortedCommands);
const isLoading = computed(() => quickCommandsStore.isLoading);
const { selectedIndex: storeSelectedIndex } = storeToRefs(quickCommandsStore); // Get selectedIndex reactively

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
  // selectedIndex.value = -1; // REMOVED: Store handles resetting index
};

// 滚动到选中的项目
const scrollToSelected = async (index: number) => { // Accept index as argument
  await nextTick(); // 等待 DOM 更新
  if (index < 0 || !commandListRef.value) return;

  const listElement = commandListRef.value;
  const selectedItem = listElement.children[index] as HTMLLIElement;

  if (selectedItem) {
    // 使用 scrollIntoView 使元素可见，滚动最小距离
    selectedItem.scrollIntoView({
      behavior: 'smooth', // 可以使用 'auto' 来实现即时滚动
      block: 'nearest',
    });
  }
};

// Watch for changes in the store's selectedIndex and scroll
watch(storeSelectedIndex, (newIndex) => {
  scrollToSelected(newIndex);
});

// Renamed function to avoid conflict if needed, and added logic
const handleSearchInputKeydown = (event: KeyboardEvent) => {
  const commands = filteredAndSortedCommands.value;
  if (!commands.length) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      quickCommandsStore.selectNextCommand(); // Use store action
      // scrollToSelected is handled by watcher
      break;
    case 'ArrowUp':
      event.preventDefault();
      quickCommandsStore.selectPreviousCommand(); // Use store action
      // scrollToSelected is handled by watcher
      break;
    case 'Enter':
      event.preventDefault();
      if (storeSelectedIndex.value >= 0 && storeSelectedIndex.value < commands.length) {
        executeCommand(commands[storeSelectedIndex.value]);
      }
      break;
  }
};

// 处理搜索框失焦事件
const handleSearchInputBlur = () => {
  // 延迟执行，以允许点击列表项事件先触发
  setTimeout(() => {
    // 检查焦点是否还在组件内部的其他可聚焦元素上（例如按钮）
    // 如果焦点移出整个组件区域，则重置选择
    if (document.activeElement !== searchInputRef.value && !commandListRef.value?.contains(document.activeElement)) {
       quickCommandsStore.resetSelection();
    }
  }, 100); // 短暂延迟
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
  // selectedIndex.value = -1; // REMOVED: Store handles index
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

