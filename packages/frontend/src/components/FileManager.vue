<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, watchEffect } from 'vue'; // Import watchEffect
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
// 移除 MonacoEditor 直接导入，因为它现在在 FileEditorOverlay 中
// import MonacoEditor from './MonacoEditor.vue';
import { useSftpActions } from '../composables/useSftpActions';
import { useFileUploader } from '../composables/useFileUploader';
import { useFileEditor } from '../composables/useFileEditor';
import { useWebSocketConnection } from '../composables/useWebSocketConnection'; // 导入 WebSocket composable
// 导入新拆分的 UI 组件
import FileUploadPopup from './FileUploadPopup.vue';
import FileEditorOverlay from './FileEditorOverlay.vue';
// 从类型文件导入所需类型
import type { FileListItem, FileAttributes } from '../types/sftp.types';
import type { UploadItem } from '../types/upload.types';
import type { WebSocketMessage } from '../types/websocket.types'; // 导入 WebSocketMessage


// --- 接口定义 (已移至类型文件) ---

// --- Props ---
const props = defineProps<{
  // ws: WebSocket | null; // 移除 ws prop
  isConnected: boolean; // 保留 isConnected prop，用于禁用操作
}>();

// --- 核心 Composables ---
const { t } = useI18n();
const route = useRoute();
// 导入 sendMessage 和 onMessage 用于 realpath 请求
const { isSftpReady, sendMessage, onMessage } = useWebSocketConnection();
const currentPath = ref<string>('.'); // 当前路径状态保留在组件中，传递给 composables

// SFTP 操作模块
const {
    fileList, // 从 composable 获取文件列表
    isLoading, // 从 composable 获取加载状态
    error,     // 从 composable 获取错误状态
    loadDirectory,
    createDirectory,
    createFile,
    deleteItems,
    renameItem,
    changePermissions,
    readFile, // 暴露给 useFileEditor
    writeFile, // 暴露给 useFileEditor
    joinPath, // 从 composable 获取 joinPath
    clearSftpError, // 导入清除错误的函数
} = useSftpActions(currentPath); // 传入 currentPath ref

// 文件上传模块
const {
    uploads, // 从 composable 获取上传列表
    startFileUpload,
    cancelUpload,
} = useFileUploader(currentPath, fileList, () => loadDirectory(currentPath.value)); // 传入依赖

// 文件编辑器模块
const {
    isEditorVisible,
    editingFilePath,
    editingFileLanguage,
    isEditorLoading,
    editorError,
    isSaving,
    saveStatus,
    saveError,
    editingFileContent, // v-model 绑定
    openFile,
    saveFile,
    closeEditor,
} = useFileEditor(readFile, writeFile); // 传入依赖

// --- UI 状态 Refs ---
const fileInputRef = ref<HTMLInputElement | null>(null); // 用于触发文件选择
const selectedItems = ref(new Set<string>()); // 文件选择状态
const lastClickedIndex = ref(-1); // 用于 Shift 多选
const contextMenuVisible = ref(false); // 右键菜单可见性
const contextMenuPosition = ref({ x: 0, y: 0 }); // 右键菜单位置
const contextMenuItems = ref<Array<{ label: string; action: () => void; disabled?: boolean }>>([]); // 右键菜单项
const contextTargetItem = ref<FileListItem | null>(null); // 右键菜单目标项
const isDraggingOver = ref(false); // 拖拽覆盖状态
const sortKey = ref<keyof FileListItem | 'type' | 'size' | 'mtime'>('filename'); // 排序字段
const sortDirection = ref<'asc' | 'desc'>('asc'); // 排序方向
const initialLoadDone = ref(false); // Track if the initial load has been triggered
const isFetchingInitialPath = ref(false); // Track if fetching realpath
const isEditingPath = ref(false); // State for path editing mode
const pathInputRef = ref<HTMLInputElement | null>(null); // Ref for the path input element
const editablePath = ref(''); // Temp storage for the path being edited

// --- Column Resizing State ---
const tableRef = ref<HTMLTableElement | null>(null);
const colWidths = ref({ // Initial widths (adjust as needed)
  type: 50,
  name: 300,
  size: 100,
  permissions: 120,
  modified: 180,
});
const isResizing = ref(false);
const resizingColumnIndex = ref(-1);
const startX = ref(0);
const startWidth = ref(0);

// --- Editor State (已移至 useFileEditor) ---
// const isEditorVisible = ref(false);
// ... 其他编辑器状态 ...

// --- 辅助函数 (部分移至 composables) ---
// generateRequestId 已移至 composables 内部使用
// joinPath 从 useSftpActions 获取
// sortFiles 已移至 useSftpActions 内部使用
// Helper function (Copied from useSftpActions) - needed for realpath request
const generateRequestId = (): string => {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};


// 保留 UI 格式化函数
const formatSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatMode = (mode: number): string => {
  const perm = mode & 0o777; let str = '';
  str += (perm & 0o400) ? 'r' : '-'; str += (perm & 0o200) ? 'w' : '-'; str += (perm & 0o100) ? 'x' : '-';
  str += (perm & 0o040) ? 'r' : '-'; str += (perm & 0o020) ? 'w' : '-'; str += (perm & 0o010) ? 'x' : '-';
  str += (perm & 0o004) ? 'r' : '-'; str += (perm & 0o002) ? 'w' : '-'; str += (perm & 0o001) ? 'x' : '-';
    return str;
};

// --- 编辑器辅助函数 (已移至 useFileEditor) ---
// getLanguageFromFilename 已移至 useFileEditor
// closeEditor 由 useFileEditor 提供
// handleSaveFile 由 useFileEditor 提供


// --- 上下文菜单逻辑 (部分操作现在调用 composable 方法) ---
const showContextMenu = (event: MouseEvent, item?: FileListItem) => {
  event.preventDefault();
  const targetItem = item || null;

  // Adjust selection based on right-click target
  if (targetItem && !event.ctrlKey && !event.metaKey && !event.shiftKey && !selectedItems.value.has(targetItem.filename)) {
      selectedItems.value.clear();
      selectedItems.value.add(targetItem.filename);
      lastClickedIndex.value = fileList.value.findIndex(f => f.filename === targetItem.filename);
  } else if (!targetItem) {
      selectedItems.value.clear();
      lastClickedIndex.value = -1;
  }

  contextTargetItem.value = targetItem;
  let menu: Array<{ label: string; action: () => void; disabled?: boolean }> = [];
  const selectionSize = selectedItems.value.size;
  const clickedItemIsSelected = targetItem && selectedItems.value.has(targetItem.filename);

  // 构建上下文菜单项
  if (selectionSize > 1 && clickedItemIsSelected) {
      // 多选时的菜单
      menu = [
          { label: t('fileManager.actions.deleteMultiple', { count: selectionSize }), action: handleDeleteSelectedClick }, // 修改为调用新的处理函数
          { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) }, // 调用 useSftpActions 的方法
      ];
  } else if (targetItem && targetItem.filename !== '..') {
      // 单个项目（非 '..'）的菜单
      menu = [
          { label: t('fileManager.actions.newFolder'), action: handleNewFolderContextMenuClick }, // 修改为调用新的处理函数
          { label: t('fileManager.actions.newFile'), action: handleNewFileContextMenuClick }, // 修改为调用新的处理函数
          { label: t('fileManager.actions.upload'), action: triggerFileUpload }, // 调用组件内的方法触发 input
          { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) }, // 调用 useSftpActions 的方法
      ];
        if (targetItem.attrs.isFile) {
            // 如果是文件，添加下载选项
            menu.splice(1, 0, { label: t('fileManager.actions.download', { name: targetItem.filename }), action: () => triggerDownload(targetItem) });
        }
       // 添加删除选项
       menu.push({ label: t('fileManager.actions.delete'), action: handleDeleteSelectedClick }); // 修改为调用新的处理函数
       // 添加重命名选项
       menu.push({ label: t('fileManager.actions.rename'), action: () => handleRenameContextMenuClick(targetItem) }); // 调用新的处理函数
       // 添加修改权限选项
       menu.push({ label: t('fileManager.actions.changePermissions'), action: () => handleChangePermissionsContextMenuClick(targetItem) }); // 调用新的处理函数

  } else if (!targetItem) {
      // 在空白处右键的菜单
      menu = [
          { label: t('fileManager.actions.newFolder'), action: handleNewFolderContextMenuClick }, // 修改为调用新的处理函数
          { label: t('fileManager.actions.newFile'), action: handleNewFileContextMenuClick }, // 修改为调用新的处理函数
          { label: t('fileManager.actions.upload'), action: triggerFileUpload }, // 调用组件内的方法触发 input
          { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) }, // 调用 useSftpActions 的方法
      ];
  } else { // 点击 '..' 时的菜单
        menu = [ { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) } ]; // 调用 useSftpActions 的方法
   }

   contextMenuItems.value = menu;

   // Calculate initial position
   let posX = event.clientX;
   let posY = event.clientY;

   // Estimate menu dimensions (adjust if necessary based on actual menu size)
   const estimatedMenuWidth = 180;
   const estimatedMenuHeight = 200; // Adjust based on max items

   // Adjust position if menu would go off-screen
   if (posX + estimatedMenuWidth > window.innerWidth) {
       posX = window.innerWidth - estimatedMenuWidth - 5; // Adjust and add small padding
   }
   if (posY + estimatedMenuHeight > window.innerHeight) {
       posY = window.innerHeight - estimatedMenuHeight - 5; // Adjust and add small padding
   }
    // Ensure position is not negative
   posX = Math.max(0, posX);
   posY = Math.max(0, posY);


   contextMenuPosition.value = { x: posX, y: posY };
   contextMenuVisible.value = true;

   // Add global listener to hide menu, using capture phase and once
  nextTick(() => {
      document.removeEventListener('click', hideContextMenu, { capture: true }); // Clean up just in case
      document.addEventListener('click', hideContextMenu, { capture: true, once: true });
  });
};

const hideContextMenu = () => {
  if (!contextMenuVisible.value) return; // Prevent unnecessary runs
  contextMenuVisible.value = false;
  contextMenuItems.value = [];
  contextTargetItem.value = null;
  // Explicitly remove listener just in case 'once' didn't fire or was removed prematurely
  document.removeEventListener('click', hideContextMenu, { capture: true });
};


// --- WebSocket 消息处理 (已移至 composables) ---
// watch(() => props.ws, ...) 已移除
// watch(() => props.isConnected, ...) 已移除 (部分逻辑移至 onMounted 和 isConnected watch)
// handleWebSocketMessage 已移除

// --- 目录加载与导航 ---
// loadDirectory 由 useSftpActions 提供

// --- 列表项点击与选择逻辑 ---
const handleItemClick = (event: MouseEvent, item: FileListItem) => {
    // Do not hide context menu here, let the global listener or menu item click handle it.

    const itemIndex = fileList.value.findIndex(f => f.filename === item.filename);
    if (itemIndex === -1 && item.filename !== '..') return;

    if (event.ctrlKey || event.metaKey) {
        if (item.filename === '..') return;
        if (selectedItems.value.has(item.filename)) selectedItems.value.delete(item.filename);
        else selectedItems.value.add(item.filename);
        lastClickedIndex.value = itemIndex;
    } else if (event.shiftKey && lastClickedIndex.value !== -1) {
        if (item.filename === '..') return;
        selectedItems.value.clear();
        const start = Math.min(lastClickedIndex.value, itemIndex);
        const end = Math.max(lastClickedIndex.value, itemIndex);
        for (let i = start; i <= end; i++) {
            if (fileList.value[i]) selectedItems.value.add(fileList.value[i].filename);
        }
    } else {
        selectedItems.value.clear();
        if (item.filename !== '..') {
             selectedItems.value.add(item.filename);
             lastClickedIndex.value = itemIndex;
        } else {
             lastClickedIndex.value = -1;
        }

        if (item.attrs.isDirectory) {
            // 检查是否已在加载，防止快速重复点击
            if (isLoading.value) {
                console.log('[文件管理器] 忽略目录点击，因为正在加载...');
                return;
            }
            // 处理目录点击：导航
            const newPath = item.filename === '..'
                ? currentPath.value.substring(0, currentPath.value.lastIndexOf('/')) || '/'
                : joinPath(currentPath.value, item.filename); // 使用 composable 的 joinPath
            loadDirectory(newPath); // 使用 composable 的 loadDirectory
        } else if (item.attrs.isFile) {
            // 处理文件点击：打开编辑器
            const filePath = joinPath(currentPath.value, item.filename); // 使用 composable 的 joinPath
            openFile(filePath); // 使用 useFileEditor 的 openFile
        }
    }
};

// --- 下载逻辑 ---

const triggerDownload = (item: FileListItem) => {
    const currentConnectionId = route.params.connectionId as string;
    if (!currentConnectionId) {
        // error.value = t('fileManager.errors.missingConnectionId'); // 错误状态由 useSftpActions 管理
        console.error("无法下载：缺少连接 ID"); // 或者显示一个临时的 alert
        alert(t('fileManager.errors.missingConnectionId'));
        return;
    }
    const downloadPath = joinPath(currentPath.value, item.filename); // 使用 composable 的 joinPath
    // TODO: 考虑将 API URL 基础部分提取到配置或环境变量中
    const downloadUrl = `/api/v1/sftp/download?connectionId=${currentConnectionId}&remotePath=${encodeURIComponent(downloadPath)}`;
    console.log(`[文件管理器] 触发下载: ${downloadUrl}`);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', item.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- 拖放上传逻辑 ---
const handleDragEnter = (event: DragEvent) => {
    // Check if files are being dragged
    if (event.dataTransfer?.types.includes('Files')) {
        isDraggingOver.value = true;
    }
};

const handleDragOver = (event: DragEvent) => {
    // Necessary to allow drop
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.types.includes('Files')) { // Added null check
        event.dataTransfer.dropEffect = 'copy'; // Show copy cursor
        isDraggingOver.value = true; // Ensure state is true
    } else if (event.dataTransfer) { // Added null check
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleDragLeave = (event: DragEvent) => {
    // Check if the leave event is going outside the container or onto a child element
    const target = event.relatedTarget as Node | null;
    const container = (event.currentTarget as HTMLElement);
    if (!target || !container.contains(target)) {
       isDraggingOver.value = false;
    }
};

const handleDrop = (event: DragEvent) => {
    isDraggingOver.value = false;
    if (!event.dataTransfer?.files || !props.isConnected) { // 使用 props.isConnected
        return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        console.log(`[文件管理器] 拖放了 ${files.length} 个文件。`);
        files.forEach(startFileUpload); // 调用 useFileUploader 的方法
    }
};

// --- 文件上传逻辑 (已移至 useFileUploader) ---
const triggerFileUpload = () => { fileInputRef.value?.click(); }; // 保留触发器
const handleFileSelected = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files || !props.isConnected) return; // 使用 props.isConnected
    Array.from(input.files).forEach(startFileUpload); // 调用 useFileUploader 的方法
    input.value = ''; // 清空 input 以允许再次选择相同文件
};
// startFileUpload 已移至 useFileUploader
// sendFileChunks 已移至 useFileUploader
// cancelUpload 由 useFileUploader 提供

// --- SFTP 操作处理函数 (现在调用 composable 方法) ---
const handleDeleteSelectedClick = () => {
    if (!props.isConnected || selectedItems.value.size === 0) return;
    // 从 composable 获取 fileList 来查找选中的项
    const itemsToDelete = Array.from(selectedItems.value)
                               .map(filename => fileList.value.find(f => f.filename === filename))
                               .filter((item): item is FileListItem => item !== undefined);
    if (itemsToDelete.length === 0) return;

    const names = itemsToDelete.map(i => i.filename).join(', ');
    const confirmMsg = itemsToDelete.length > 1
        ? t('fileManager.prompts.confirmDeleteMultiple', { count: itemsToDelete.length, names: names })
        : itemsToDelete[0].attrs.isDirectory
            ? t('fileManager.prompts.confirmDeleteFolder', { name: itemsToDelete[0].filename })
            : t('fileManager.prompts.confirmDeleteFile', { name: itemsToDelete[0].filename });

    if (confirm(confirmMsg)) {
        deleteItems(itemsToDelete); // 调用 useSftpActions 的方法
        selectedItems.value.clear(); // 清空选择
    }
};

const handleRenameContextMenuClick = (item: FileListItem) => {
    if (!props.isConnected || !item) return;
    const newName = prompt(t('fileManager.prompts.enterNewName', { oldName: item.filename }), item.filename);
    if (newName && newName !== item.filename) {
        renameItem(item, newName); // 调用 useSftpActions 的方法
    }
};

const handleChangePermissionsContextMenuClick = (item: FileListItem) => {
    if (!props.isConnected || !item) return;
    const currentModeOctal = (item.attrs.mode & 0o777).toString(8).padStart(3, '0');
    const newModeStr = prompt(t('fileManager.prompts.enterNewPermissions', { name: item.filename, currentMode: currentModeOctal }), currentModeOctal);
    if (newModeStr) {
        if (!/^[0-7]{3,4}$/.test(newModeStr)) {
            alert(t('fileManager.errors.invalidPermissionsFormat'));
            return;
        }
        const newMode = parseInt(newModeStr, 8);
        changePermissions(item, newMode); // 调用 useSftpActions 的方法
    }
};

const handleNewFolderContextMenuClick = () => {
    if (!props.isConnected) return;
    const folderName = prompt(t('fileManager.prompts.enterFolderName'));
    if (folderName) {
        // 可以在这里添加客户端的文件名验证（例如，是否已存在）
        if (fileList.value.some(item => item.filename === folderName)) {
             alert(t('fileManager.errors.folderExists', { name: folderName })); // 假设有这个翻译
             return;
        }
        createDirectory(folderName); // 调用 useSftpActions 的方法
    }
};

const handleNewFileContextMenuClick = () => {
    if (!props.isConnected) return;
    const fileName = prompt(t('fileManager.prompts.enterFileName'));
    if (fileName) {
        // 可以在这里添加客户端的文件名验证
        if (fileList.value.some(item => item.filename === fileName)) {
            alert(t('fileManager.errors.fileExists', { name: fileName }));
            return;
        }
        createFile(fileName); // 调用 useSftpActions 的方法
    }
};


// --- 排序逻辑 (现在作用于从 composable 获取的 fileList) ---
const sortedFileList = computed(() => {
    const list = [...fileList.value]; // Create a shallow copy to avoid mutating original
    const key = sortKey.value;
    const direction = sortDirection.value === 'asc' ? 1 : -1;

    list.sort((a, b) => {
        // Always keep directories first when sorting by anything other than type
        if (key !== 'type') {
            if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
            if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
        }

        let valA: string | number | boolean;
        let valB: string | number | boolean;

        switch (key) {
            case 'type':
                // Sort by type: Directory > Symlink > File
                valA = a.attrs.isDirectory ? 0 : (a.attrs.isSymbolicLink ? 1 : 2);
                valB = b.attrs.isDirectory ? 0 : (b.attrs.isSymbolicLink ? 1 : 2);
                break;
            case 'filename':
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
                break;
            case 'size':
                valA = a.attrs.isFile ? a.attrs.size : -1; // Treat dirs as -1 size for sorting
                valB = b.attrs.isFile ? b.attrs.size : -1;
                break;
            case 'mtime':
                valA = a.attrs.mtime;
                valB = b.attrs.mtime;
                break;
            default: // Should not happen with defined keys, but fallback to filename
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
        }

        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;

        // Secondary sort by filename if primary values are equal
        if (key !== 'filename') {
            return a.filename.localeCompare(b.filename);
        }

        return 0;
    });
    // 返回排序后的列表副本
    return list;
});

// 处理表头点击排序
const handleSort = (key: keyof FileListItem | 'type' | 'size' | 'mtime') => {
    if (sortKey.value === key) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDirection.value = 'asc';
    }
};

// --- 生命周期钩子 ---
onMounted(() => {
    console.log('[文件管理器] 组件已挂载。');
    // 初始加载逻辑现在由 isConnected 的 watch 处理
    // if (props.isConnected) {
    //     console.log('[文件管理器] 挂载时连接已激活，加载初始目录。');
    //     loadDirectory(currentPath.value); // 调用 composable 的方法
    // }
});

// 使用 watchEffect 监听连接和 SFTP 就绪状态以触发初始加载
watchEffect((onCleanup) => {
    let unregisterSuccess: (() => void) | undefined;
    let unregisterError: (() => void) | undefined;
    let timeoutId: number | undefined; // Use number for browser timeout ID

    // 清理函数，用于注销监听器和清除超时
    const cleanupListeners = () => {
        unregisterSuccess?.();
        unregisterError?.();
        if (timeoutId) clearTimeout(timeoutId);
        // Only reset isFetchingInitialPath if it was set by this effect instance
        if (isFetchingInitialPath.value) {
             isFetchingInitialPath.value = false;
        }
    };

    // 注册清理回调
    onCleanup(cleanupListeners);

    // 条件判断：连接、SFTP就绪、不在加载、初始加载未完成、未在获取初始路径
    // Note: Removed fileList.value.length === 0 check to allow re-fetching if needed after disconnect/reconnect
    if (props.isConnected && isSftpReady.value && !isLoading.value && !initialLoadDone.value && !isFetchingInitialPath.value) {
        console.log('[文件管理器] 连接已建立，SFTP 已就绪，触发初始路径获取。');
        isFetchingInitialPath.value = true; // 标记正在获取初始路径

        const requestId = generateRequestId();
        const requestedPath = '.'; // Always request the real path for '.'

        // 设置成功回调
        unregisterSuccess = onMessage('sftp:realpath:success', (payload, message: WebSocketMessage) => {
            if (message.requestId === requestId && payload.requestedPath === requestedPath) {
                const absolutePath = payload.absolutePath;
                console.log(`[文件管理器] 收到 "." 的绝对路径: ${absolutePath}，开始加载目录。`);
                currentPath.value = absolutePath; // 更新当前路径
                loadDirectory(absolutePath); // 加载实际路径
                initialLoadDone.value = true; // 标记初始加载完成
                cleanupListeners(); // 清理监听器和超时
            }
        });

        // 设置错误回调
        unregisterError = onMessage('sftp:realpath:error', (payload, message: WebSocketMessage) => {
            // Check if the error corresponds to *this* specific realpath request
            if (message.requestId === requestId && message.path === requestedPath) {
                console.error(`[文件管理器] 获取初始路径 "." 失败:`, payload);
                // Display error via console or a dedicated UI element, cannot assign to readonly 'error'
                console.error(t('fileManager.errors.getInitialPathFailed', { message: payload?.message || payload || 'Unknown error' }));
                // Do NOT set initialLoadDone = true, allowing retry if conditions change
                // Do NOT call loadDirectory('.') as it might loop on error
                cleanupListeners(); // Clean up listeners and timeout
            }
        });

        // 发送 realpath 请求
        console.log(`[文件管理器] 发送 sftp:realpath 请求 (ID: ${requestId}) for path: ${requestedPath}`);
        sendMessage({ type: 'sftp:realpath', requestId: requestId, payload: { path: requestedPath } });

        // 设置超时
        timeoutId = setTimeout(() => {
            console.error(`[文件管理器] 获取初始路径 "." 超时 (ID: ${requestId})。`);
            // Display error via console or a dedicated UI element
            console.error(t('fileManager.errors.getInitialPathTimeout'));
            cleanupListeners(); // 清理监听器
        }, 10000); // 10 秒超时

    } else if (!props.isConnected) {
        // 连接断开时的清理
        console.log('[文件管理器] 连接已断开 (watchEffect)，重置 initialLoadDone 和 isFetchingInitialPath。');
        selectedItems.value.clear();
        lastClickedIndex.value = -1;
        initialLoadDone.value = false; // 重置初始加载状态，允许下次连接时重新获取
        isFetchingInitialPath.value = false; // 重置获取状态
        cleanupListeners(); // 确保断开连接时清理监听器和超时
    }
});


onBeforeUnmount(() => {
    console.log('[文件管理器] 组件将卸载。');
    // WebSocket 监听器和上传任务的清理由各自的 composable 处理
    // 确保上下文菜单监听器被移除
    document.removeEventListener('click', hideContextMenu, { capture: true });
});

// --- 列宽调整逻辑 (保持不变) ---
const getColumnKeyByIndex = (index: number): keyof typeof colWidths.value | null => {
    const keys = Object.keys(colWidths.value) as Array<keyof typeof colWidths.value>;
    return keys[index] ?? null;
};

const startResize = (event: MouseEvent, index: number) => {
  event.stopPropagation(); // Stop the event from bubbling up to the th's click handler
  event.preventDefault(); // Prevent text selection during drag
  isResizing.value = true;
  resizingColumnIndex.value = index;
  startX.value = event.clientX;
  const colKey = getColumnKeyByIndex(index);
  if (colKey) {
      startWidth.value = colWidths.value[colKey];
  } else {
      // Fallback or error handling if index is out of bounds
      const thElement = (event.target as HTMLElement).closest('th');
      startWidth.value = thElement?.offsetWidth ?? 100; // Estimate if key not found
  }


  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize'; // Change cursor globally
  document.body.style.userSelect = 'none'; // Prevent text selection globally
};

const handleResize = (event: MouseEvent) => {
  if (!isResizing.value || resizingColumnIndex.value < 0) return;

  const currentX = event.clientX;
  const diffX = currentX - startX.value;
  const newWidth = Math.max(30, startWidth.value + diffX); // Minimum width 30px

  const colKey = getColumnKeyByIndex(resizingColumnIndex.value);
   if (colKey) {
       colWidths.value[colKey] = newWidth;
   }
   // Note: Direct manipulation of <col> width via style might be needed
   // if reactive updates to :style don't work reliably with table-layout:fixed.
   // Let's try with reactive refs first.
};

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false;
    resizingColumnIndex.value = -1;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = ''; // Reset cursor
  document.body.style.userSelect = ''; // Reset text selection
  }
};

// --- Path Editing Logic ---
const startPathEdit = () => {
    if (isLoading.value || !props.isConnected) return; // Don't allow edit while loading or disconnected
    editablePath.value = currentPath.value; // Initialize input with current path
    isEditingPath.value = true;
    nextTick(() => {
        pathInputRef.value?.focus(); // Focus the input after it becomes visible
        pathInputRef.value?.select(); // Select the text
    });
};

const handlePathInput = async (event?: Event) => {
    // Check if triggered by blur or Enter key
    if (event && event instanceof KeyboardEvent && event.key !== 'Enter') {
        return; // Ignore other key presses
    }

    const newPath = editablePath.value.trim();
    isEditingPath.value = false; // Exit editing mode immediately

    if (newPath === currentPath.value || !newPath) {
        return; // No change or empty path, do nothing
    }

    console.log(`[文件管理器] 尝试导航到新路径: ${newPath}`);
    // Call loadDirectory which handles path validation via backend
    await loadDirectory(newPath);

    // If loadDirectory resulted in an error (handled within useSftpActions),
    // the currentPath will not have changed, effectively reverting the UI.
    // If successful, currentPath is updated by loadDirectory, and the UI reflects the new path.
};

const cancelPathEdit = () => {
    isEditingPath.value = false;
    // No need to reset editablePath, it will be set on next edit start
};

// Function to clear the error message - now calls the composable's function
const clearError = () => {
    clearSftpError();
};


</script>

<template>
  <div class="file-manager">
    <div class="toolbar">
        <div class="path-bar">
          <span v-show="!isEditingPath"> 
            {{ t('fileManager.currentPath') }}: <strong @click="startPathEdit" :title="t('fileManager.editPathTooltip')" class="editable-path">{{ currentPath }}</strong>
          </span>
          <input
            v-show="isEditingPath" 
            ref="pathInputRef"
            type="text"
            v-model="editablePath"
            class="path-input"
            @keyup.enter="handlePathInput"
            @blur="handlePathInput"
            @keyup.esc="cancelPathEdit"
            
          />
          <button @click.stop="loadDirectory(currentPath)" :disabled="isLoading || !isConnected || isEditingPath" :title="t('fileManager.actions.refresh')">🔄</button>
          <!-- Pass event to handleItemClick for '..' -->
          <button @click.stop="handleItemClick($event, { filename: '..', longname: '', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })" :disabled="isLoading || !isConnected || currentPath === '/' || isEditingPath" :title="t('fileManager.actions.parentDirectory')">⬆️</button>
        </div>
        <div class="actions-bar">
             <input type="file" ref="fileInputRef" @change="handleFileSelected" multiple style="display: none;" />
             <button @click="triggerFileUpload" :disabled="isLoading || !props.isConnected" :title="t('fileManager.actions.uploadFile')">📤 {{ t('fileManager.actions.upload') }}</button>
             <button @click="handleNewFolderContextMenuClick" :disabled="isLoading || !props.isConnected" :title="t('fileManager.actions.newFolder')">➕ {{ t('fileManager.actions.newFolder') }}</button> <!-- 调用修改后的函数 -->
             <button @click="handleNewFileContextMenuClick" :disabled="isLoading || !props.isConnected" :title="t('fileManager.actions.newFile')">📄 {{ t('fileManager.actions.newFile') }}</button> <!-- 调用修改后的函数 -->
        </div>
    </div>

    <!-- File List Container -->
    <div
      class="file-list-container"
      :class="{ 'drag-over': isDraggingOver }"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
        <!-- Error Alert Box -->
        <div v-if="error" class="error-alert">
            <span>{{ error }}</span>
            <button @click="clearError" class="close-error-btn" :title="t('common.dismiss')">&times;</button> <!-- Use clearSftpError -->
        </div>

        <!-- 1. Initial Loading Indicator -->
        <div v-if="isLoading && !initialLoadDone" class="loading">{{ t('fileManager.loading') }}</div>

        <!-- 2. File Table (Show if not initial loading) -->
        <!-- Removed the error condition here, table shows regardless of error -->
        <table v-else-if="sortedFileList.length > 0 || currentPath !== '/'" ref="tableRef" class="resizable-table" @contextmenu.prevent>
           <colgroup>
                <col :style="{ width: `${colWidths.type}px` }">
                <col :style="{ width: `${colWidths.name}px` }">
                <col :style="{ width: `${colWidths.size}px` }">
                <col :style="{ width: `${colWidths.permissions}px` }">
                <col :style="{ width: `${colWidths.modified}px` }">
           </colgroup>
          <thead>
            <tr>
              <!-- Remove width style from th, controlled by colgroup -->
              <th @click="handleSort('type')" class="sortable">
                {{ t('fileManager.headers.type') }}
                <span v-if="sortKey === 'type'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="resizer" @mousedown.prevent="startResize($event, 0)" @click.stop></span>
              </th>
              <th @click="handleSort('filename')" class="sortable">
                {{ t('fileManager.headers.name') }}
                <span v-if="sortKey === 'filename'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="resizer" @mousedown.prevent="startResize($event, 1)" @click.stop></span>
              </th>
              <th @click="handleSort('size')" class="sortable">
                {{ t('fileManager.headers.size') }}
                <span v-if="sortKey === 'size'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="resizer" @mousedown.prevent="startResize($event, 2)" @click.stop></span>
              </th>
              <th>
                {{ t('fileManager.headers.permissions') }}
                <span class="resizer" @mousedown.prevent="startResize($event, 3)" @click.stop></span>
              </th>
              <th @click="handleSort('mtime')" class="sortable">
                {{ t('fileManager.headers.modified') }}
                <span v-if="sortKey === 'mtime'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
              </th>
            </tr>
          </thead>
          <tbody @contextmenu.prevent="showContextMenu($event)">
            <!-- '..' 条目 -->
            <tr v-if="currentPath !== '/'"
                class="clickable"
                @click="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @contextmenu.prevent.stop="showContextMenu($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })" >
              <td>📁</td>
              <td>..</td>
              <td></td><td></td><td></td>
            </tr>
            <tr v-for="(item, index) in sortedFileList"
                :key="item.filename"
                @click="handleItemClick($event, item)"
                :class="{ clickable: item.attrs.isDirectory || item.attrs.isFile, selected: selectedItems.has(item.filename) }"
                @contextmenu.prevent.stop="showContextMenu($event, item)">
              <td>{{ item.attrs.isDirectory ? '📁' : (item.attrs.isSymbolicLink ? '🔗' : '📄') }}</td>
              <td>{{ item.filename }}</td>
              <td>{{ item.attrs.isFile ? formatSize(item.attrs.size) : '' }}</td>
              <td>{{ formatMode(item.attrs.mode) }}</td>
              <td>{{ new Date(item.attrs.mtime).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>

        <!-- 4. Empty Directory Message (Show if not initial loading, no error, list is empty, and at root) -->
         <!-- 3. Empty Directory Message (Show only if not loading AND list is empty AND not at root) -->
         <div v-else-if="!isLoading && sortedFileList.length === 0 && currentPath === '/'" class="no-files">{{ t('fileManager.emptyDirectory') }}</div>
         <!-- Note: If there's an error, the table will still render (potentially empty if initial load failed),
              but the error message will be shown above. The "Empty Directory" message
              is now only shown if explicitly empty and not loading. -->
     </div>

     <!-- 使用 FileUploadPopup 组件 -->
     <FileUploadPopup :uploads="uploads" @cancel-upload="cancelUpload" />

    <div v-if="contextMenuVisible"
         class="context-menu"
         :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
         @click.stop>
      <ul>
        <li v-for="(menuItem, index) in contextMenuItems"
            :key="index"
            @click.stop="menuItem.action(); hideContextMenu()"
            :class="{ disabled: menuItem.disabled }">
          {{ menuItem.label }}
        </li>
      </ul>
    </div>

    <!-- 使用 FileEditorOverlay 组件 -->
    <FileEditorOverlay
      :is-visible="isEditorVisible"
      :file-path="editingFilePath"
      :language="editingFileLanguage"
      :is-loading="isEditorLoading"
      :loading-error="editorError"
      :is-saving="isSaving"
      :save-status="saveStatus"
      :save-error="saveError"
      v-model="editingFileContent"
      @request-save="saveFile"
      @close="closeEditor"
    />

  </div>
</template>

<style scoped>
/* Styles remain the same, but add .selected style */
.file-manager { height: 100%; display: flex; flex-direction: column; font-family: sans-serif; font-size: 0.9rem; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background-color: #f0f0f0; border-bottom: 1px solid #ccc; flex-wrap: wrap; }
.path-bar { white-space: nowrap; overflow-x: auto; flex-grow: 1; margin-right: 1rem; padding: 0.2rem 0.4rem; border-radius: 3px; } /* Remove cursor:text and hover */
.path-bar strong.editable-path {
    font-weight: normal;
    background-color: #e0e0e0;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    margin-left: 0.3rem;
    cursor: text; /* Add cursor only to the clickable part */
}
.path-bar strong.editable-path:hover {
    background-color: #d0d0d0; /* Slightly darker hover for the path */
}
.path-input {
    font-family: inherit;
    font-size: inherit;
    border: 1px solid #ccc;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    width: calc(100% - 70px); /* Adjust width based on button sizes */
    box-sizing: border-box;
}
.path-bar button { margin-left: 0.5rem; background: none; border: none; cursor: pointer; font-size: 1.1em; padding: 0.1rem 0.3rem; vertical-align: middle; }
.path-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.actions-bar button { padding: 0.3rem 0.6rem; cursor: pointer; margin-left: 0.5rem; }
.actions-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.upload-popup { position: fixed; bottom: 1rem; right: 1rem; background-color: white; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); padding: 0.8rem; max-width: 300px; max-height: 200px; overflow-y: auto; z-index: 1001; }
.upload-popup h4 { margin: 0 0 0.5rem 0; font-size: 0.9em; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
.upload-popup ul { list-style: none; padding: 0; margin: 0; }
.upload-popup li { margin-bottom: 0.4rem; font-size: 0.85em; display: flex; align-items: center; flex-wrap: wrap; }
.upload-popup progress { margin: 0 0.5rem; width: 80px; height: 0.8em; }
.upload-popup .error { color: red; margin-left: 0.5rem; flex-basis: 100%; font-size: 0.8em; }
.upload-popup .cancel-btn { margin-left: auto; padding: 0.1rem 0.4rem; font-size: 0.8em; background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; cursor: pointer; }
.loading, .no-files { padding: 1rem; text-align: center; color: #666; }
/* Removed .error style for the main container */
.error-alert {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
    padding: 0.75rem 1.25rem;
    margin: 0.5rem;
    border-radius: 0.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.close-error-btn {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.2rem;
    font-weight: bold;
    cursor: pointer;
    padding: 0 0.5rem;
    line-height: 1;
}
.file-list-container { flex-grow: 1; overflow-y: auto; position: relative; /* Needed for overlay */ }
.file-list-container.drag-over {
  outline: 2px dashed #007bff; /* Blue dashed outline */
  outline-offset: -2px; /* Offset inside */
  background-color: rgba(0, 123, 255, 0.05); /* Light blue background tint */
}
.file-list-container.drag-over::before { /* Optional: Add text overlay */
    content: 'Drop files here to upload';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-size: 1.1em;
    pointer-events: none; /* Allow drop event to pass through */
    z-index: 2; /* Above table */
}
table.resizable-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* Crucial for resizing */
  overflow: hidden; /* Prevent resizer overflow */
}
thead { background-color: #f8f8f8; position: sticky; top: 0; z-index: 1; }
th, td {
    border: 1px solid #eee;
    padding: 0.4rem 0.6rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden; /* Hide overflow text */
    text-overflow: ellipsis; /* Show ellipsis for overflow */
}
th {
    position: relative; /* Needed for absolute positioning of resizer */
}
th.sortable { cursor: pointer; }
th.sortable:hover { background-color: #e9e9e9; }
/* Removed fixed width for first column, handled by colgroup */
td:first-child {
  text-align: center; /* Center the icon */
}
tbody tr:hover { background-color: #f5f5f5; }
tbody tr.clickable { cursor: pointer; user-select: none; /* Prevent text selection on click */ }
/* Removed .actions-cell style */
tbody tr.selected { background-color: #cce5ff; }
tbody tr.selected:hover { background-color: #b8daff; }
.context-menu { position: fixed; background-color: white; border: 1px solid #ccc; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); z-index: 1002; min-width: 150px; }
.context-menu ul { list-style: none; padding: 5px 0; margin: 0; }
.context-menu li { padding: 8px 12px; cursor: pointer; }
.context-menu li:hover { background-color: #eee; }
.context-menu li.disabled { color: #aaa; cursor: not-allowed; background-color: white; }

/* Resizer Handle Styles */
.resizer {
  position: absolute;
  top: 0;
  right: -3px; /* Position slightly outside the cell border */
  width: 6px; /* Hit area width */
  height: 100%;
  cursor: col-resize;
  z-index: 2; /* Above cell content */
  /* background-color: rgba(0, 0, 255, 0.1); */ /* Optional: Make handle visible for debugging */
}
.resizer:hover {
    background-color: rgba(0, 100, 255, 0.2); /* Visual feedback on hover */
}


/* Editor Styles */
.editor-overlay {
  position: absolute; /* Position over the file list */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(40, 40, 40, 0.95); /* Dark semi-transparent background */
  z-index: 1000; /* Ensure it's above the file list but below popups */
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
}
.editor-error {
    color: #ff8a8a;
}

.editor-actions {
    display: flex;
    align-items: center;
}

.save-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    margin-left: 1rem;
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
    margin-left: 1rem;
    font-size: 0.9em;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
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
  flex-grow: 1; /* Make editor take remaining space */
  min-height: 0; /* Important for flex-grow in flex column */
}

</style>
