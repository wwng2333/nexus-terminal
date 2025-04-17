<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MonacoEditor from './MonacoEditor.vue';
// import FileEditorTabs from './FileEditorTabs.vue'; // 不再需要标签栏
import { useFileEditorStore } from '../stores/fileEditor.store';
import { useSettingsStore } from '../stores/settings.store';
import { useSessionStore } from '../stores/session.store'; // 导入 Session Store
import type { EditorFileContent, SaveStatus } from '../types/sftp.types'; // 导入类型
import { getLanguageFromFilename, getFilenameFromPath } from '../stores/fileEditor.store'; // 导入辅助函数

const { t } = useI18n();
const fileEditorStore = useFileEditorStore();
const settingsStore = useSettingsStore();
const sessionStore = useSessionStore(); // 导入 Session Store
// const { t } = useI18n(); // 移除重复声明

// --- 本地状态控制弹窗显示 ---
const isVisible = ref(false);

// --- 从 Store 获取状态 ---
const { popupTrigger, popupFileInfo } = storeToRefs(fileEditorStore); // 监听触发器和文件信息
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore);

// --- 本地状态管理弹窗内的文件 ---
const popupFilePath = ref<string | null>(null);
const popupSessionId = ref<string | null>(null);
const popupFilename = ref<string>('');
const popupContent = ref<string>('');
const popupOriginalContent = ref<string>('');
const popupLanguage = ref<string>('plaintext');
const popupIsLoading = ref<boolean>(false);
const popupLoadingError = ref<string | null>(null);
const popupIsSaving = ref<boolean>(false);
const popupSaveStatus = ref<SaveStatus>('idle');
const popupSaveError = ref<string | null>(null);
const popupIsModified = computed(() => popupContent.value !== popupOriginalContent.value);

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
// 不再需要基于 activeTab 的计算属性

// --- 事件处理 ---
// 保存弹窗中的文件
const handlePopupSave = async () => {
    if (!popupFilePath.value || !popupSessionId.value || popupIsSaving.value || popupIsLoading.value) {
        console.warn('[FileEditorOverlay] 保存条件不满足，无法保存。');
        return;
    }

    const session = sessionStore.sessions.get(popupSessionId.value);
    if (!session || !session.wsManager.isConnected.value || !session.wsManager.isSftpReady.value) {
        console.error(`[FileEditorOverlay] 保存失败：会话 ${popupSessionId.value} 无效或未连接/SFTP 未就绪。`);
        popupSaveStatus.value = 'error';
        popupSaveError.value = t('fileManager.errors.sessionInvalidOrNotReady');
        setTimeout(() => { popupSaveStatus.value = 'idle'; popupSaveError.value = null; }, 5000);
        return;
    }

    const sftpManager = session.sftpManager;
    const contentToSave = popupContent.value;

    console.log(`[FileEditorOverlay] 开始保存文件: ${popupFilePath.value}`);
    popupIsSaving.value = true;
    popupSaveStatus.value = 'saving';
    popupSaveError.value = null;

    try {
        await sftpManager.writeFile(popupFilePath.value, contentToSave);
        console.log(`[FileEditorOverlay] 文件 ${popupFilePath.value} 保存成功。`);
        popupIsSaving.value = false;
        popupSaveStatus.value = 'success';
        popupSaveError.value = null;
        popupOriginalContent.value = contentToSave; // 更新原始内容
        // popupIsModified 会自动变为 false

        setTimeout(() => { if (popupSaveStatus.value === 'success') popupSaveStatus.value = 'idle'; }, 2000);

    } catch (err: any) {
        console.error(`[FileEditorOverlay] 保存文件 ${popupFilePath.value} 失败:`, err);
        popupIsSaving.value = false;
        popupSaveStatus.value = 'error';
        popupSaveError.value = `${t('fileManager.errors.saveFailed')}: ${err.message || err}`;
        setTimeout(() => { if (popupSaveStatus.value === 'error') popupSaveStatus.value = 'idle'; popupSaveError.value = null; }, 5000);
    }
};

// 关闭弹窗并重置状态
const handleCloseContainer = () => {
    if (popupIsModified.value) {
        if (!confirm(`文件 ${popupFilename.value} 已修改但未保存。确定要关闭吗？`)) {
            return; // 用户取消关闭
        }
    }
    isVisible.value = false;
    // 重置本地状态
    popupFilePath.value = null;
    popupSessionId.value = null;
    popupFilename.value = '';
    popupContent.value = '';
    popupOriginalContent.value = '';
    popupLanguage.value = 'plaintext';
    popupIsLoading.value = false;
    popupLoadingError.value = null;
    popupIsSaving.value = false;
    popupSaveStatus.value = 'idle';
    popupSaveError.value = null;
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

// 监听 popupTrigger 的变化来加载文件并显示弹窗
watch(popupTrigger, async () => {
    if (!showPopupFileEditorBoolean.value || !popupFileInfo.value) {
        console.log('[FileEditorOverlay] Popup trigger changed, but overlay is disabled or file info is missing.');
        isVisible.value = false; // 确保在不应显示时隐藏
        return;
    }

    const { filePath, sessionId } = popupFileInfo.value;
    console.log(`[FileEditorOverlay] Triggered for file: ${filePath}, session: ${sessionId}`);

    // 设置状态并显示弹窗
    popupFilePath.value = filePath;
    popupSessionId.value = sessionId;
    popupFilename.value = getFilenameFromPath(filePath);
    popupLanguage.value = getLanguageFromFilename(filePath);
    popupIsLoading.value = true;
    popupLoadingError.value = null;
    popupContent.value = ''; // 清空旧内容
    popupOriginalContent.value = '';
    popupIsSaving.value = false;
    popupSaveStatus.value = 'idle';
    popupSaveError.value = null;
    isVisible.value = true; // 显示弹窗

    // 获取 SFTP 管理器并加载文件
    const session = sessionStore.sessions.get(sessionId);
    if (!session || !session.sftpManager) {
        console.error(`[FileEditorOverlay] Cannot find SFTP manager for session ${sessionId}`);
        popupLoadingError.value = t('fileManager.errors.sftpManagerNotFound');
        popupIsLoading.value = false;
        return;
    }
    const sftpManager = session.sftpManager;

    try {
        const fileData = await sftpManager.readFile(filePath);
        console.log(`[FileEditorOverlay] File ${filePath} read successfully. Encoding: ${fileData.encoding}`);

        let decodedContent = '';
        if (fileData.encoding === 'base64') {
            try {
                const binaryString = atob(fileData.content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
                const decoder = new TextDecoder('utf-8');
                decodedContent = decoder.decode(bytes);
            } catch (decodeError) {
                console.error(`[FileEditorOverlay] Base64/UTF-8 decode error for ${filePath}:`, decodeError);
                popupLoadingError.value = t('fileManager.errors.fileDecodeError');
                decodedContent = `// ${popupLoadingError.value}\n// Original Base64:\n${fileData.content}`;
            }
        } else {
            decodedContent = fileData.content;
            if (decodedContent.includes('\uFFFD')) {
                 console.warn(`[FileEditorOverlay] File ${filePath} might not be UTF-8.`);
            }
        }
        popupContent.value = decodedContent;
        popupOriginalContent.value = decodedContent;
    } catch (err: any) {
        console.error(`[FileEditorOverlay] Failed to read file ${filePath}:`, err);
        popupLoadingError.value = `${t('fileManager.errors.readFileFailed')}: ${err.message || err}`;
        popupContent.value = `// ${popupLoadingError.value}`;
    } finally {
        popupIsLoading.value = false;
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

      <!-- 移除标签栏 -->

      <!-- 编辑器头部 -->
      <div class="editor-header">
        <span>
          {{ t('fileManager.editingFile') }}: {{ popupFilename }}
          <span v-if="popupIsModified" class="modified-indicator">*</span>
        </span>
        <div class="editor-actions">
          <span v-if="popupSaveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
          <span v-if="popupSaveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
          <span v-if="popupSaveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ popupSaveError }}</span>
          <button @click="handlePopupSave" :disabled="popupIsSaving || popupIsLoading || !!popupLoadingError || !popupFilePath" class="save-btn">
            {{ popupIsSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
          </button>
          <button @click="handleCloseContainer" class="close-editor-btn" :title="t('fileManager.actions.closeEditor')">✖</button>
        </div>
      </div>

      <!-- 编辑器内容区域 -->
      <div class="editor-content-area">
        <div v-if="popupIsLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
        <div v-else-if="popupLoadingError" class="editor-error">{{ popupLoadingError }}</div>
        <MonacoEditor
          v-else-if="popupFilePath"
          :key="popupFilePath"
          v-model="popupContent"
          :language="popupLanguage"
          theme="vs-dark"
          class="editor-instance"
          @request-save="handlePopupSave"
        />
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
