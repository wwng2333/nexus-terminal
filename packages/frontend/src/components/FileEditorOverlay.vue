<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'; // 导入 ref, watch 等
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件
import FileEditorTabs from './FileEditorTabs.vue'; // 导入标签栏组件
import { useFileEditorStore } from '../stores/fileEditor.store'; // 导入新的 Store
// 导入设置 store 以检查弹窗设置 (虽然 App.vue 做了顶层控制，但这里可以加一层保险)
import { useSettingsStore } from '../stores/settings.store';

const { t } = useI18n();
const fileEditorStore = useFileEditorStore();
const settingsStore = useSettingsStore();

// --- 本地状态控制弹窗显示 ---
const isVisible = ref(false);

// --- 从 Store 获取状态 ---
const {
    // editorVisibleState, // 不再使用
    activeTab,          // 当前激活的标签页对象 (computed)
    activeEditorContent,// 用于 v-model 绑定 (computed)
    orderedTabs,        // 标签页数组 (computed)
    popupTrigger,       // 监听这个值的变化来显示弹窗
} = storeToRefs(fileEditorStore);
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore); // 获取弹窗设置

// --- 从 Store 获取方法 ---
const {
    saveFile,           // 现在保存当前激活的标签页
    closeTab,           // 关闭指定标签页 (由 FileEditorTabs 调用)
    setActiveTab,       // 设置激活标签页 (由 FileEditorTabs 调用)
    // setEditorVisibility, // 不再使用
    // closeAllTabs,       // 不在此组件中关闭所有
} = fileEditorStore;

// --- 弹窗尺寸和拖拽状态 ---
const popupWidthPx = ref(window.innerWidth * 0.75); // 初始宽度 75vw (像素)
const popupHeightPx = ref(window.innerHeight * 0.85); // 初始高度 85vh (像素)
const isResizing = ref(false);
const startX = ref(0);
const startY = ref(0);
const startWidthPx = ref(0);
const startHeightPx = ref(0);
const minWidth = 400; // 最小宽度
const minHeight = 300; // 最小高度

// --- 计算属性，用于模板绑定 ---
const popupStyle = computed(() => ({
    width: `${popupWidthPx.value}px`,
    height: `${popupHeightPx.value}px`,
}));
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
  saveFile();
};

// 关闭弹窗
const handleCloseContainer = () => {
  isVisible.value = false; // 只隐藏弹窗
};

// 最小化编辑器容器 (如果需要实现)
// const handleMinimizeContainer = () => {
//   setEditorVisibility('minimized');
// };

// --- 拖拽调整大小逻辑 ---
const startResize = (event: MouseEvent) => {
    isResizing.value = true;
    startX.value = event.clientX;
    startY.value = event.clientY;
    startWidthPx.value = popupWidthPx.value;
    startHeightPx.value = popupHeightPx.value;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'nwse-resize'; // 设置拖拽光标
    document.body.style.userSelect = 'none'; // 禁止拖拽时选中文本
};

const handleResize = (event: MouseEvent) => {
    if (!isResizing.value) return;
    const diffX = event.clientX - startX.value;
    const diffY = event.clientY - startY.value;
    popupWidthPx.value = Math.max(minWidth, startWidthPx.value + diffX);
    popupHeightPx.value = Math.max(minHeight, startHeightPx.value + diffY);
};

const stopResize = () => {
    if (isResizing.value) {
        isResizing.value = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = ''; // 恢复默认光标
    document.body.style.userSelect = ''; // 恢复文本选择
    }
};

// 监听 popupTrigger 的变化来显示弹窗 (如果设置允许)
watch(popupTrigger, () => {
    if (showPopupFileEditorBoolean.value) {
        console.log('[FileEditorOverlay] Popup trigger changed, showing overlay.');
        isVisible.value = true;
    } else {
         console.log('[FileEditorOverlay] Popup trigger changed, but overlay is disabled in settings.');
    }
});


// 组件卸载时清理事件监听器
onBeforeUnmount(() => {
    stopResize(); // 确保移除监听器
});

</script>

<template>
  <!-- 使用本地 isVisible 控制显示 (App.vue 中已有 v-if="showPopupFileEditorBoolean") -->
  <div v-if="isVisible" class="editor-overlay-backdrop" @click.self="handleCloseContainer"> <!-- 恢复点击背景关闭 -->
    <!-- 编辑器弹窗/容器，应用动态样式 -->
    <div class="editor-popup" :style="popupStyle">

      <!-- 1. 标签栏 -->
      <!-- 1. 标签栏 -->
      <FileEditorTabs
        :tabs="orderedTabs"
        :active-tab-id="activeTab?.id ?? null"
        @activate-tab="setActiveTab"
        @close-tab="closeTab"
      />

      <!-- 2. 编辑器头部 (显示当前激活标签信息) -->
      <div v-if="activeTab" class="editor-header">
        <!-- 显示当前激活标签的文件路径和修改状态 -->
        <span>
          {{ t('fileManager.editingFile') }}: {{ currentTabFilePath }}
          <span v-if="currentTabIsModified" class="modified-indicator">*</span>
        </span>
        <div class="editor-actions">
          <!-- 显示当前激活标签的保存状态 -->
          <span v-if="currentTabSaveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
          <span v-if="currentTabSaveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
          <span v-if="currentTabSaveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ currentTabSaveError }}</span>
          <!-- 保存按钮，状态基于当前激活标签 -->
          <button @click="handleSaveRequest" :disabled="currentTabIsSaving || currentTabIsLoading || !!currentTabLoadingError || !activeTab" class="save-btn">
            {{ currentTabIsSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
          </button>
          <!-- 关闭整个容器按钮 -->
          <button @click="handleCloseContainer" class="close-editor-btn" :title="t('fileManager.actions.closeEditor')">✖</button>
           <!-- 可以添加最小化按钮 -->
           <!-- <button @click="handleMinimizeContainer" class="minimize-editor-btn" title="Minimize">_</button> -->
        </div>
      </div>
       <!-- 如果没有活动标签页，显示提示 -->
      <div v-else class="editor-header editor-header-placeholder">
        <span>{{ t('fileManager.noOpenFile') }}</span>
         <button @click="handleCloseContainer" class="close-editor-btn" :title="t('fileManager.actions.closeEditor')">✖</button>
      </div>

      <!-- 3. 编辑器内容区域 -->
      <div class="editor-content-area">
        <!-- 显示当前激活标签的加载状态 -->
        <div v-if="currentTabIsLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
        <!-- 显示当前激活标签的加载错误 -->
        <div v-else-if="currentTabLoadingError" class="editor-error">{{ currentTabLoadingError }}</div>
        <!-- Monaco 编辑器实例 (仅当有活动标签且未加载/错误时显示) -->
        <MonacoEditor
          v-else-if="activeTab"
          :key="activeTab.id"  
          v-model="activeEditorContent"
          :language="currentTabLanguage"
          theme="vs-dark"
          class="editor-instance"
          @request-save="handleSaveRequest"
        />
         <!-- 如果容器可见但没有活动标签页 -->
        <div v-else class="editor-placeholder">{{ t('fileManager.selectFileToEdit') }}</div>
      </div>

      <!-- 添加拖拽手柄 -->
      <div class="resize-handle" @mousedown.prevent="startResize"></div>

    </div> <!-- 关闭 editor-popup -->
  </div> <!-- 关闭 editor-overlay-backdrop -->

   <!-- 可以添加一个最小化状态的显示 -->
   <!--
   <div v-if="editorVisibleState === 'minimized'" class="editor-minimized-bar" @click="setEditorVisibility('visible')">
       <span>File Editor</span>
       <button @click.stop="handleCloseContainer">✖</button>
   </div>
   -->
</template>

<style scoped>
/* 样式基本保持不变，但可能需要为标签栏和新状态调整 */
.editor-overlay-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.editor-popup {
  width: 75%; /* 可以适当调整大小 */
  height: 85%;
  background-color: #2d2d2d;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
  overflow: hidden;
  position: relative; /* 为拖拽手柄定位 */
}

/* 标签栏区域 (FileEditorTabs 组件将放在这里) */
/* .file-tabs-container { ... } */

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
    justify-content: space-between; /* 保持关闭按钮在右侧 */
    color: #888;
}

.modified-indicator {
    color: #ffeb3b; /* 黄色星号表示修改 */
    margin-left: 4px;
    font-weight: bold;
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

/* 编辑器内容区域，包含加载、错误、编辑器实例 */
.editor-content-area {
    flex-grow: 1;
    display: flex; /* 使内部元素能填充 */
    flex-direction: column;
    overflow: hidden; /* 内部编辑器滚动 */
    position: relative; /* 用于占位符定位 */
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
.editor-error {
    color: #ff8a8a;
}
.editor-placeholder {
    color: #666;
}


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
.save-btn:disabled {
    background-color: #aaa;
    cursor: not-allowed;
}
.save-btn:hover:not(:disabled) {
    background-color: #45a049;
}

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

/* 拖拽手柄样式 */
.resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 15px;
    height: 15px;
    background-color: rgba(255, 255, 255, 0.2); /* 半透明手柄 */
    border-top: 1px solid #555;
    border-left: 1px solid #555;
    cursor: nwse-resize; /* 斜向拖拽光标 */
    z-index: 1001; /* 确保在内容之上 */
}
.resize-handle:hover {
    background-color: rgba(255, 255, 255, 0.4);
}


/* 最小化状态样式 (可选) */
/*
.editor-minimized-bar {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: #f0f0f0;
    padding: 0.5rem 1rem;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
    cursor: pointer;
    z-index: 1001;
    display: flex;
    align-items: center;
    gap: 1rem;
}
.editor-minimized-bar button {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
}
*/
</style>
