<template>
  <div class="flex flex-col h-full overflow-hidden bg-background p-2">
    <!-- Container for controls and list -->
    <div class="flex flex-col flex-grow border border-border rounded-md overflow-hidden bg-background">
      <!-- Controls embedded within the container -->
      <div class="flex items-stretch p-2 border-b border-border flex-shrink-0 gap-1 bg-header">
        <input
          type="text"
          :placeholder="$t('quickCommands.searchPlaceholder', '搜索名称或指令...')"
          :value="searchTerm"
          data-focus-id="quickCommandsSearch"
          @input="updateSearchTerm($event)"
          @keydown="handleKeydown"
          ref="searchInputRef"
          class="flex-grow min-w-[8px] px-2 py-1 border border-border rounded-sm bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        />
        <button @click="toggleSortBy" class="w-8 py-1 border border-border rounded-sm text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150 flex-shrink-0 flex" :title="sortButtonTitle">
          <i :class="[sortButtonIcon, 'text-sm', 'm-auto']"></i>
        </button>
        <button @click="openAddForm" class="w-8 py-1 border border-border rounded-sm text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150 flex-shrink-0 flex" :title="$t('quickCommands.add', '添加快捷指令')">
          <i class="fas fa-plus text-sm m-auto"></i>
        </button>
      </div>
      <!-- List Area -->
      <div class="flex-grow overflow-y-auto">
        <ul v-if="filteredAndSortedCommands.length > 0" class="list-none p-0 m-0" ref="commandListRef">
          <li
            v-for="(cmd, index) in filteredAndSortedCommands"
            :key="cmd.id"
            class="group flex justify-between items-center px-3 py-2 cursor-pointer border-b border-border last:border-b-0 hover:bg-header/50 transition-colors duration-150"
            :class="{ 'bg-primary/10 text-primary': index === selectedIndex }"
            @mouseover="hoveredItemId = cmd.id; selectedIndex = index"
            @mouseleave="hoveredItemId = null; selectedIndex = -1"
            @click="executeCommand(cmd)"
          >
            <div class="flex flex-col overflow-hidden mr-2 flex-grow">
              <span v-if="cmd.name" class="font-medium text-foreground text-sm truncate mb-0.5">{{ cmd.name }}</span>
              <span class="text-xs text-text-secondary truncate font-mono" :class="{ 'text-sm text-foreground': !cmd.name }">{{ cmd.command }}</span>
            </div>
            <div class="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
               <span class="text-xs text-text-secondary bg-border px-1.5 py-0.5 rounded mr-1" :class="{'text-primary bg-primary/20': index === selectedIndex}" :title="t('quickCommands.usageCount', '使用次数')">{{ cmd.usage_count }}</span>
              <button @click.stop="openEditForm(cmd)" class="p-1 text-text-secondary hover:text-primary transition-colors duration-150" :class="{'text-primary': index === selectedIndex}" :title="$t('common.edit', '编辑')">
                <i class="fas fa-edit text-xs"></i>
              </button>
              <button @click.stop="confirmDelete(cmd)" class="p-1 text-text-secondary hover:text-error transition-colors duration-150" :class="{'text-primary': index === selectedIndex}" :title="$t('common.delete', '删除')">
                <i class="fas fa-times text-xs"></i>
              </button>
            </div>
          </li>
        </ul>
        <div v-else-if="isLoading" class="p-6 text-center text-text-secondary text-sm">
          {{ t('common.loading', '加载中...') }}
        </div>
        <div v-else class="p-6 text-center text-text-secondary text-sm italic">
          {{ $t('quickCommands.empty', '没有快捷指令。点击“添加”按钮创建一个吧！') }}
        </div>
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

