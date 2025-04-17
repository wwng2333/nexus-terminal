<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MonacoEditor from './MonacoEditor.vue';
import FileEditorTabs from './FileEditorTabs.vue';
import { useFileEditorStore, type FileTab } from '../stores/fileEditor.store'; // 导入 FileTab 类型
import { useSettingsStore } from '../stores/settings.store';
import { useSessionStore } from '../stores/session.store'; // 导入 Session Store
import type { EditorFileContent, SaveStatus } from '../types/sftp.types';
import { getLanguageFromFilename, getFilenameFromPath } from '../stores/fileEditor.store';

const { t } = useI18n();
const fileEditorStore = useFileEditorStore();
const settingsStore = useSettingsStore();
const sessionStore = useSessionStore(); // 实例化 Session Store

// --- 本地状态控制弹窗显示 ---
const isVisible = ref(false);

// --- 从 Store 获取状态 ---
// 全局 Store (用于共享模式和触发器)
const {
    popupTrigger,
    popupFileInfo, // 包含 sessionId 和 filePath
    activeTabId: globalActiveTabIdRef, // 获取全局 activeTabId
    tabs: globalTabsRef, // 获取全局 tabs Map
} = storeToRefs(fileEditorStore);

// 设置 Store (用于判断模式)
const { showPopupFileEditorBoolean, shareFileEditorTabsBoolean } = storeToRefs(settingsStore);

// --- 从 Store 获取方法 ---
// 全局 Store Actions (用于共享模式)
const {
    saveFile: saveGlobalFile,
    closeTab: closeGlobalTab,
    setActiveTab: setGlobalActiveTab,
    updateFileContent: updateGlobalFileContent,
} = fileEditorStore;

// 会话 Store Actions (用于非共享模式)
const {
    saveFileInSession,
    closeEditorTabInSession,
    setActiveEditorTabInSession,
    updateFileContentInSession,
} = sessionStore;

// --- 移除本地文件状态 ---
// const popupFilePath = ref<string | null>(null);
// const popupSessionId = ref<string | null>(null);
// const popupFilename = ref<string>('');
// const popupContent = ref<string>('');
// const popupOriginalContent = ref<string>('');
// const popupLanguage = ref<string>('plaintext');
// const popupIsLoading = ref<boolean>(false);
// const popupLoadingError = ref<string | null>(null);
// const popupIsSaving = ref<boolean>(false);
// const popupSaveStatus = ref<SaveStatus>('idle');
// const popupSaveError = ref<string | null>(null);
// const popupIsModified = computed(() => popupContent.value !== popupOriginalContent.value);

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

// --- 动态计算属性 (根据模式选择数据源) ---

// 获取当前弹窗关联的会话 (仅非共享模式需要)
const currentSession = computed(() => {
    if (shareFileEditorTabsBoolean.value || !popupFileInfo.value?.sessionId) {
        return null;
    }
    return sessionStore.sessions.get(popupFileInfo.value.sessionId) ?? null;
});

// 获取当前模式下的标签页列表
const orderedTabs = computed(() => {
    if (shareFileEditorTabsBoolean.value) {
        return Array.from(globalTabsRef.value.values()); // 全局 Store
    } else {
        return currentSession.value?.editorTabs.value ?? []; // 会话 Store
    }
});

// 获取当前模式下的活动标签页 ID
const activeTabId = computed(() => {
    if (shareFileEditorTabsBoolean.value) {
        return globalActiveTabIdRef.value; // 全局 Store
    } else {
        return currentSession.value?.activeEditorTabId.value ?? null; // 会话 Store
    }
});

// 获取当前模式下的活动标签页对象
const activeTab = computed((): FileTab | null => {
    const currentId = activeTabId.value;
    if (!currentId) return null;

    if (shareFileEditorTabsBoolean.value) {
        return globalTabsRef.value.get(currentId) ?? null; // 全局 Store
    } else {
        // 在会话的 editorTabs 数组中查找
        return currentSession.value?.editorTabs.value.find(tab => tab.id === currentId) ?? null;
    }
});

// Monaco 编辑器内容绑定 (根据模式调用不同 action)
const activeEditorContent = computed({
    get: () => activeTab.value?.content ?? '',
    set: (value) => {
        const currentActiveTab = activeTab.value; // 缓存当前活动标签
        if (!currentActiveTab) return;

        if (shareFileEditorTabsBoolean.value) {
            updateGlobalFileContent(currentActiveTab.id, value); // 全局 Store
        } else {
            // 非共享模式需要 sessionId
            const sessionId = popupFileInfo.value?.sessionId;
            if (sessionId) {
                updateFileContentInSession(sessionId, currentActiveTab.id, value); // 会话 Store
            } else {
                console.error("[FileEditorOverlay] 无法更新内容：非共享模式下缺少 sessionId。");
            }
        }
    },
});


// --- 从 activeTab 派生的计算属性 (保持不变，因为 activeTab 已动态化) ---
const currentTabIsLoading = computed(() => activeTab.value?.isLoading ?? false);
const currentTabLoadingError = computed(() => activeTab.value?.loadingError ?? null);
const currentTabIsSaving = computed(() => activeTab.value?.isSaving ?? false);
const currentTabSaveStatus = computed(() => activeTab.value?.saveStatus ?? 'idle');
const currentTabSaveError = computed(() => activeTab.value?.saveError ?? null);
const currentTabLanguage = computed(() => activeTab.value?.language ?? 'plaintext');
const currentTabFilePath = computed(() => activeTab.value?.filePath ?? '');
const currentTabIsModified = computed(() => activeTab.value?.isModified ?? false);

// --- 事件处理 (根据模式调用不同 action) ---

// 保存当前激活的标签页
const handleSaveRequest = () => {
    const currentActiveTab = activeTab.value;
    if (!currentActiveTab) return;

    if (shareFileEditorTabsBoolean.value) {
        saveGlobalFile(currentActiveTab.id); // 全局 Store
    } else {
        const sessionId = popupFileInfo.value?.sessionId;
        if (sessionId) {
            saveFileInSession(sessionId, currentActiveTab.id); // 会话 Store
        } else {
             console.error("[FileEditorOverlay] 无法保存：非共享模式下缺少 sessionId。");
        }
    }
};

// 激活标签页
const handleActivateTab = (tabId: string) => {
    if (shareFileEditorTabsBoolean.value) {
        setGlobalActiveTab(tabId); // 全局 Store
    } else {
        const sessionId = popupFileInfo.value?.sessionId;
        if (sessionId) {
            setActiveEditorTabInSession(sessionId, tabId); // 会话 Store
        } else {
             console.error("[FileEditorOverlay] 无法激活标签页：非共享模式下缺少 sessionId。");
        }
    }
};

// 关闭标签页
const handleCloseTab = (tabId: string) => {
     if (shareFileEditorTabsBoolean.value) {
        closeGlobalTab(tabId); // 全局 Store
    } else {
        const sessionId = popupFileInfo.value?.sessionId;
        if (sessionId) {
            closeEditorTabInSession(sessionId, tabId); // 会话 Store
        } else {
             console.error("[FileEditorOverlay] 无法关闭标签页：非共享模式下缺少 sessionId。");
        }
    }
};


// 关闭弹窗 (保持不变)
const handleCloseContainer = () => {
    // 关闭前不再检查本地修改状态，因为没有本地状态了
    // 如果需要检查 store 中 activeTab 的修改状态，可以在这里添加逻辑
    // if (activeTab.value?.isModified) { ... }
    isVisible.value = false;
    // 不需要重置本地状态了
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

// 监听 popupTrigger 的变化来显示弹窗
watch(popupTrigger, () => {
    if (!showPopupFileEditorBoolean.value || !popupFileInfo.value) {
        console.log('[FileEditorOverlay] Popup trigger changed, but overlay is disabled or file info is missing.');
        isVisible.value = false;
        return;
    }

    const { filePath, sessionId } = popupFileInfo.value;
    console.log(`[FileEditorOverlay] Triggered for file: ${filePath} in session: ${sessionId}`);

    // 仅显示弹窗，激活逻辑由各自 store 的 openFile/openFileInSession 处理
    // 或者由 handleActivateTab 处理用户点击
    isVisible.value = true;

    // --- 确保激活状态正确 (重要) ---
    // 在非共享模式下，FileManager 调用 openFileInSession 时会设置会话内的 activeTabId。
    // 在共享模式下，FileManager 调用 openFile 时会设置全局的 activeTabId。
    // 这里不再需要强制调用 setActiveTab，因为触发弹窗时，对应的 store 应该已经处理了激活。
    // 如果发现激活不正确，问题可能在 FileManager 或对应的 store action 中。

    // 检查激活状态 (调试用)
    // nextTick(() => { // 确保在 DOM 更新后检查
    //     console.log(`[FileEditorOverlay] Popup shown. Current activeTabId: ${activeTabId.value}, Active Tab Object:`, activeTab.value);
    // });

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

      <!-- 标签栏 (使用动态计算属性和事件处理器) -->
      <FileEditorTabs
        :tabs="orderedTabs"
        :active-tab-id="activeTabId"
        @activate-tab="handleActivateTab"
        @close-tab="handleCloseTab"
      />

      <!-- 编辑器头部 (使用动态计算属性) -->
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
          <button @click="handleCloseContainer" class="close-editor-btn" :title="t('fileManager.actions.closeEditor')">✖</button>
        </div>
      </div>
       <!-- 如果没有活动标签页 -->
      <div v-else class="editor-header editor-header-placeholder">
        <span>{{ t('fileManager.noOpenFile') }}</span>
         <button @click="handleCloseContainer" class="close-editor-btn" :title="t('fileManager.actions.closeEditor')">✖</button>
      </div>

      <!-- 编辑器内容区域 (现在基于 activeTab) -->
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
