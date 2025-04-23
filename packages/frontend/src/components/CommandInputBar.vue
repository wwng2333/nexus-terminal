<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, defineExpose } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // 导入 Store
// 假设你有一个图标库，例如 unplugin-icons 或类似库
// import SearchIcon from '~icons/mdi/magnify';
// import ArrowUpIcon from '~icons/mdi/arrow-up';
// import ArrowDownIcon from '~icons/mdi/arrow-down';
// import CloseIcon from '~icons/mdi/close';

const emit = defineEmits(['send-command', 'search', 'find-next', 'find-previous', 'close-search']); // 移除 open-focus-switcher-config 事件
const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化 Store +++

// Props definition is now empty as search results are no longer handled here
const props = defineProps<{
  // No props defined here currently
}>();
const commandInput = ref('');
const isSearching = ref(false);
const searchTerm = ref('');
// *** 移除本地的搜索结果 ref ***
// const searchResultCount = ref(0);
// const currentSearchResultIndex = ref(0);

const sendCommand = () => {
  const command = commandInput.value;
  console.log(`[CommandInputBar] Sending command: ${command || '<Enter>'} `);
  emit('send-command', command + '\n');
  commandInput.value = '';
};

const toggleSearch = () => {
  isSearching.value = !isSearching.value;
  if (!isSearching.value) {
    searchTerm.value = ''; // 关闭搜索时清空
    emit('close-search'); // 通知父组件关闭搜索
  } else {
    // 可以在这里聚焦搜索输入框
    // nextTick(() => searchInputRef.value?.focus());
  }
};

const performSearch = () => {
  emit('search', searchTerm.value);
  // 实际的计数更新逻辑应该由父组件通过 props 或事件传递回来
};

const findNext = () => {
  emit('find-next');
};

const findPrevious = () => {
  emit('find-previous');
};

// 监听搜索词变化，执行搜索
watch(searchTerm, (newValue) => {
  if (isSearching.value) {
    performSearch();
  }
});

// 可以在这里添加一个 ref 用于聚焦搜索框
const searchInputRef = ref<HTMLInputElement | null>(null);
const commandInputRef = ref<HTMLInputElement | null>(null); // Ref for command input

// Removed debug computed property

const handleCommandInputKeydown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === 'f') {
    event.preventDefault(); // 阻止浏览器默认的查找行为
    isSearching.value = true;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
};

// +++ 监听 Store 中的触发器以激活终端搜索 +++
watch(() => focusSwitcherStore.activateTerminalSearchTrigger, () => {
    if (focusSwitcherStore.activateTerminalSearchTrigger > 0 && !isSearching.value) {
        console.log('[CommandInputBar] Received terminal search activation trigger from store.');
        toggleSearch(); // 调用组件内部的切换搜索方法来激活
    }
});

// --- Focus Actions ---
const focusCommandInput = (): boolean => {
  if (commandInputRef.value) {
    commandInputRef.value.focus();
    return true;
  }
  return false;
};

const focusSearchInput = (): boolean => {
  if (!isSearching.value) {
    // If search is not active, activate it first
    toggleSearch(); // This might need nextTick if toggleSearch is async
    nextTick(() => { // Ensure DOM is updated after toggleSearch
        if (searchInputRef.value) {
            searchInputRef.value.focus();
        }
    });
    // Since focusing might be async after toggle, we optimistically return true
    // or adjust based on toggleSearch's behavior. For simplicity, assume it works.
    return true;
  } else if (searchInputRef.value) {
    searchInputRef.value.focus();
    return true;
  }
  return false;
};

defineExpose({ focusCommandInput, focusSearchInput });

// --- Register/Unregister Focus Actions ---
let unregisterCommandInputFocus: (() => void) | null = null;
let unregisterTerminalSearchFocus: (() => void) | null = null;

onMounted(() => {
  unregisterCommandInputFocus = focusSwitcherStore.registerFocusAction('commandInput', focusCommandInput);
  unregisterTerminalSearchFocus = focusSwitcherStore.registerFocusAction('terminalSearch', focusSearchInput);
});

onBeforeUnmount(() => {
  if (unregisterCommandInputFocus) {
    unregisterCommandInputFocus();
  }
  if (unregisterTerminalSearchFocus) {
    unregisterTerminalSearchFocus();
  }
});
</script>

<template>
  <div class="flex items-center px-2.5 py-1.5 bg-background min-h-[30px] gap-1.5">
    <div class="flex-grow flex items-center bg-transparent relative gap-1.5">
      <!-- Focus Switcher Config Button -->
      <button
        @click="focusSwitcherStore.toggleConfigurator(true)"
        class="flex-shrink-0 flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 hover:bg-black/10 hover:text-foreground"
        :title="t('commandInputBar.configureFocusSwitch', '配置焦点切换')"
      >
        <i class="fas fa-keyboard text-base text-primary transition-colors duration-200"></i>
      </button>
      <!-- Command Input -->
      <input
        type="text"
        v-model="commandInput"
        :placeholder="t('commandInputBar.placeholder')"
        class="flex-grow px-2.5 py-1.5 border border-border rounded text-sm bg-input text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-300 ease-in-out"
        :class="{ 'flex-basis-3/4': isSearching, 'flex-basis-full': !isSearching }"
        ref="commandInputRef"
        data-focus-id="commandInput"
        @keydown.enter="sendCommand"
        @keydown="handleCommandInputKeydown"
      />

      <!-- Search Input (Conditional rendering with v-show for transition) -->
      <input
        v-show="isSearching"
        type="text"
        v-model="searchTerm"
        :placeholder="t('commandInputBar.searchPlaceholder')"
        class="flex-grow px-2.5 py-1.5 border border-border rounded text-sm bg-input text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-300 ease-in-out flex-basis-1/4 ml-1.5"
        data-focus-id="terminalSearch"
        @keydown.enter.prevent="findNext"
        @keydown.shift.enter.prevent="findPrevious"
        @keydown.up.prevent="findPrevious"
        @keydown.down.prevent="findNext"
        ref="searchInputRef"
      />

      <!-- Search Controls -->
      <div class="flex items-center gap-1 flex-shrink-0">
        <button
          @click="toggleSearch"
          class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 hover:bg-black/10 hover:text-foreground"
          :title="isSearching ? t('commandInputBar.closeSearch') : t('commandInputBar.openSearch')"
        >
          <i v-if="!isSearching" class="fas fa-search text-base text-primary transition-colors duration-200"></i>
          <i v-else class="fas fa-times text-base text-primary transition-colors duration-200"></i>
        </button>

        <template v-if="isSearching">
          <button
            @click="findPrevious"
            class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 hover:bg-black/10 hover:text-foreground"
            :title="t('commandInputBar.findPrevious')"
          >
            <i class="fas fa-arrow-up text-base text-primary transition-colors duration-200"></i>
          </button>
          <button
            @click="findNext"
            class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 hover:bg-black/10 hover:text-foreground"
            :title="t('commandInputBar.findNext')"
          >
            <i class="fas fa-arrow-down text-base text-primary transition-colors duration-200"></i>
          </button>
        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Scoped styles removed for Tailwind CSS refactoring */
</style>
