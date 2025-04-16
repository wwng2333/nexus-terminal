<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件
import FileEditorTabs from './FileEditorTabs.vue'; // 导入标签栏组件
import { useFileEditorStore } from '../stores/fileEditor.store'; // 导入新的 Store

const { t } = useI18n();
const fileEditorStore = useFileEditorStore();

// 从 Store 获取新的多标签状态和方法
const {
    // editorVisibleState, // 可见性由父组件 (WorkspaceView) 控制 Pane 大小决定，不再需要内部状态
    activeTab,          // 当前激活的标签页对象 (computed)
    activeEditorContent,// 用于 v-model 绑定 (computed)
    orderedTabs,        // 标签页数组 (computed)
} = storeToRefs(fileEditorStore);

// 从 Store 获取方法
const {
    saveFile,           // 现在保存当前激活的标签页
    closeTab,           // 关闭指定标签页 (由 FileEditorTabs 调用)
    setActiveTab,       // 设置激活标签页 (由 FileEditorTabs 调用)
    // setEditorVisibility, // 不再由此组件控制
    // closeAllTabs,       // 关闭所有标签页 (如果需要，可以添加按钮触发)
} = fileEditorStore;

// --- 计算属性，用于模板绑定 ---
const currentTabIsLoading = computed(() => activeTab.value?.isLoading ?? false);
const currentTabLoadingError = computed(() => activeTab.value?.loadingError ?? null);
const currentTabIsSaving = computed(() => activeTab.value?.isSaving ?? false);
const currentTabSaveStatus = computed(() => activeTab.value?.saveStatus ?? 'idle');
const currentTabSaveError = computed(() => activeTab.value?.saveError ?? null);
const currentTabLanguage = computed(() => activeTab.value?.language ?? 'plaintext');
const currentTabFilePath = computed(() => activeTab.value?.filePath ?? '');
const currentTabIsModified = computed(() => activeTab.value?.isModified ?? false); // 用于显示修改状态

// --- 事件处理 ---
const handleSaveRequest = () => {
  // saveFile() 默认保存当前激活的标签页
  if (activeTab.value) { // 确保有活动标签才保存
      saveFile();
  }
};

// 注意：关闭/最小化按钮现在应该在 WorkspaceView 控制 Pane，而不是这里
// const handleCloseContainer = () => { ... };
// const handleMinimizeContainer = () => { ... };

</script>

<template>
  <!-- 这个容器不再控制自己的显示/隐藏，由 WorkspaceView 的 Pane 控制 -->
  <div class="file-editor-container">

      <!-- 1. 标签栏 -->
      <FileEditorTabs
        :tabs="orderedTabs"
        :active-tab-id="activeTab?.id ?? null"
        @activate-tab="setActiveTab"
        @close-tab="closeTab"
      />

      <!-- 2. 编辑器头部 (显示当前激活标签信息) -->
      <!-- 移除关闭/最小化按钮，这些由 WorkspaceView 控制 -->
      <div v-if="activeTab" class="editor-header">
        <span>
          {{ t('fileManager.editingFile') }}: {{ currentTabFilePath }}
          <span v-if="currentTabIsModified" class="modified-indicator">*</span>
        </span>
        <div class="editor-actions">
          <span v-if="currentTabSaveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
          <span v-if="currentTabSaveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
          <span v-if="currentTabSaveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ currentTabSaveError }}</span>
          <button @click="handleSaveRequest" :disabled="currentTabIsSaving || currentTabIsLoading || !!currentTabLoadingError || !activeTab" class="save-btn">
            {{ currentTabIsSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
          </button>
          <!-- 关闭/最小化按钮已移除 -->
        </div>
      </div>
      <!-- 如果没有活动标签页，显示简化头部 -->
      <div v-else class="editor-header editor-header-placeholder">
        <span>{{ t('fileManager.noOpenFile') }}</span>
        <!-- 动作区域留空或只显示通用按钮 -->
      </div>

      <!-- 3. 编辑器内容区域 -->
      <div class="editor-content-area">
        <div v-if="currentTabIsLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
        <div v-else-if="currentTabLoadingError" class="editor-error">{{ currentTabLoadingError }}</div>
        <MonacoEditor
          v-else-if="activeTab"
          :key="activeTab.id"  
          v-model="activeEditorContent"
          :language="currentTabLanguage"
          theme="vs-dark"
          class="editor-instance"
          @request-save="handleSaveRequest"
        />
        <div v-else class="editor-placeholder">{{ t('fileManager.selectFileToEdit') }}</div>
      </div>

  </div>
</template>

<style scoped>
/* 样式与 FileEditorOverlay 类似，但移除 backdrop 和 popup 结构 */
.file-editor-container {
  width: 100%;
  height: 100%; /* 填充父级 Pane */
  background-color: #2d2d2d; /* 编辑器背景 */
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
  overflow: hidden; /* 重要：防止内容溢出 */
}

/* 标签栏区域 */
/* FileEditorTabs 组件自带样式 */

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #333;
  border-bottom: 1px solid #555;
  font-size: 0.9em;
  flex-shrink: 0;
}
.editor-header-placeholder {
    justify-content: flex-start; /* 左对齐提示文本 */
    color: #888;
}

.modified-indicator {
    color: #ffeb3b;
    margin-left: 4px;
    font-weight: bold;
}

/* 编辑器内容区域 */
.editor-content-area {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}

.editor-loading, .editor-error, .editor-placeholder {
  padding: 2rem;
  text-align: center;
  font-size: 1.1em;
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
.editor-error { color: #ff8a8a; }
.editor-placeholder { color: #666; }

.editor-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.save-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
}
.save-btn:disabled { background-color: #aaa; cursor: not-allowed; }
.save-btn:hover:not(:disabled) { background-color: #45a049; }

.save-status {
    font-size: 0.9em;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    white-space: nowrap;
}
.save-status.saving { color: #888; }
.save-status.success { color: #4CAF50; background-color: #e8f5e9; }
.save-status.error { color: #f44336; background-color: #ffebee; }

.editor-instance {
  flex-grow: 1;
  min-height: 0;
}
</style>
