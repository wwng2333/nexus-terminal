<script setup lang="ts">
import type { PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FileTab } from '../stores/fileEditor.store'; // 导入 FileTab 类型

defineProps({
  tabs: {
    type: Array as PropType<FileTab[]>,
    required: true,
  },
  activeTabId: {
    type: String as PropType<string | null>,
    default: null,
  },
});

const emit = defineEmits<{
  (e: 'activate-tab', tabId: string): void;
  (e: 'close-tab', tabId: string): void;
}>();

const { t } = useI18n();

const handleActivate = (tabId: string) => {
  emit('activate-tab', tabId);
};

const handleClose = (event: MouseEvent, tabId: string) => {
  event.stopPropagation(); // 防止触发 activateTab
  emit('close-tab', tabId);
};
</script>

<template>
  <div class="file-editor-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.id === activeTabId }"
      @click="handleActivate(tab.id)"
      :title="tab.filePath"
    >
      <span class="tab-filename">{{ tab.filename }}</span>
      <span v-if="tab.isModified" class="modified-indicator">*</span>
      <button
        class="close-tab-btn"
        @click.stop="handleClose($event, tab.id)"
        :title="t('fileManager.actions.closeTab')"
      >
        ×
      </button>
    </div>
    <div v-if="tabs.length === 0" class="no-tabs-placeholder">
      <!-- 可以留空或添加提示 -->
    </div>
  </div>
</template>

<style scoped>
.file-editor-tabs {
  display: flex;
  flex-wrap: nowrap; /* 防止标签换行 */
  overflow-x: auto; /* 水平滚动 */
  background-color: #252526; /* VSCode 风格的标签背景 */
  border-bottom: 1px solid #3f3f46; /* 分隔线 */
  flex-shrink: 0; /* 防止标签栏被压缩 */
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: #555 #252526; /* Firefox */
}
/* Webkit 滚动条样式 */
.file-editor-tabs::-webkit-scrollbar {
  height: 4px; /* 滚动条高度 */
}
.file-editor-tabs::-webkit-scrollbar-track {
  background: #252526;
}
.file-editor-tabs::-webkit-scrollbar-thumb {
  background-color: #555;
  border-radius: 2px;
}
.file-editor-tabs::-webkit-scrollbar-thumb:hover {
  background-color: #666;
}


.tab-item {
  display: flex;
  align-items: center;
  padding: 6px 10px 6px 12px; /* 调整内边距 */
  cursor: pointer;
  border-right: 1px solid #3f3f46; /* 标签分隔线 */
  color: #cccccc; /* 未激活标签颜色 */
  background-color: #2d2d2d; /* 未激活标签背景 */
  white-space: nowrap; /* 防止文件名换行 */
  font-size: 0.85em;
  position: relative; /* 用于关闭按钮定位 */
  transition: background-color 0.1s ease-in-out;
}

.tab-item:hover {
  background-color: #3e3e42; /* 悬停背景 */
}

.tab-item.active {
  background-color: #1e1e1e; /* 激活标签背景 (编辑器背景色) */
  color: #ffffff; /* 激活标签文字颜色 */
  border-bottom: 1px solid #1e1e1e; /* 覆盖下边框，使其看起来连接内容 */
  margin-bottom: -1px; /* 轻微上移以覆盖边框 */
}

.tab-filename {
  margin-right: 4px;
  max-width: 150px; /* 限制文件名最大宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
}

.modified-indicator {
  color: #cccccc; /* 修改指示器颜色 */
  margin-left: 2px;
  margin-right: 4px; /* 与关闭按钮保持距离 */
  font-weight: normal;
}
.tab-item.active .modified-indicator {
    color: #ffffff; /* 激活标签的修改指示器颜色 */
}


.close-tab-btn {
  background: none;
  border: none;
  color: #cccccc;
  font-size: 1.1em; /* 调整大小 */
  line-height: 1;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 3px;
  opacity: 0.6; /* 默认稍透明 */
  transition: opacity 0.1s ease-in-out, background-color 0.1s ease-in-out;
}

.tab-item:hover .close-tab-btn,
.tab-item.active .close-tab-btn {
    opacity: 1; /* 悬停或激活时完全显示 */
}

.close-tab-btn:hover {
  background-color: rgba(255, 255, 255, 0.15); /* 悬停背景 */
  color: #ffffff;
}

.no-tabs-placeholder {
    flex-grow: 1; /* 占据剩余空间 */
    /* 可以添加样式 */
}
</style>
