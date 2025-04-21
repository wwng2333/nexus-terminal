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
onMounted(() => {
  focusSwitcherStore.registerFocusAction('commandInput', focusCommandInput);
  focusSwitcherStore.registerFocusAction('terminalSearch', focusSearchInput);
});

onBeforeUnmount(() => {
  focusSwitcherStore.unregisterFocusAction('commandInput');
  focusSwitcherStore.unregisterFocusAction('terminalSearch');
});
</script>

<template>
  <div class="command-input-bar">
    <div class="input-wrapper" :class="{ 'searching': isSearching }">
      <!-- 新增：焦点切换配置按钮 -->
      <button @click="focusSwitcherStore.toggleConfigurator(true)" class="icon-button focus-switcher-button" :title="t('commandInputBar.configureFocusSwitch', '配置焦点切换')">
        <i class="fas fa-keyboard"></i> <!-- 或者其他合适的图标 -->
      </button>
      <!-- 命令输入框 (始终渲染) -->
      <input
        type="text"
        v-model="commandInput"
        :placeholder="t('commandInputBar.placeholder')"
        class="command-input"
        ref="commandInputRef"
        data-focus-id="commandInput"
        @keydown.enter="sendCommand"
        @keydown="handleCommandInputKeydown"
      />

      <!-- 搜索输入框 (始终渲染, 通过 CSS 控制显示/隐藏和宽度) -->
      <input
        type="text"
        v-model="searchTerm"
        :placeholder="t('commandInputBar.searchPlaceholder')"
        class="search-input"
        data-focus-id="terminalSearch"
        @keydown.enter.prevent="findNext"
        @keydown.shift.enter.prevent="findPrevious"
        @keydown.up.prevent="findPrevious"
        @keydown.down.prevent="findNext"
        ref="searchInputRef"
      />

      <!-- 搜索控制按钮 -->
      <div class="search-controls">
        <button @click="toggleSearch" class="icon-button" :title="isSearching ? t('commandInputBar.closeSearch') : t('commandInputBar.openSearch')">
          <i v-if="!isSearching" class="fas fa-search"></i>
          <i v-else class="fas fa-times"></i>
        </button>

        <template v-if="isSearching">
          <button @click="findPrevious" class="icon-button" :title="t('commandInputBar.findPrevious')">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button @click="findNext" class="icon-button" :title="t('commandInputBar.findNext')">
            <i class="fas fa-arrow-down"></i>
          </button>

        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
.command-input-bar {
  display: flex;
  align-items: center;
  padding: 5px 10px; /* 增加左右 padding */
  background-color: var(--app-bg-color);
  min-height: 30px;
  gap: 5px; /* 减小整体间隙 */
}

.input-wrapper {
  flex-grow: 1;
  display: flex;
  align-items: center; /* 垂直居中对齐 */
  background-color: transparent;
  position: relative; /* 为了按钮定位 */
  gap: 5px; /* 在按钮和输入框之间添加间隙 */
}

/* 焦点切换按钮样式 (复用 icon-button) */
.focus-switcher-button {
  /* 可以添加特定样式，如果需要的话 */
  flex-shrink: 0; /* 防止按钮被压缩 */
}


.command-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9em;
  background-color: var(--input-bg-color, var(--app-bg-color));
  color: var(--text-color);
  outline: none;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, flex-basis 0.3s ease-in-out; /* Add flex-basis transition */
  margin-right: 5px;
  flex: 1 1 100%; /* Default: command input takes full width */
}

.search-input {
  /* Default styles */
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9em;
  background-color: var(--input-bg-color, var(--app-bg-color));
  color: var(--text-color);
  outline: none;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, flex-basis 0.3s ease-in-out, opacity 0.3s ease-in-out; /* Adjusted transitions */
  margin-right: 5px;
  /* Default state: hidden */
  display: none;
  flex: 0 1 0%; /* Allow shrinking, basis 0 */
  opacity: 0; /* Fade out */
}

/* Styles when searching is active */
.input-wrapper.searching .command-input {
  flex: 3 1 75%; /* Command input takes 3 parts */
}

.input-wrapper.searching .search-input {
  display: block; /* Make it visible */
  flex: 1 1 25%; /* Search input takes 1 part */
  margin-left: 5px; /* Add margin between inputs */
  opacity: 1; /* Fade in */
  /* Padding, border, etc. are already defined in the base .search-input rule */
}


.command-input:focus,
.search-input:focus {
  border-color: var(--button-bg-color);
  box-shadow: 0 0 5px var(--button-bg-color, #007bff);
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 5px; /* 控件之间的间隙 */
  background-color: var(--app-bg-color); /* 确保背景色一致 */
}

.icon-button {
  background: none;
  border: none;
  padding: 0.2rem 0.4rem; /* Match FileManager padding */
  cursor: pointer;
  color: var(--text-color-secondary); /* Match FileManager default color */
  display: flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle; /* Match FileManager */
  border-radius: 3px; /* Match FileManager */
  transition: background-color 0.2s ease, color 0.2s ease; /* Match FileManager transition */
}

.icon-button:hover:not(:disabled) { /* Match FileManager hover */
  background-color: rgba(0, 0, 0, 0.08);
  color: var(--text-color);
}

.icon-button:disabled { /* Add disabled state */
    opacity: 0.5;
    cursor: not-allowed;
}

/* Style the icon inside the button like FileManager */
.icon-button i {
    font-size: 1.1em; /* Match FileManager icon size */
    color: var(--button-bg-color); /* Match FileManager icon color */
    transition: color 0.2s ease;
}

.icon-button:hover:not(:disabled) i { /* Match FileManager icon hover */
    color: var(--button-hover-bg-color, var(--button-bg-color));
}

/* 实际使用图标库时可以这样设置大小 */
/*
.icon-button svg {
  width: 18px;
  height: 18px;
}
*/

.search-results {
  font-size: 0.8em;
  color: var(--text-secondary-color, #666); /* Use theme variable */
  margin-left: 5px;
  white-space: nowrap; /* 防止换行 */
}
.search-results.no-results {
  color: var(--warning-color, #ffc107); /* Use theme variable */
}
</style>
