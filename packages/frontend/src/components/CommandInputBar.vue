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
    <div class="input-wrapper">
      <!-- 命令输入框 -->
      <input
        v-if="!isSearching"
        type="text"
        v-model="commandInput"
        :placeholder="t('commandInputBar.placeholder')"
        class="command-input"
        @keydown.enter="sendCommand"
      />

      <!-- 搜索输入框 -->
      <input
        v-if="isSearching"
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
          <!-- 使用图标代替文字 -->
          <span v-if="!isSearching">🔍</span> <!-- 临时使用 emoji -->
          <span v-else>❌</span> <!-- 临时使用 emoji -->
          <!-- <SearchIcon v-if="!isSearching" /> -->
          <!-- <CloseIcon v-else /> -->
        </button>

        <template v-if="isSearching">
          <button @click="findPrevious" class="icon-button" :title="t('commandInputBar.findPrevious')">
            <span>⬆️</span> <!-- 临时使用 emoji -->
            <!-- <ArrowUpIcon /> -->
          </button>
          <button @click="findNext" class="icon-button" :title="t('commandInputBar.findNext')">
            <span>⬇️</span> <!-- 临时使用 emoji -->
            <!-- <ArrowDownIcon /> -->
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

.command-input,
.search-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9em;
  background-color: var(--input-bg-color, var(--app-bg-color)); /* Use specific or fallback theme variable */
  color: var(--text-color);
  flex-grow: 1; /* 让输入框占据可用空间 */
  outline: none;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  margin-right: 5px; /* 与右侧控件保持距离 */
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
  padding: 4px;
  cursor: pointer;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.icon-button:hover {
  background-color: var(--hover-bg-color, #eee); /* Use theme variable */
}

.icon-button span { /* 临时 emoji 样式 */
  font-size: 1.1em;
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
