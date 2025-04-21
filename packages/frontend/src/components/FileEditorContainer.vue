<script setup lang="ts">
import { computed, type PropType, ref, watch, defineExpose, onMounted, onBeforeUnmount } from 'vue'; // 添加 ref, watch, defineExpose, onMounted, onBeforeUnmount
import { useI18n } from 'vue-i18n';
// import { storeToRefs } from 'pinia'; // 移除 storeToRefs
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件
import FileEditorTabs from './FileEditorTabs.vue'; // 导入标签栏组件 (路径确认无误)
// import { useFileEditorStore } from '../stores/fileEditor.store'; // 移除 Store 导入
import type { FileTab } from '../stores/fileEditor.store'; // 保留类型导入
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++

const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++

// --- Props ---
const props = defineProps({
  tabs: {
    type: Array as PropType<FileTab[]>,
    required: true,
  },
  activeTabId: {
    type: String as PropType<string | null>,
    default: null,
  },
  sessionId: { // 需要 sessionId 来区分保存请求等 (虽然 tabs 里也有)
    type: String as PropType<string | null>,
    default: null,
  },
});

// --- Emits ---
const emit = defineEmits<{
  (e: 'activate-tab', tabId: string): void;
  (e: 'close-tab', tabId: string): void;
  (e: 'request-save', tabId: string): void; // 发送保存请求，携带 tabId
  (e: 'update:content', payload: { tabId: string; content: string }): void; // 用于 v-model 同步
}>();


// --- 计算属性，用于模板绑定 ---
const activeTab = computed((): FileTab | null => {
  if (!props.activeTabId) return null;
  return props.tabs.find(tab => tab.id === props.activeTabId) ?? null;
});

// Monaco Editor 的 v-model 处理
const localEditorContent = ref('');

// 监听 activeTab 的变化，重置 localEditorContent
watch(activeTab, (newTab) => {
    // console.log('[EditorContainer] Active tab changed, updating local content.');
    localEditorContent.value = newTab?.content ?? '';
}, { immediate: true });

// 监听 activeTab 内容的变化 (处理异步加载完成的情况)
watch(() => activeTab.value?.content, (newContent) => {
    // console.log('[EditorContainer] Active tab content changed, updating local content.');
    if (localEditorContent.value !== newContent) {
        localEditorContent.value = newContent ?? '';
    }
});

// 当本地编辑器内容变化时，通知父组件 (WorkspaceView)
watch(localEditorContent, (newContent) => {
    // console.log('[EditorContainer] Local content changed, checking if emit needed.');
    if (activeTab.value && newContent !== activeTab.value.content) {
        // console.log(`[EditorContainer] Emitting update:content for tab ${activeTab.value.id}`);
        // 只有当内容实际改变时才发出事件
        emit('update:content', { tabId: activeTab.value.id, content: newContent });
        // 注意：isModified 状态应该由 Store 根据 content 和 originalContent 计算
    }
});

// orderedTabs 直接使用 props
const orderedTabs = computed(() => props.tabs);


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
  if (activeTab.value) {
    emit('request-save', activeTab.value.id); // 发出保存请求事件
  }
};

// 注意：关闭/最小化按钮现在应该在 WorkspaceView 控制 Pane，而不是这里
// const handleCloseContainer = () => { ... };
// const handleMinimizeContainer = () => { ... };

// 新增：Monaco Editor 组件的引用
const monacoEditorRef = ref<InstanceType<typeof MonacoEditor> | null>(null);

// 新增：聚焦活动编辑器的方法
const focusActiveEditor = (): boolean => {
  if (monacoEditorRef.value) {
    monacoEditorRef.value.focus();
    return true; // 聚焦成功
  }
  return false; // 聚焦失败
};

// 新增：暴露聚焦方法
defineExpose({ focusActiveEditor });

// +++ 注册/注销自定义聚焦动作 +++
onMounted(() => {
  focusSwitcherStore.registerFocusAction('fileEditorActive', focusActiveEditor);
});
onBeforeUnmount(() => {
  focusSwitcherStore.unregisterFocusAction('fileEditorActive');
});
</script>

<template>
  <!-- 这个容器不再控制自己的显示/隐藏，由 WorkspaceView 的 Pane 控制 -->
  <div class="file-editor-container">

      <!-- 1. 标签栏 -->
      <FileEditorTabs
        :tabs="orderedTabs"
        :active-tab-id="props.activeTabId"
        @activate-tab="(tabId: string) => emit('activate-tab', tabId)" 
        @close-tab="(tabId: string) => emit('close-tab', tabId)" 
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
          <button @click="handleSaveRequest" :disabled="currentTabIsSaving || currentTabIsLoading || !!currentTabLoadingError || !activeTab || !currentTabIsModified" class="save-btn">
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
          ref="monacoEditorRef"
          :key="activeTab.id"
          v-model="localEditorContent" 
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
