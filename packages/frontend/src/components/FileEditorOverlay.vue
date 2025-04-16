<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件
import { useFileEditorStore } from '../stores/fileEditor.store'; // 导入新的 Store

// 不再需要 props 或 emits，状态和操作来自 Store
// const props = defineProps<{...}>();
// const emit = defineEmits<{...}>();

const { t } = useI18n();
const fileEditorStore = useFileEditorStore();

// 从 Store 获取状态 (使用 storeToRefs 保持响应性)
const {
    isVisible,
    filePath,
    fileLanguage, // 重命名为 language 以匹配 MonacoEditor prop
    isLoading,
    loadingError,
    isSaving,
    saveStatus,
    saveError,
    fileContent, // 直接使用 store 中的 ref 进行 v-model 绑定
} = storeToRefs(fileEditorStore);

// 从 Store 获取方法
const { saveFile, closeEditor, updateContent } = fileEditorStore;

// 计算属性，用于 v-model 绑定到 MonacoEditor
// 直接绑定 store 中的 fileContent ref
const editorContent = computed({
  get: () => fileContent.value,
  set: (value) => updateContent(value), // 调用 store action 更新内容
});

// 保存和关闭操作直接调用 store actions
const handleSaveRequest = () => {
  saveFile();
};

const handleClose = () => {
  closeEditor();
};
</script>

<template>
  <!-- 使用 store 中的 isVisible 控制显示 -->
  <!-- 将 v-if 移到遮罩层上 -->
  <div v-if="isVisible" class="editor-overlay-backdrop" @click.self="handleClose"> <!-- 点击背景关闭 -->
    <!-- 添加弹窗容器 -->
    <div class="editor-popup">
      <div class="editor-header">
        <!-- 使用 store 中的 filePath -->
        <span>{{ t('fileManager.editingFile') }}: {{ filePath }}</span>
      <div class="editor-actions">
        <!-- 使用 store 中的保存状态 -->
        <span v-if="saveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
        <span v-if="saveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
        <span v-if="saveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ saveError }}</span>
        <!-- 保存按钮，使用 store 状态和方法 -->
        <button @click="handleSaveRequest" :disabled="isSaving || isLoading || !!loadingError" class="save-btn">
          {{ isSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
        </button>
        <!-- 关闭按钮，使用 store 方法 -->
        <button @click="handleClose" class="close-editor-btn">✖</button>
      </div>
    </div>
    <!-- 使用 store 中的加载状态 -->
    <div v-if="isLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
    <!-- 使用 store 中的加载错误 -->
    <div v-else-if="loadingError" class="editor-error">{{ loadingError }}</div>
    <!-- Monaco 编辑器实例 -->
    <MonacoEditor
      v-else
      v-model="editorContent"
      :language="fileLanguage"  
      theme="vs-dark"
      class="editor-instance"
      @request-save="handleSaveRequest"
    />
    </div> <!-- 关闭 editor-popup -->
  </div> <!-- 关闭 editor-overlay-backdrop -->
</template>

<style scoped>
/* 样式调整为居中弹窗样式 */
.editor-overlay-backdrop { /* 新增背景遮罩层 */
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6); /* 半透明黑色背景 */
  z-index: 1000; /* 确保在最上层 */
  display: flex;
  justify-content: center;
  align-items: center;
}

.editor-popup { /* 编辑器本身的容器 */
  width: 60%; /* 设置宽度为 60% */
  height: 80%; /* 设置一个合适的高度 */
  background-color: #2d2d2d; /* 深色背景 */
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
  overflow: hidden; /* 防止内容溢出圆角 */
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #333;
  border-bottom: 1px solid #555;
  font-size: 0.9em;
  flex-shrink: 0; /* 防止头部被压缩 */
}

.close-editor-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 1.2em;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
}
.close-editor-btn:hover {
  color: white;
}

.editor-loading, .editor-error {
  padding: 2rem;
  text-align: center;
  font-size: 1.1em;
  flex-grow: 1; /* 占据剩余空间 */
  display: flex;
  align-items: center;
  justify-content: center;
}
.editor-error {
    color: #ff8a8a;
}

.editor-actions {
    display: flex;
    align-items: center;
    gap: 1rem; /* 添加按钮间距 */
}

.save-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    /* margin-left: 1rem; */ /* 使用 gap 代替 */
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
}
.save-btn:disabled {
    background-color: #aaa;
    cursor: not-allowed;
}
.save-btn:hover:not(:disabled) {
    background-color: #45a049;
}

.save-status {
    /* margin-left: 1rem; */ /* 使用 gap 代替 */
    font-size: 0.9em;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    white-space: nowrap; /* 防止状态文本换行 */
}
.save-status.saving {
    color: #888;
}
.save-status.success {
    color: #4CAF50;
    background-color: #e8f5e9;
}
.save-status.error {
    color: #f44336;
    background-color: #ffebee;
}

.editor-instance {
  flex-grow: 1; /* 让编辑器占据剩余空间 */
  min-height: 0; /* 对 flex 布局中的子元素很重要 */
}
</style>
