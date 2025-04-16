<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watchEffect, type PropType, readonly } from 'vue'; // 恢复导入
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router'; // 保留用于生成下载 URL (如果下载逻辑移动则可移除)
// 导入 SFTP Actions 工厂函数和所需的类型
import { createSftpActionsManager, type WebSocketDependencies } from '../composables/useSftpActions'; // 恢复 WebSocketDependencies
import { useFileUploader } from '../composables/useFileUploader';
import { useFileEditor } from '../composables/useFileEditor';
// WebSocket composable 不再直接使用
import FileUploadPopup from './FileUploadPopup.vue';
import FileEditorOverlay from './FileEditorOverlay.vue';
// 从类型文件导入所需类型
import type { FileListItem } from '../types/sftp.types';
// 从 websocket 类型文件导入所需类型
import type { WebSocketMessage } from '../types/websocket.types'; // 导入 WebSocketMessage

// 定义 SftpManagerInstance 类型，基于 createSftpActionsManager 的返回类型
type SftpManagerInstance = ReturnType<typeof createSftpActionsManager>;


// --- Props ---
const props = defineProps({
  sessionId: {
    type: String,
    required: true,
  },
  // 注入此会话特定的 SFTP 管理器实例
  sftpManager: {
    type: Object as PropType<SftpManagerInstance>,
    required: true,
  },
  // 注入数据库连接 ID
  dbConnectionId: {
    type: String,
    required: true,
  },
  // 注入此组件及其子 composables 所需的 WebSocket 依赖项
  wsDeps: {
    type: Object as PropType<WebSocketDependencies>,
    required: true,
  },
});

// --- 核心 Composables ---
const { t } = useI18n();
const route = useRoute(); // Keep for download URL generation for now
// 移除本地 currentPath ref
// const currentPath = ref<string>('.');

// Access SFTP state and methods from the injected manager instance
const {
    fileList,
    isLoading,
    error,
    loadDirectory,
    createDirectory,
    createFile,
    deleteItems,
    renameItem,
    changePermissions,
    readFile, // Provided by the manager
    writeFile, // Provided by the manager
    joinPath,
    currentPath, // 从 sftpManager 获取 currentPath
    clearSftpError,
    cleanup: cleanupSftpHandlers, // Get the cleanup function from the manager
} = props.sftpManager; // 直接从 props 获取

// 文件上传模块 - Needs WebSocket dependencies and session context
const {
    uploads,
    startFileUpload,
    cancelUpload,
    // cleanup: cleanupUploader, // 假设 uploader 也提供 cleanup
} = useFileUploader(
    currentPath, // 使用从 sftpManager 获取的 currentPath
    fileList, // 传递来自 sftpManager 的 fileList ref
    () => loadDirectory(currentPath.value), // Refresh function uses manager's loadDirectory
    props.sessionId, // 传递 sessionId
    props.dbConnectionId // 传递 dbConnectionId
    // useFileUploader 内部创建自己的 ws 连接, 不需要 wsDeps
);

// 文件编辑器模块 - Needs file operations from sftpManager
const {
    isEditorVisible,
    editingFilePath,
    editingFileLanguage,
    isEditorLoading,
    editorError,
    isSaving,
    saveStatus,
    saveError,
    editingFileContent,
    openFile,
    saveFile,
    closeEditor,
    // cleanup: cleanupEditor, // 假设 editor 也提供 cleanup
} = useFileEditor(
    readFile, // 使用注入的 sftpManager 中的 readFile
    writeFile // Use writeFile from the injected sftpManager
);

// --- UI 状态 Refs (Remain mostly the same) ---
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedItems = ref(new Set<string>());
const lastClickedIndex = ref(-1);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuItems = ref<Array<{ label: string; action: () => void; disabled?: boolean }>>([]);
const contextTargetItem = ref<FileListItem | null>(null);
const isDraggingOver = ref(false);
const sortKey = ref<keyof FileListItem | 'type' | 'size' | 'mtime'>('filename');
const sortDirection = ref<'asc' | 'desc'>('asc');
const initialLoadDone = ref(false);
const isFetchingInitialPath = ref(false);
const isEditingPath = ref(false);
const pathInputRef = ref<HTMLInputElement | null>(null);
const editablePath = ref('');

// --- Column Resizing State (Remains the same) ---
const tableRef = ref<HTMLTableElement | null>(null);
const colWidths = ref({
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

// --- 辅助函数 ---
// 重新添加 generateRequestId，因为 watchEffect 中需要它
const generateRequestId = (): string => `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
// joinPath 由 props.sftpManager 提供
// sortFiles 在此组件内部用于排序显示

// UI 格式化函数保持不变
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

// --- 上下文菜单逻辑 ---
// Actions now call methods from props.sftpManager
const showContextMenu = (event: MouseEvent, item?: FileListItem) => {
    event.preventDefault();
    const targetItem = item || null;

    // Adjust selection based on right-click target
    if (targetItem && !event.ctrlKey && !event.metaKey && !event.shiftKey && !selectedItems.value.has(targetItem.filename)) {
        selectedItems.value.clear();
        selectedItems.value.add(targetItem.filename);
        // 使用 props.sftpManager 中的 fileList
        lastClickedIndex.value = fileList.value.findIndex((f: FileListItem) => f.filename === targetItem.filename); // 已添加类型
    } else if (!targetItem) {
        selectedItems.value.clear();
        lastClickedIndex.value = -1;
    }

    contextTargetItem.value = targetItem;
    let menu: Array<{ label: string; action: () => void; disabled?: boolean }> = [];
    const selectionSize = selectedItems.value.size;
    const clickedItemIsSelected = targetItem && selectedItems.value.has(targetItem.filename);
    const canPerformActions = props.wsDeps.isConnected.value && props.wsDeps.isSftpReady.value; // 恢复使用 props.wsDeps

    // Build context menu items
    if (selectionSize > 1 && clickedItemIsSelected) {
        // Multi-selection menu
        menu = [
            { label: t('fileManager.actions.deleteMultiple', { count: selectionSize }), action: handleDeleteSelectedClick, disabled: !canPerformActions },
            { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value), disabled: !canPerformActions },
        ];
    } else if (targetItem && targetItem.filename !== '..') {
        // Single item (not '..') menu
        menu = [
            { label: t('fileManager.actions.newFolder'), action: handleNewFolderContextMenuClick, disabled: !canPerformActions },
            { label: t('fileManager.actions.newFile'), action: handleNewFileContextMenuClick, disabled: !canPerformActions },
            { label: t('fileManager.actions.upload'), action: triggerFileUpload, disabled: !canPerformActions }, // Upload depends on connection
            { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value), disabled: !canPerformActions },
        ];
        if (targetItem.attrs.isFile) {
            menu.splice(1, 0, { label: t('fileManager.actions.download', { name: targetItem.filename }), action: () => triggerDownload(targetItem), disabled: !canPerformActions }); // Download depends on connection
        }
        menu.push({ label: t('fileManager.actions.delete'), action: handleDeleteSelectedClick, disabled: !canPerformActions });
        menu.push({ label: t('fileManager.actions.rename'), action: () => handleRenameContextMenuClick(targetItem), disabled: !canPerformActions });
        menu.push({ label: t('fileManager.actions.changePermissions'), action: () => handleChangePermissionsContextMenuClick(targetItem), disabled: !canPerformActions });

    } else if (!targetItem) {
        // Right-click on empty space menu
        menu = [
            { label: t('fileManager.actions.newFolder'), action: handleNewFolderContextMenuClick, disabled: !canPerformActions },
            { label: t('fileManager.actions.newFile'), action: handleNewFileContextMenuClick, disabled: !canPerformActions },
            { label: t('fileManager.actions.upload'), action: triggerFileUpload, disabled: !canPerformActions },
            { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value), disabled: !canPerformActions },
        ];
    } else { // Clicked on '..'
        menu = [{ label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value), disabled: !canPerformActions }];
    }

    contextMenuItems.value = menu;

    // Calculate initial position
    let posX = event.clientX;
    let posY = event.clientY;

    // Estimate menu dimensions
    const estimatedMenuWidth = 180;
    const estimatedMenuHeight = contextMenuItems.value.length * 35; // Estimate height based on items

    // Adjust position if menu would go off-screen
    if (posX + estimatedMenuWidth > window.innerWidth) {
        posX = window.innerWidth - estimatedMenuWidth - 5;
    }
    if (posY + estimatedMenuHeight > window.innerHeight) {
        posY = window.innerHeight - estimatedMenuHeight - 5;
    }
    posX = Math.max(0, posX);
    posY = Math.max(0, posY);

    contextMenuPosition.value = { x: posX, y: posY };
    contextMenuVisible.value = true;

    // Add global listener to hide menu
    nextTick(() => {
        document.removeEventListener('click', hideContextMenu, { capture: true });
        document.addEventListener('click', hideContextMenu, { capture: true, once: true });
    });
};

const hideContextMenu = () => {
    if (!contextMenuVisible.value) return;
    contextMenuVisible.value = false;
    contextMenuItems.value = [];
    contextTargetItem.value = null;
    document.removeEventListener('click', hideContextMenu, { capture: true });
};

// --- 目录加载与导航 ---
// loadDirectory is provided by props.sftpManager

// --- 列表项点击与选择逻辑 ---
// handleItemClick 中的 item 参数已有类型

// --- 列表项点击与选择逻辑 ---
const handleItemClick = (event: MouseEvent, item: FileListItem) => { // item 已有类型
    const itemIndex = fileList.value.findIndex((f: FileListItem) => f.filename === item.filename); // f 已有类型
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
            // Use fileList from props
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
            if (isLoading.value) { // Use isLoading from props
                console.log(`[FileManager ${props.sessionId}] Ignoring directory click, already loading...`);
                return;
            }
            const newPath = item.filename === '..'
                ? currentPath.value.substring(0, currentPath.value.lastIndexOf('/')) || '/' // 使用 sftpManager 的 currentPath
                : joinPath(currentPath.value, item.filename); // Use joinPath from props
            loadDirectory(newPath); // Use loadDirectory from props
        } else if (item.attrs.isFile) {
            const filePath = joinPath(currentPath.value, item.filename); // Use joinPath from props
            openFile(filePath); // Use openFile from useFileEditor
        }
    }
};

// --- 下载逻辑 ---
// triggerDownload 中的 item 参数已有类型

// --- 下载逻辑 ---
const triggerDownload = (item: FileListItem) => { // item 已有类型
    // 恢复使用 props.wsDeps.isConnected
    if (!props.wsDeps.isConnected.value) {
        alert(t('fileManager.errors.notConnected'));
        return;
    }
    // connectionId might need to be passed differently, maybe via sftpManager or wsDeps
    // For now, keep using route.params as a fallback, but this is not ideal for multi-session
    const currentConnectionId = route.params.connectionId as string; // TODO: Revisit this for multi-session
    if (!currentConnectionId) {
        console.error(`[FileManager ${props.sessionId}] Cannot download: Missing connection ID.`);
        alert(t('fileManager.errors.missingConnectionId'));
        return;
    }
    const downloadPath = joinPath(currentPath.value, item.filename); // Use joinPath from props
    const downloadUrl = `/api/v1/sftp/download?connectionId=${currentConnectionId}&remotePath=${encodeURIComponent(downloadPath)}`;
    console.log(`[FileManager ${props.sessionId}] Triggering download: ${downloadUrl}`);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', item.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- 拖放上传逻辑 ---
const handleDragEnter = (event: DragEvent) => {
    if (props.wsDeps.isConnected.value && event.dataTransfer?.types.includes('Files')) { // 恢复使用 props.wsDeps.isConnected
        isDraggingOver.value = true;
    }
};

const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (props.wsDeps.isConnected.value && event.dataTransfer?.types.includes('Files')) { // 恢复使用 props.wsDeps.isConnected
        event.dataTransfer.dropEffect = 'copy';
        isDraggingOver.value = true;
    } else if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleDragLeave = (event: DragEvent) => {
    const target = event.relatedTarget as Node | null;
    const container = (event.currentTarget as HTMLElement);
    if (!target || !container.contains(target)) {
       isDraggingOver.value = false;
    }
};

const handleDrop = (event: DragEvent) => {
    isDraggingOver.value = false;
    // 恢复使用 props.wsDeps.isConnected
    if (!event.dataTransfer?.files || !props.wsDeps.isConnected.value) {
        return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        console.log(`[FileManager ${props.sessionId}] Dropped ${files.length} files.`);
        files.forEach(startFileUpload); // Use startFileUpload from useFileUploader
    }
};

// --- 文件上传逻辑 ---
const triggerFileUpload = () => { fileInputRef.value?.click(); };
const handleFileSelected = (event: Event) => {
    const input = event.target as HTMLInputElement;
    // 恢复使用 props.wsDeps.isConnected
    if (!input.files || !props.wsDeps.isConnected.value) return;
    Array.from(input.files).forEach(startFileUpload); // Use startFileUpload from useFileUploader
    input.value = '';
};

// --- SFTP 操作处理函数 ---
// 恢复使用 props.wsDeps.isConnected 和 props.sftpManager 的方法
const handleDeleteSelectedClick = () => {
    if (!props.wsDeps.isConnected.value || selectedItems.value.size === 0) return; // 恢复使用 props.wsDeps
    const itemsToDelete = Array.from(selectedItems.value)
                               .map(filename => fileList.value.find((f: FileListItem) => f.filename === filename)) // f 已有类型
                               .filter((item): item is FileListItem => item !== undefined);
    if (itemsToDelete.length === 0) return;

    const names = itemsToDelete.map(i => i.filename).join(', ');
    const confirmMsg = itemsToDelete.length > 1
        ? t('fileManager.prompts.confirmDeleteMultiple', { count: itemsToDelete.length, names: names })
        : itemsToDelete[0].attrs.isDirectory
            ? t('fileManager.prompts.confirmDeleteFolder', { name: itemsToDelete[0].filename })
            : t('fileManager.prompts.confirmDeleteFile', { name: itemsToDelete[0].filename });

    if (confirm(confirmMsg)) {
        deleteItems(itemsToDelete); // Use deleteItems from props
        selectedItems.value.clear();
    }
};

const handleRenameContextMenuClick = (item: FileListItem) => { // item 已有类型
    if (!props.wsDeps.isConnected.value || !item) return; // 恢复使用 props.wsDeps
    const newName = prompt(t('fileManager.prompts.enterNewName', { oldName: item.filename }), item.filename);
    if (newName && newName !== item.filename) {
        renameItem(item, newName); // Use renameItem from props.sftpManager
    }
};

const handleChangePermissionsContextMenuClick = (item: FileListItem) => { // item 已有类型
    if (!props.wsDeps.isConnected.value || !item) return; // 恢复使用 props.wsDeps
    const currentModeOctal = (item.attrs.mode & 0o777).toString(8).padStart(3, '0');
    const newModeStr = prompt(t('fileManager.prompts.enterNewPermissions', { name: item.filename, currentMode: currentModeOctal }), currentModeOctal);
    if (newModeStr) {
        if (!/^[0-7]{3,4}$/.test(newModeStr)) {
            alert(t('fileManager.errors.invalidPermissionsFormat'));
            return;
        }
        const newMode = parseInt(newModeStr, 8);
        changePermissions(item, newMode); // Use changePermissions from props.sftpManager
    }
};

const handleNewFolderContextMenuClick = () => {
    if (!props.wsDeps.isConnected.value) return; // 恢复使用 props.wsDeps
    const folderName = prompt(t('fileManager.prompts.enterFolderName'));
    if (folderName) {
        if (fileList.value.some((item: FileListItem) => item.filename === folderName)) { // item 已有类型
             alert(t('fileManager.errors.folderExists', { name: folderName }));
             return;
        }
        createDirectory(folderName); // Use createDirectory from props.sftpManager
    }
};

const handleNewFileContextMenuClick = () => {
    if (!props.wsDeps.isConnected.value) return; // 恢复使用 props.wsDeps
    const fileName = prompt(t('fileManager.prompts.enterFileName'));
    if (fileName) {
        if (fileList.value.some((item: FileListItem) => item.filename === fileName)) { // item 已有类型
            alert(t('fileManager.errors.fileExists', { name: fileName }));
            return;
        }
        createFile(fileName); // Use createFile from props.sftpManager
    }
};


// --- 排序逻辑 ---
// Uses fileList from props.sftpManager
const sortedFileList = computed(() => {
    // Ensure fileList.value is used (it's reactive from the manager)
    if (!fileList.value) return [];
    const list = [...fileList.value];
    const key = sortKey.value;
    const direction = sortDirection.value === 'asc' ? 1 : -1;

    list.sort((a, b) => {
        if (key !== 'type') {
            if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
            if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
        }
        let valA: string | number | boolean;
        let valB: string | number | boolean;
        switch (key) {
            case 'type':
                valA = a.attrs.isDirectory ? 0 : (a.attrs.isSymbolicLink ? 1 : 2);
                valB = b.attrs.isDirectory ? 0 : (b.attrs.isSymbolicLink ? 1 : 2);
                break;
            case 'filename': valA = a.filename.toLowerCase(); valB = b.filename.toLowerCase(); break;
            case 'size': valA = a.attrs.isFile ? a.attrs.size : -1; valB = b.attrs.isFile ? b.attrs.size : -1; break;
            case 'mtime': valA = a.attrs.mtime; valB = b.attrs.mtime; break;
            default: valA = a.filename.toLowerCase(); valB = b.filename.toLowerCase();
        }
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        if (key !== 'filename') return a.filename.localeCompare(b.filename);
        return 0;
    });
    return list;
});

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
    console.log(`[FileManager ${props.sessionId}] Component mounted.`);
    // Initial load logic is handled by watchEffect
});

// 使用 watchEffect 监听连接和 SFTP 就绪状态以触发初始加载
// 恢复使用 props.wsDeps
watchEffect((onCleanup) => {
    let unregisterSuccess: (() => void) | undefined;
    let unregisterError: (() => void) | undefined;
    let timeoutId: number | undefined;

    const cleanupListeners = () => {
        unregisterSuccess?.();
        unregisterError?.();
        if (timeoutId) clearTimeout(timeoutId);
        if (isFetchingInitialPath.value) {
             isFetchingInitialPath.value = false;
        }
    };

    onCleanup(cleanupListeners);

    // 恢复使用 props.wsDeps.isConnected 和 props.wsDeps.isSftpReady
    // 恢复使用 props.sftpManager.isLoading
    if (props.wsDeps.isConnected.value && props.wsDeps.isSftpReady.value && !isLoading.value && !initialLoadDone.value && !isFetchingInitialPath.value) {
        console.log(`[FileManager ${props.sessionId}] Connection ready, fetching initial path.`);
        isFetchingInitialPath.value = true;

        // 恢复使用 props.wsDeps 中的 sendMessage 和 onMessage
        const { sendMessage: wsSend, onMessage: wsOnMessage } = props.wsDeps;
        const requestId = generateRequestId(); // 使用本地辅助函数
        const requestedPath = '.';

        unregisterSuccess = wsOnMessage('sftp:realpath:success', (payload: any, message: WebSocketMessage) => { // message 已有类型
            if (message.requestId === requestId && payload.requestedPath === requestedPath) {
                const absolutePath = payload.absolutePath;
                console.log(`[FileManager ${props.sessionId}] 收到 '.' 的绝对路径: ${absolutePath}。开始加载目录。`);
                // 不再直接修改 currentPath.value，而是调用 loadDirectory，它内部会更新路径
                loadDirectory(absolutePath); // 使用 props 中的 loadDirectory
                initialLoadDone.value = true;
                cleanupListeners();
            }
        });

        unregisterError = wsOnMessage('sftp:realpath:error', (payload: any, message: WebSocketMessage) => { // message 已有类型
            if (message.requestId === requestId && message.path === requestedPath) {
                console.error(`[FileManager ${props.sessionId}] 获取 '.' 的 realpath 失败:`, payload);
                // 适当地显示错误，也许设置 props.sftpManager.error?
                // 目前仅记录日志。
                cleanupListeners();
            }
        });

        console.log(`[FileManager ${props.sessionId}] 发送 sftp:realpath 请求 (ID: ${requestId}) for path: ${requestedPath}`);
        wsSend({ type: 'sftp:realpath', requestId: requestId, payload: { path: requestedPath } });

        timeoutId = setTimeout(() => {
            console.error(`[FileManager ${props.sessionId}] 获取 '.' 的 realpath 超时 (ID: ${requestId})。`);
            cleanupListeners();
        }, 10000); // 10 秒超时

    } else if (!props.wsDeps.isConnected.value && initialLoadDone.value) { // 恢复使用 props.wsDeps.isConnected
        console.log(`[FileManager ${props.sessionId}] 连接丢失 (之前已加载)，重置状态。`);
        selectedItems.value.clear();
        lastClickedIndex.value = -1;
        initialLoadDone.value = false; // 重置初始加载状态
        isFetchingInitialPath.value = false; // 重置获取状态
        cleanupListeners();
    }
});


onBeforeUnmount(() => {
    console.log(`[FileManager ${props.sessionId}] 组件即将卸载。`);
    // 调用注入的 SFTP 管理器提供的清理函数
    cleanupSftpHandlers();
    // 如果其他 composables 也提供了 cleanup 函数，在此处调用
    // cleanupUploader?.();
    // cleanupEditor?.();
    // 移除上下文菜单监听器
    document.removeEventListener('click', hideContextMenu, { capture: true });
});

// --- 列宽调整逻辑 (保持不变) ---
const getColumnKeyByIndex = (index: number): keyof typeof colWidths.value | null => {
    const keys = Object.keys(colWidths.value) as Array<keyof typeof colWidths.value>;
    return keys[index] ?? null;
};

const startResize = (event: MouseEvent, index: number) => {
    event.stopPropagation();
    event.preventDefault();
    isResizing.value = true;
    resizingColumnIndex.value = index;
    startX.value = event.clientX;
    const colKey = getColumnKeyByIndex(index);
    if (colKey) {
        startWidth.value = colWidths.value[colKey];
    } else {
        const thElement = (event.target as HTMLElement).closest('th');
        startWidth.value = thElement?.offsetWidth ?? 100;
    }
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
};

const handleResize = (event: MouseEvent) => {
    if (!isResizing.value || resizingColumnIndex.value < 0) return;
    const currentX = event.clientX;
    const diffX = currentX - startX.value;
    const newWidth = Math.max(30, startWidth.value + diffX);
    const colKey = getColumnKeyByIndex(resizingColumnIndex.value);
    if (colKey) {
        colWidths.value[colKey] = newWidth;
    }
};

const stopResize = () => {
    if (isResizing.value) {
        isResizing.value = false;
        resizingColumnIndex.value = -1;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
};

// --- 路径编辑逻辑 ---
const startPathEdit = () => {
    // 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected
    if (isLoading.value || !props.wsDeps.isConnected.value) return;
    editablePath.value = currentPath.value; // 使用 sftpManager 的 currentPath 初始化编辑框
    isEditingPath.value = true;
    nextTick(() => {
        pathInputRef.value?.focus();
        pathInputRef.value?.select();
    });
};

const handlePathInput = async (event?: Event) => {
    if (event && event instanceof KeyboardEvent && event.key !== 'Enter') {
        return;
    }
    const newPath = editablePath.value.trim();
    isEditingPath.value = false;
    if (newPath === currentPath.value || !newPath) { // 与 sftpManager 的 currentPath 比较
        return;
    }
    console.log(`[FileManager ${props.sessionId}] 尝试导航到新路径: ${newPath}`);
    // 调用 props 中的 loadDirectory
    await loadDirectory(newPath);
};

const cancelPathEdit = () => {
    isEditingPath.value = false;
};

// 清除错误消息的函数 - 调用 props 中的 clearSftpError
const clearError = () => {
    clearSftpError();
};

</script>

<template>
  <div class="file-manager">
    <div class="toolbar">
        <div class="path-bar">
          <span v-show="!isEditingPath">
            <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected -->
            {{ t('fileManager.currentPath') }}: <strong @click="startPathEdit" :title="t('fileManager.editPathTooltip')" class="editable-path" :class="{ 'disabled': isLoading || !props.wsDeps.isConnected.value }">{{ currentPath }}</strong>
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
          <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected.value -->
          <button @click.stop="loadDirectory(currentPath)" :disabled="isLoading || !props.wsDeps.isConnected.value || isEditingPath" :title="t('fileManager.actions.refresh')">🔄</button>
          <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected.value -->
          <button @click.stop="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })" :disabled="isLoading || !props.wsDeps.isConnected.value || currentPath === '/' || isEditingPath" :title="t('fileManager.actions.parentDirectory')">⬆️</button>
        </div>
        <div class="actions-bar">
             <input type="file" ref="fileInputRef" @change="handleFileSelected" multiple style="display: none;" />
             <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected.value -->
             <button @click="triggerFileUpload" :disabled="isLoading || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.uploadFile')">📤 {{ t('fileManager.actions.upload') }}</button>
             <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected.value -->
             <button @click="handleNewFolderContextMenuClick" :disabled="isLoading || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.newFolder')">➕ {{ t('fileManager.actions.newFolder') }}</button>
             <!-- 恢复使用 props.sftpManager.isLoading 和 props.wsDeps.isConnected.value -->
             <button @click="handleNewFileContextMenuClick" :disabled="isLoading || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.newFile')">📄 {{ t('fileManager.actions.newFile') }}</button>
        </div>
    </div>

    <!-- 文件列表容器 -->
    <div
      class="file-list-container"
      :class="{ 'drag-over': isDraggingOver }"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
        <!-- 移除内联错误提示框 -->
        <!-- <div v-if="error" class="error-alert"> ... </div> -->

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
/* 移除 .error-alert 和 .close-error-btn 样式 */
/* .error-alert { ... } */
/* .close-error-btn { ... } */
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
