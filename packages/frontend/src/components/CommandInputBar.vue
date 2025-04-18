<script setup lang="ts">
import { ref, watch } from 'vue'; // Remove computed
import { useI18n } from 'vue-i18n';
// 假设你有一个图标库，例如 unplugin-icons 或类似库
// import SearchIcon from '~icons/mdi/magnify';
// import ArrowUpIcon from '~icons/mdi/arrow-up';
// import ArrowDownIcon from '~icons/mdi/arrow-down';
// import CloseIcon from '~icons/mdi/close';

const emit = defineEmits(['send-command', 'search', 'find-next', 'find-previous', 'close-search']);
const { t } = useI18n();

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
// const searchInputRef = ref<HTMLInputElement | null>(null);

// Removed debug computed property

</script>

<template>
  <div class="command-input-bar">
    <div class="input-wrapper" :class="{ 'searching': isSearching }">
      <!-- 命令输入框 (始终渲染) -->
      <input
        type="text"
        v-model="commandInput"
        :placeholder="t('commandInputBar.placeholder')"
        class="command-input"
        @keydown.enter="sendCommand"
      />

      <!-- 搜索输入框 (始终渲染, 通过 CSS 控制显示/隐藏和宽度) -->
      <input
        type="text"
        v-model="searchTerm"
        :placeholder="t('commandInputBar.searchPlaceholder')"
        class="search-input"
        @keydown.enter="findNext"
        @keydown.shift.enter="findPrevious"
        ref="searchInputRef"
      />

      <!-- 搜索控制按钮 -->
      <div class="search-controls">
        <button @click="toggleSearch" class="icon-button" :title="isSearching ? t('commandInputBar.closeSearch') : t('commandInputBar.openSearch')">
          <!-- 使用 Font Awesome 图标 -->
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
          <!-- 搜索结果显示已移除 -->
        </template>
      </div>
    </div>
    <!-- Removed hidden span -->
  </div>
</template>

<style scoped>
.command-input-bar {
  display: flex;
  align-items: center;
  padding: 5px 10px; /* 增加左右 padding */
  background-color: var(--app-bg-color);
  min-height: 30px;
  gap: 10px; /* 在输入框和控件之间添加间隙 */
}

.input-wrapper {
  flex-grow: 1;
  display: flex;
  align-items: center; /* 垂直居中对齐 */
  background-color: transparent;
  position: relative; /* 为了按钮定位 */
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
