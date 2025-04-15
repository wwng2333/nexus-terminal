<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件
import type { SaveStatus } from '../types/sftp.types'; // 导入保存状态类型

const props = defineProps<{
  isVisible: boolean; // 控制可见性
  filePath: string | null; // 当前编辑文件路径
  language: string; // 编辑器语言
  isLoading: boolean; // 是否正在加载文件内容
  loadingError: string | null; // 加载错误信息
  isSaving: boolean; // 是否正在保存
  saveStatus: SaveStatus; // 保存状态
  saveError: string | null; // 保存错误信息
  modelValue: string; // 文件内容 (用于 v-model)
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void; // v-model 更新事件
  (e: 'request-save'): void; // 请求保存事件
  (e: 'close'): void; // 关闭编辑器事件
}>();

const { t } = useI18n();

// 计算属性，用于 v-model 绑定到 MonacoEditor
const editorContent = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const handleSaveRequest = () => {
  emit('request-save');
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div v-if="isVisible" class="editor-overlay">
    <div class="editor-header">
      <span>{{ t('fileManager.editingFile') }}: {{ filePath }}</span>
      <div class="editor-actions">
        <!-- 保存状态显示 -->
        <span v-if="saveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
        <span v-if="saveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
        <span v-if="saveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ saveError }}</span>
        <!-- 保存按钮 -->
        <button @click="handleSaveRequest" :disabled="isSaving || isLoading || !!loadingError" class="save-btn">
          {{ isSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
        </button>
        <!-- 关闭按钮 -->
        <button @click="handleClose" class="close-editor-btn">✖</button>
      </div>
    </div>
    <!-- 加载状态 -->
    <div v-if="isLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
    <!-- 加载错误 -->
    <div v-else-if="loadingError" class="editor-error">{{ loadingError }}</div>
    <!-- Monaco 编辑器实例 -->
    <MonacoEditor
      v-else
      v-model="editorContent"
      :language="language"
      theme="vs-dark"
      class="editor-instance"
      @request-save="handleSaveRequest"
    />
  </div>
</template>

<style scoped>
/* 样式从 FileManager.vue 迁移并保持一致 */
.editor-overlay {
  position: absolute; /* 相对于父容器定位 */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(40, 40, 40, 0.95); /* 深色半透明背景 */
  z-index: 1000; /* 确保在文件列表之上，但在上传弹窗之下 */
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
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
