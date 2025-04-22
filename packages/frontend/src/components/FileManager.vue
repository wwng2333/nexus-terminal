<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, watchEffect, type PropType, readonly, defineExpose, shallowRef } from 'vue'; // 添加 shallowRef
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router'; // 保留用于生成下载 URL (如果下载逻辑移动则可移除)
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
// 导入 SFTP Actions 工厂函数和所需的类型
import { createSftpActionsManager, type WebSocketDependencies } from '../composables/useSftpActions';
import { useFileUploader } from '../composables/useFileUploader';
// import { useFileEditor } from '../composables/useFileEditor'; // 移除旧的 composable 导入
import { useFileEditorStore, type FileInfo } from '../stores/fileEditor.store'; // 导入新的 Store 和 FileInfo 类型
import { useSessionStore } from '../stores/session.store';
import { useSettingsStore } from '../stores/settings.store';
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++
import { useFileManagerContextMenu } from '../composables/file-manager/useFileManagerContextMenu'; // +++ 导入上下文菜单 Composable +++
import { useFileManagerSelection } from '../composables/file-manager/useFileManagerSelection'; // +++ 导入选择 Composable +++
import { useFileManagerDragAndDrop } from '../composables/file-manager/useFileManagerDragAndDrop'; // +++ 导入拖放 Composable +++
import { useFileManagerKeyboardNavigation } from '../composables/file-manager/useFileManagerKeyboardNavigation'; // +++ 导入键盘导航 Composable +++
// WebSocket composable 不再直接使用
import FileUploadPopup from './FileUploadPopup.vue';
import FileManagerContextMenu from './FileManagerContextMenu.vue'; // +++ 导入上下文菜单组件 +++
// import FileEditorOverlay from './FileEditorOverlay.vue'; // 不再在此处渲染
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
  // 新增：文件管理器实例 ID
  instanceId: {
    type: String,
    required: true,
  },
  // // 注入此会话特定的 SFTP 管理器实例 (移除)
  // sftpManager: {
  //   type: Object as PropType<SftpManagerInstance>,
  //   required: true,
  // },
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
const sessionStore = useSessionStore(); // 实例化 Session Store

// --- 获取并存储 SFTP 管理器实例 ---
// 使用 shallowRef 存储管理器实例，以便在 sessionId 变化时切换
const currentSftpManager = shallowRef<SftpManagerInstance | null>(null);

const initializeSftpManager = (sessionId: string, instanceId: string) => {
    const manager = sessionStore.getOrCreateSftpManager(sessionId, instanceId);
    if (!manager) {
        // 抛出错误或显示错误消息，阻止组件进一步渲染
        console.error(`[FileManager ${sessionId}-${instanceId}] Failed to get or create SFTP manager instance.`);
        // 可以设置一个错误状态 ref 在模板中显示
        // managerError.value = `Failed to get SFTP manager for instance ${instanceId}`;
        currentSftpManager.value = null; // 确保设置为 null
        // 抛出错误会阻止组件渲染，可能不是最佳用户体验
        // throw new Error(`[FileManager ${sessionId}-${instanceId}] Failed to get or create SFTP manager instance.`);
    } else {
         currentSftpManager.value = manager;
         console.log(`[FileManager ${sessionId}-${instanceId}] SFTP Manager initialized/retrieved.`);
    }
};

// 初始加载管理器
initializeSftpManager(props.sessionId, props.instanceId);


// --- 文件上传模块 ---
// 修改：依赖 currentSftpManager 的状态
const {
    uploads,
    startFileUpload,
    cancelUpload,
} = useFileUploader(
    // 传递 manager 的 currentPath 和 fileList ref
    computed(() => currentSftpManager.value?.currentPath.value ?? '/'), // 提供默认值
    computed(() => currentSftpManager.value?.fileList.value ?? []), // 提供默认值
    props.wsDeps
);

// 实例化其他 Stores
const fileEditorStore = useFileEditorStore(); // 用于共享模式
// const sessionStore = useSessionStore(); // 已在上面实例化
const settingsStore = useSettingsStore();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++

// 从 Settings Store 获取共享设置
const { shareFileEditorTabsBoolean } = storeToRefs(settingsStore); // 使用 storeToRefs 保持响应性



// --- UI 状态 Refs (Remain mostly the same) ---
const fileInputRef = ref<HTMLInputElement | null>(null);
const sortKey = ref<keyof FileListItem | 'type' | 'size' | 'mtime'>('filename');
const sortDirection = ref<'asc' | 'desc'>('asc');
const initialLoadDone = ref(false);
const isFetchingInitialPath = ref(false);
const isEditingPath = ref(false);
const searchQuery = ref(''); // 新增：搜索查询 ref
const isSearchActive = ref(false); // 新增：控制搜索框激活状态
const searchInputRef = ref<HTMLInputElement | null>(null); // 新增：搜索输入框 ref
const pathInputRef = ref<HTMLInputElement | null>(null);
const editablePath = ref('');
const fileListContainerRef = ref<HTMLDivElement | null>(null); // 文件列表容器引用 (保留，传递给 Composable)
// const scrollIntervalId = ref<number | null>(null); // 已移至 useFileManagerDragAndDrop

const rowSizeMultiplier = ref(1); // 新增：行大小（字体）乘数
// --- 键盘导航状态 (移至 useFileManagerKeyboardNavigation) ---
// const selectedIndex = ref<number>(-1);

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

// --- 排序与过滤逻辑 ---
// 修改：依赖 currentSftpManager.value.fileList
const sortedFileList = computed(() => {
    if (!currentSftpManager.value?.fileList.value) return []; // 检查 manager 和 fileList 是否存在
    const list = [...currentSftpManager.value.fileList.value]; // 从 manager 获取列表
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

const filteredFileList = computed(() => {
    if (!searchQuery.value) {
        return sortedFileList.value; // 如果没有搜索查询，返回原始排序列表
    }
    const lowerCaseQuery = searchQuery.value.toLowerCase();
    return sortedFileList.value.filter(item =>
        item.filename.toLowerCase().includes(lowerCaseQuery)
    );
});

const handleSort = (key: keyof FileListItem | 'type' | 'size' | 'mtime') => {
    if (sortKey.value === key) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDirection.value = 'asc';
    }
};


// --- 列表项点击与选择逻辑 (使用 Composable) ---
// 定义单击时的动作回调 (移到 Selection 实例化之前)
const handleItemAction = (item: FileListItem) => {
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;

    if (item.attrs.isDirectory) {
        // 修改：使用 currentSftpManager.value.isLoading
        if (currentSftpManager.value.isLoading.value) {
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Ignoring directory click, already loading...`);
            return;
        }
        const newPath = item.filename === '..'
            // 修改：使用 currentSftpManager.value 的 currentPath 和 joinPath
            ? currentSftpManager.value.currentPath.value.substring(0, currentSftpManager.value.currentPath.value.lastIndexOf('/')) || '/'
            : currentSftpManager.value.joinPath(currentSftpManager.value.currentPath.value, item.filename);
        // 修改：使用 currentSftpManager.value.loadDirectory
        currentSftpManager.value.loadDirectory(newPath);
    } else if (item.attrs.isFile) {
        // 修改：使用 currentSftpManager.value 的 currentPath 和 joinPath
        const filePath = currentSftpManager.value.joinPath(currentSftpManager.value.currentPath.value, item.filename);
        const fileInfo: FileInfo = { name: item.filename, fullPath: filePath };

        if (settingsStore.showPopupFileEditorBoolean) {
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Triggering popup for: ${filePath}`);
            fileEditorStore.triggerPopup(filePath, props.sessionId); // Popup 仍然关联 sessionId
        }

        if (shareFileEditorTabsBoolean.value) {
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Opening file in shared mode (store handles loading): ${filePath}`);
            // 修改：传递 instanceId 给 openFile
            fileEditorStore.openFile(filePath, props.sessionId, props.instanceId);
        } else {
            // 独立模式由 sessionStore 处理，它内部应该已经知道 instanceId 或不需要它
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Opening file in independent mode (session store handles loading): ${filePath}`);
            sessionStore.openFileInSession(props.sessionId, fileInfo); // Independent mode 关联 sessionId
        }
    }
};

// 实例化选择 Composable (需要 filteredFileList 和 handleItemAction)
const {
  selectedItems, // 使用 Composable 返回的 selectedItems
  lastClickedIndex, // 获取 lastClickedIndex 以传递给 ContextMenu
  handleItemClick, // 使用 Composable 返回的 handleItemClick
  clearSelection, // 获取清空选择的方法
} = useFileManagerSelection({
  // 传递当前显示的列表 (已排序和过滤)
  displayedFileList: filteredFileList, // 现在 filteredFileList 已定义
  onItemAction: handleItemAction, // 传递动作回调
});


// --- SFTP 操作处理函数 (定义在此处，供 Composable 使用) ---
const handleDeleteSelectedClick = () => {
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;
    // 使用 props.wsDeps 和 currentSftpManager.value.fileList
    if (!props.wsDeps.isConnected.value || selectedItems.value.size === 0) return;
    const itemsToDelete = Array.from(selectedItems.value)
                               .map(filename => currentSftpManager.value?.fileList.value.find((f: FileListItem) => f.filename === filename)) // 从 manager 获取列表
                               .filter((item): item is FileListItem => item !== undefined);
    if (itemsToDelete.length === 0) return;

    const names = itemsToDelete.map(i => i.filename).join(', ');
    const confirmMsg = itemsToDelete.length > 1
        ? t('fileManager.prompts.confirmDeleteMultiple', { count: itemsToDelete.length, names: names })
        : itemsToDelete[0].attrs.isDirectory
            ? t('fileManager.prompts.confirmDeleteFolder', { name: itemsToDelete[0].filename })
            : t('fileManager.prompts.confirmDeleteFile', { name: itemsToDelete[0].filename });

    if (confirm(confirmMsg)) {
        // 修改：使用 currentSftpManager.value.deleteItems
        currentSftpManager.value?.deleteItems(itemsToDelete);
        selectedItems.value.clear();
    }
};

const handleRenameContextMenuClick = (item: FileListItem) => { // item 已有类型
    if (!props.wsDeps.isConnected.value || !item) return; // 恢复使用 props.wsDeps
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;
    const newName = prompt(t('fileManager.prompts.enterNewName', { oldName: item.filename }), item.filename);
    if (newName && newName !== item.filename) {
        // 修改：使用 currentSftpManager.value.renameItem
        currentSftpManager.value.renameItem(item, newName);
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
        // 修改：检查 currentSftpManager 是否存在
        if (!currentSftpManager.value) return;
        }
        const newMode = parseInt(newModeStr, 8);
        // 修改：使用 currentSftpManager.value.changePermissions
        currentSftpManager.value.changePermissions(item, newMode);
    }
};

const handleNewFolderContextMenuClick = () => {
    if (!props.wsDeps.isConnected.value) return; // 恢复使用 props.wsDeps
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;
    const folderName = prompt(t('fileManager.prompts.enterFolderName'));
    if (folderName) {
        // 修改：使用 currentSftpManager.value.fileList
        if (currentSftpManager.value.fileList.value.some((item: FileListItem) => item.filename === folderName)) {
             alert(t('fileManager.errors.folderExists', { name: folderName }));
             return;
        }
        // 修改：使用 currentSftpManager.value.createDirectory
        currentSftpManager.value.createDirectory(folderName);
    }
};

const handleNewFileContextMenuClick = () => {
    if (!props.wsDeps.isConnected.value) return; // 恢复使用 props.wsDeps
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;
    const fileName = prompt(t('fileManager.prompts.enterFileName'));
    if (fileName) {
        // 修改：使用 currentSftpManager.value.fileList
        if (currentSftpManager.value.fileList.value.some((item: FileListItem) => item.filename === fileName)) {
            alert(t('fileManager.errors.fileExists', { name: fileName }));
            return;
        }
        // 修改：使用 currentSftpManager.value.createFile
        currentSftpManager.value.createFile(fileName);
    }
};

// --- 文件上传触发器 (定义在此处，供 Composable 使用) ---
const triggerFileUpload = () => { fileInputRef.value?.click(); };

// --- 下载触发器 (定义在此处，供 Composable 使用) ---
const triggerDownload = (item: FileListItem) => { // item 已有类型
    // 恢复使用 props.wsDeps.isConnected
    if (!props.wsDeps.isConnected.value) {
        alert(t('fileManager.errors.notConnected'));
        return;
    }
    // connectionId 仍然从 props 获取
    const currentConnectionId = props.dbConnectionId;
    if (!currentConnectionId) {
        console.error(`[FileManager ${props.sessionId}-${props.instanceId}] Cannot download: Missing connection ID.`);
        // 修改：检查 currentSftpManager 是否存在
        if (!currentSftpManager.value) return;
        alert(t('fileManager.errors.missingConnectionId'));
        return;
    }
    // 修改：使用 currentSftpManager.value 的 joinPath 和 currentPath
    const downloadPath = currentSftpManager.value.joinPath(currentSftpManager.value.currentPath.value, item.filename);
    const downloadUrl = `/api/v1/sftp/download?connectionId=${currentConnectionId}&remotePath=${encodeURIComponent(downloadPath)}`;
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Triggering download: ${downloadUrl}`);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', item.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};


// --- 上下文菜单逻辑 (使用 Composable, 需要 Selection 和 Action Handlers) ---
const {
  contextMenuVisible,
  contextMenuPosition,
  contextMenuItems,
  contextMenuRef, // 获取 ref 以传递给子组件
  showContextMenu, // 使用 Composable 提供的函数
  hideContextMenu, // <-- 获取 hideContextMenu 函数
} = useFileManagerContextMenu({
  selectedItems,
  lastClickedIndex,
  // 修改：传递 manager 的 fileList 和 currentPath ref
  fileList: computed(() => currentSftpManager.value?.fileList.value ?? []),
  currentPath: computed(() => currentSftpManager.value?.currentPath.value ?? '/'),
  isConnected: props.wsDeps.isConnected,
  isSftpReady: props.wsDeps.isSftpReady,
  t,
  // --- 传递回调函数 ---
  // 修改：使用 currentSftpManager.value
  onRefresh: () => currentSftpManager.value?.loadDirectory(currentSftpManager.value.currentPath.value),
  onUpload: triggerFileUpload,
  onDownload: triggerDownload,
  onDelete: handleDeleteSelectedClick,
  onRename: handleRenameContextMenuClick,
  onChangePermissions: handleChangePermissionsContextMenuClick,
  onNewFolder: handleNewFolderContextMenuClick,
  onNewFile: handleNewFileContextMenuClick,
});

// --- 目录加载与导航 ---
// loadDirectory is provided by props.sftpManager

// --- 拖放逻辑 (使用 Composable) ---
const {
  isDraggingOver, // 容器拖拽悬停状态 (外部文件)
  dragOverTarget, // 行拖拽悬停目标 (内部/外部)
  // draggedItem, // 内部状态，不需要在 FileManager 中直接使用
  // --- 事件处理器 ---
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragStart,
  handleDragEnd,
  handleDragOverRow,
  handleDragLeaveRow,
  handleDropOnRow,
} = useFileManagerDragAndDrop({
  isConnected: props.wsDeps.isConnected,
  // 修改：传递 manager 的 currentPath 和 joinPath
  currentPath: computed(() => currentSftpManager.value?.currentPath.value ?? '/'),
  fileListContainerRef: fileListContainerRef,
  joinPath: computed(() => currentSftpManager.value?.joinPath ?? ((...args: string[]) => args.join('/'))), // 提供默认 joinPath
  onFileUpload: startFileUpload,
  // 修改：使用 currentSftpManager.value.renameItem
  onItemMove: (item, newName) => currentSftpManager.value?.renameItem(item, newName),
  selectedItems: selectedItems,
  // 修改：传递 manager 的 fileList ref
  fileList: computed(() => currentSftpManager.value?.fileList.value ?? []),
});


// --- 文件上传逻辑 (handleFileSelected 保持在此处，由 triggerFileUpload 调用) ---
const handleFileSelected = (event: Event) => {
    const input = event.target as HTMLInputElement;
    // 恢复使用 props.wsDeps.isConnected
    if (!input.files || !props.wsDeps.isConnected.value) return;
    Array.from(input.files).forEach(startFileUpload); // Use startFileUpload from useFileUploader
    input.value = '';
};

// --- 键盘导航逻辑 (使用 Composable) ---
const {
  selectedIndex, // 使用 Composable 返回的 selectedIndex
  handleKeydown, // 使用 Composable 返回的 handleKeydown
} = useFileManagerKeyboardNavigation({
  filteredFileList: filteredFileList,
  // 修改：传递 manager 的 currentPath ref
  currentPath: computed(() => currentSftpManager.value?.currentPath.value ?? '/'),
  fileListContainerRef: fileListContainerRef,
  // 当 Enter 键按下时，模拟鼠标单击
  onEnterPress: (item) => handleItemClick(new MouseEvent('click'), item),
});


// --- 重置选中索引和清空选择的 Watchers ---
// 修改：监听 manager 的 currentPath
watch(() => currentSftpManager.value?.currentPath.value, () => {
    selectedIndex.value = -1;
    clearSelection();
});
watch(searchQuery, () => {
    selectedIndex.value = -1;
    clearSelection(); // 清空选择
});
watch(sortKey, () => {
    selectedIndex.value = -1;
    clearSelection(); // 清空选择
});
watch(sortDirection, () => {
    selectedIndex.value = -1;
    clearSelection(); // 清空选择
});


// --- 生命周期钩子 ---
onMounted(() => {
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Component mounted.`);
    // Initial load logic is handled by watchEffect
});

// 使用 watchEffect 监听连接和 SFTP 就绪状态以触发初始加载
// 恢复使用 props.wsDeps
watchEffect((onCleanup) => {
    let unregisterSuccess: (() => void) | undefined;
    let unregisterError: (() => void) | undefined;
    let timeoutId: NodeJS.Timeout | undefined; // 修正类型为 NodeJS.Timeout

    const cleanupListeners = () => {
        unregisterSuccess?.();
        unregisterError?.();
        if (timeoutId) clearTimeout(timeoutId);
        if (isFetchingInitialPath.value) {
             isFetchingInitialPath.value = false;
        }
    };

    onCleanup(cleanupListeners);

    // 修改：检查 currentSftpManager 是否存在，并使用其 isLoading 状态
    if (currentSftpManager.value && props.wsDeps.isConnected.value && props.wsDeps.isSftpReady.value && !currentSftpManager.value.isLoading.value && !initialLoadDone.value && !isFetchingInitialPath.value) {
        console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Connection ready for manager, fetching initial path.`);
        isFetchingInitialPath.value = true;

        // 仍然使用 props.wsDeps 中的 sendMessage 和 onMessage
        const { sendMessage: wsSend, onMessage: wsOnMessage } = props.wsDeps;
        const requestId = generateRequestId(); // 使用本地辅助函数
        const requestedPath = '.';

        unregisterSuccess = wsOnMessage('sftp:realpath:success', (payload: any, message: WebSocketMessage) => { // message 已有类型
            if (message.requestId === requestId && payload.requestedPath === requestedPath) {
                // 修改：检查 currentSftpManager 是否存在
                if (!currentSftpManager.value) return;
                const absolutePath = payload.absolutePath;
                console.log(`[FileManager ${props.sessionId}-${props.instanceId}] 收到 '.' 的绝对路径: ${absolutePath}。开始加载目录。`);
                // 修改：使用 currentSftpManager.value.loadDirectory
                currentSftpManager.value.loadDirectory(absolutePath);
                initialLoadDone.value = true;
                cleanupListeners();
            }
        });

        unregisterError = wsOnMessage('sftp:realpath:error', (payload: any, message: WebSocketMessage) => { // message 已有类型
            if (message.requestId === requestId && message.path === requestedPath) {
                console.error(`[FileManager ${props.sessionId}-${props.instanceId}] 获取 '.' 的 realpath 失败:`, payload);
                // TODO: 可以考虑通过 manager instance 暴露错误状态
                // 目前仅记录日志。
                cleanupListeners();
            }
        });

        console.log(`[FileManager ${props.sessionId}-${props.instanceId}] 发送 sftp:realpath 请求 (ID: ${requestId}) for path: ${requestedPath}`);
        wsSend({ type: 'sftp:realpath', requestId: requestId, payload: { path: requestedPath } });

        timeoutId = setTimeout(() => {
            console.error(`[FileManager ${props.sessionId}-${props.instanceId}] 获取 '.' 的 realpath 超时 (ID: ${requestId})。`);
            cleanupListeners();
        }, 10000); // 10 秒超时

    } else if (!props.wsDeps.isConnected.value && initialLoadDone.value) { // 仍然使用 props.wsDeps.isConnected
        console.log(`[FileManager ${props.sessionId}-${props.instanceId}] 连接丢失 (之前已加载)，重置状态。`);
        clearSelection(); // 清空选择
        initialLoadDone.value = false; // 重置初始加载状态
        // lastClickedIndex.value = -1; // 由 clearSelection 处理
        isFetchingInitialPath.value = false; // 重置获取状态
        cleanupListeners();
    }
});

// +++ 监听 Store 中的触发器以激活搜索 +++
watch(() => focusSwitcherStore.activateFileManagerSearchTrigger, (newValue, oldValue) => { // 修改监听器
    // 确保只在触发器值增加时执行（避免初始加载或重置时触发）
    // 并且当前组件的 sessionId 与活动 sessionId 匹配
    // 检查 newValue > oldValue 确保是递增触发，避免重复执行
    // 检查是否是当前活动会话的此实例（如果需要区分实例）
    // 目前假设搜索触发器对会话内的所有 FileManager 生效
    if (newValue > (oldValue ?? 0) && props.sessionId === sessionStore.activeSessionId) {
        console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Received search activation trigger for active session.`);
        activateSearch(); // 调用组件内部的激活搜索方法
    }
}, { immediate: false }); // 添加 immediate: false 避免初始值为 0 时触发


// --- 新增：监听 sessionId prop 的变化 ---
watch(() => props.sessionId, (newSessionId, oldSessionId) => {
    if (newSessionId && newSessionId !== oldSessionId) {
        console.log(`[FileManager ${newSessionId}-${props.instanceId}] Session ID changed from ${oldSessionId} to ${newSessionId}. Re-initializing.`);

        // 1. 重新初始化 SFTP 管理器
        initializeSftpManager(newSessionId, props.instanceId);

        // 2. 重置 UI 状态
        clearSelection();
        searchQuery.value = '';
        isSearchActive.value = false;
        isEditingPath.value = false;
        sortKey.value = 'filename'; // 重置排序
        sortDirection.value = 'asc';
        initialLoadDone.value = false; // 需要重新加载初始路径
        isFetchingInitialPath.value = false; // 重置获取状态

        // 3. 触发新会话的初始路径加载 (watchEffect 会处理)
        // watchEffect 会在 currentSftpManager.value 改变后重新运行
        // 并检查新 manager 的状态来决定是否加载初始路径
    }
}, { immediate: false }); // immediate: false 避免初始挂载时触发


// onBeforeUnmount 中 cleanupSftpHandlers 的调用已移至新的 onBeforeUnmount 逻辑中

// +++ 注册/注销自定义聚焦动作 +++
let unregisterFocusAction: (() => void) | null = null; // 用于存储注销函数

onMounted(() => {
  // 注册一个包装函数，而不是直接注册 focusSearchInput
  // 使其成为 async 函数以兼容 Promise 返回类型
  const focusActionWrapper = async (): Promise<boolean | undefined> => {
    if (props.sessionId === sessionStore.activeSessionId) {
      // 如果是活动会话，调用原始聚焦函数并返回其结果
      // 由于 focusSearchInput 是同步的，我们直接返回它的 boolean 结果
      // async 函数会自动将其包装在 Promise 中（如果需要，但这里不需要）
      return focusSearchInput();
    }
    // 如果不是活动会话，返回 undefined，表示跳过
    // async 函数返回 undefined 会被包装成 Promise<undefined>
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Focus action skipped (async undefined) for inactive session.`);
    return undefined; // 返回 undefined 表示跳过
  };
  // 调用新的 registerFocusAction 并存储返回的注销函数
  unregisterFocusAction = focusSwitcherStore.registerFocusAction('fileManagerSearch', focusActionWrapper);
});

onBeforeUnmount(() => {
  // 调用存储的注销函数
  if (unregisterFocusAction) {
    unregisterFocusAction();
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Unregistered focus action on unmount.`);
  }
  // 清理对函数的引用
  unregisterFocusAction = null;
  // // 调用注入的 SFTP 管理器提供的清理函数 (移除，由 store 处理)
  // cleanupSftpHandlers();
  // 调用 store 的清理方法
  sessionStore.removeSftpManager(props.sessionId, props.instanceId);
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
    // 修改：检查 currentSftpManager 是否存在并使用其状态
    if (!currentSftpManager.value || currentSftpManager.value.isLoading.value || !props.wsDeps.isConnected.value) return;
    // 修改：使用 currentSftpManager.value.currentPath 初始化编辑框
    editablePath.value = currentSftpManager.value.currentPath.value;
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
    // 修改：检查 currentSftpManager 是否存在
    if (!currentSftpManager.value) return;
    const newPath = editablePath.value.trim();
    isEditingPath.value = false;
    // 修改：使用 currentSftpManager.value.currentPath 比较
    if (newPath === currentSftpManager.value.currentPath.value || !newPath) {
        return;
    }
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] 尝试导航到新路径: ${newPath}`);
    // 修改：使用 currentSftpManager.value.loadDirectory
    await currentSftpManager.value.loadDirectory(newPath);
};

const cancelPathEdit = () => {
    isEditingPath.value = false;
};

// 清除错误消息的函数 - 不再需要，错误由 UI 通知处理
// const clearError = () => {
//     clearSftpError();
// };

// --- 搜索框激活/取消逻辑 ---
const activateSearch = () => {
  isSearchActive.value = true;
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const deactivateSearch = () => {
  // 延迟失活以允许点击内部元素（如果需要）
  // setTimeout(() => {
  //   if (!searchInputRef.value?.contains(document.activeElement)) { // 检查焦点是否还在输入框内
        isSearchActive.value = false;
  //   }
  // }, 100); // 100ms 延迟
};

const cancelSearch = () => {
    searchQuery.value = ''; // 按 Esc 清空并失活
    isSearchActive.value = false;
};

// --- 行大小调整逻辑 ---
const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
        event.preventDefault(); // 阻止页面默认滚动行为
        const delta = event.deltaY > 0 ? -0.05 : 0.05; // 滚轮向下减小，向上增大
        // 限制字体大小乘数在 0.5 到 2 之间
        const newMultiplier = Math.max(0.5, Math.min(2, rowSizeMultiplier.value + delta));
        rowSizeMultiplier.value = parseFloat(newMultiplier.toFixed(2)); // 保留两位小数避免浮点数问题
        // console.log(`Row size multiplier: ${rowSizeMultiplier.value}`); // 调试日志
    }
};

// +++ 新增：聚焦搜索框的方法 +++
const focusSearchInput = (): boolean => {
  // 检查当前会话是否激活，防止后台实例响应
  if (props.sessionId !== sessionStore.activeSessionId) {
      console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Ignoring focus request for inactive session.`);
      return false;
  }

  if (!isSearchActive.value) {
    activateSearch(); // Activate search first
    // nextTick 确保 DOM 更新后再聚焦
    nextTick(() => {
        if (searchInputRef.value) {
            searchInputRef.value.focus();
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Search activated and input focused.`);
        } else {
            console.warn(`[FileManager ${props.sessionId}-${props.instanceId}] Search activated but input ref not found after nextTick.`);
        }
    });
    return true; // 假设会成功
  } else if (searchInputRef.value) {
    searchInputRef.value.focus();
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Search already active, input focused.`);
    return true;
  }
  console.warn(`[FileManager ${props.sessionId}-${props.instanceId}] Could not focus search input.`);
  return false;
};
defineExpose({ focusSearchInput });

</script>

<template>
  <div class="file-manager">
    <div class="toolbar">
        <div class="path-bar">
          <span v-show="!isEditingPath">
            <!-- 修改：使用 currentSftpManager.value -->
            {{ t('fileManager.currentPath') }}: <strong @click="startPathEdit" :title="t('fileManager.editPathTooltip')" class="editable-path" :class="{ 'disabled': !currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value }">{{ currentSftpManager?.currentPath.value ?? '/' }}</strong>
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
        </div>
        <!-- 按钮移到 path-bar 外面 -->
        <div class="path-actions"> <!-- 新增包裹容器 -->
          <!-- 修改：使用 currentSftpManager.value -->
          <button class="toolbar-button" @click.stop="currentSftpManager?.loadDirectory(currentSftpManager.currentPath.value, true)" :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value || isEditingPath" :title="t('fileManager.actions.refresh')"><i class="fas fa-sync-alt"></i></button>
          <!-- 修改：使用 currentSftpManager.value -->
          <button class="toolbar-button" @click.stop="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })" :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value || currentSftpManager.currentPath.value === '/' || isEditingPath" :title="t('fileManager.actions.parentDirectory')"><i class="fas fa-arrow-up"></i></button>
         <!-- 修改后的搜索区域 -->
         <div class="search-container">
             <button
                 v-if="!isSearchActive"
                 class="toolbar-button search-activate-button"
                 @click.stop="activateSearch"
                 :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value"
                 :title="t('fileManager.searchPlaceholder')"
             >
                 <i class="fas fa-search"></i>
             </button>
             <div v-else class="search-bar active">
                 <i class="fas fa-search search-icon"></i>
                 <input
                     ref="searchInputRef"
                     type="text"
                     v-model="searchQuery"
                     :placeholder="t('fileManager.searchPlaceholder')"
                     class="search-input"
                     data-focus-id="fileManagerSearch"
                     @blur="deactivateSearch"
                     @keyup.esc="cancelSearch"
                     @keydown.up.prevent="handleKeydown"
                     @keydown.down.prevent="handleKeydown"
                     @keydown.enter.prevent="handleKeydown"
                 />
                 <!-- 可选：添加清除按钮 -->
                 <!-- <button @click="searchQuery = ''; searchInputRef?.focus()" v-if="searchQuery" class="clear-search-button">&times;</button> -->
             </div>
         </div>
        </div> <!-- 结束包裹容器 -->
       <div class="actions-bar">
            <input type="file" ref="fileInputRef" @change="handleFileSelected" multiple style="display: none;" />
            <!-- 修改：使用 currentSftpManager.value -->
             <button @click="triggerFileUpload" :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.uploadFile')"><i class="fas fa-upload"></i> {{ t('fileManager.actions.upload') }}</button>
             <!-- 修改：使用 currentSftpManager.value -->
              <button @click="handleNewFolderContextMenuClick" :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.newFolder')"><i class="fas fa-folder-plus"></i> {{ t('fileManager.actions.newFolder') }}</button>
              <!-- 修改：使用 currentSftpManager.value -->
              <button @click="handleNewFileContextMenuClick" :disabled="!currentSftpManager || currentSftpManager.isLoading.value || !props.wsDeps.isConnected.value" :title="t('fileManager.actions.newFile')"><i class="far fa-file-alt"></i> {{ t('fileManager.actions.newFile') }}</button>
         </div>
     </div>

    <!-- 文件列表容器 -->
    <div
      ref="fileListContainerRef"
      class="file-list-container"
      :class="{ 'drag-over': isDraggingOver }" 
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver" 
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      @click="fileListContainerRef?.focus()"
      @keydown="handleKeydown"
      @wheel="handleWheel"
      tabindex="0"
      :style="{ '--row-size-multiplier': rowSizeMultiplier }"
    >
        <!-- Error display is handled globally by UINotificationDisplay -->

        <!-- File Table -->
        <table ref="tableRef" class="resizable-table" @contextmenu.prevent>
            <colgroup>
                 <col :style="{ width: `${colWidths.type}px` }">
                <col :style="{ width: `${colWidths.name}px` }">
                <col :style="{ width: `${colWidths.size}px` }">
                <col :style="{ width: `${colWidths.permissions}px` }">
                <col :style="{ width: `${colWidths.modified}px` }">
           </colgroup>
          <thead> <!-- Header is always visible -->
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

          <!-- Loading State -->
          <!-- 修改：使用 currentSftpManager.value -->
          <tbody v-if="!currentSftpManager || currentSftpManager.isLoading.value">
              <tr>
                  <td :colspan="5" class="loading">{{ t('fileManager.loading') }}</td>
              </tr>
          </tbody>

          <!-- Empty Directory State (Root Only) -->
          <!-- 修改：使用 currentSftpManager.value -->
          <tbody v-else-if="sortedFileList.length === 0 && currentSftpManager?.currentPath.value === '/'">
               <tr>
                   <td :colspan="5" class="no-files">{{ t('fileManager.emptyDirectory') }}</td>
               </tr>
          </tbody>

          <!-- File List State -->
          <tbody v-else @contextmenu.prevent="showContextMenu($event)">
            <!-- '..' 条目 -->
            <!-- 修改：使用 currentSftpManager.value -->
            <tr v-if="currentSftpManager?.currentPath.value !== '/'"
                class="clickable file-row folder-row"
                :class="{
                    selected: selectedIndex === 0,
                    'drop-target': dragOverTarget === '..'
                }"
                @click="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @contextmenu.prevent.stop="showContextMenu($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @dragover.prevent="handleDragOverRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } }, $event)"
                @dragleave="handleDragLeaveRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @drop.prevent="handleDropOnRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } }, $event)"
                :data-filename="'..'"
                >
              <td><i class="fas fa-level-up-alt file-icon"></i></td>
              <td>..</td>
              <td></td><td></td><td></td>
            </tr>
            <!-- File Entries -->
            <!-- 修改 v-for 以使用 filteredFileList -->
            <tr v-for="(item, index) in filteredFileList"
                :key="item.filename"
                :draggable="item.filename !== '..'" @dragstart="handleDragStart(item)" @dragend="handleDragEnd"
                @click="handleItemClick($event, item)"
                :class="[
                    'file-row',
                    { clickable: item.attrs.isDirectory || item.attrs.isFile },
                    /* 修改：使用 currentSftpManager.value */
                    { selected: selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex) },
                    { 'folder-row': item.attrs.isDirectory },
                    { 'drop-target': item.attrs.isDirectory && dragOverTarget === item.filename }
                ]"
               :data-filename="item.filename"
               @contextmenu.prevent.stop="showContextMenu($event, item)"
               @dragover.prevent="handleDragOverRow(item, $event)" 
               @dragleave="handleDragLeaveRow(item)"
                @drop.prevent="handleDropOnRow(item, $event)"> <!-- 使用 Composable 的 handleDropOnRow -->
              <td>
                <i :class="['file-icon', item.attrs.isDirectory ? 'fas fa-folder' : (item.attrs.isSymbolicLink ? 'fas fa-link' : 'far fa-file')]"></i>
              </td>
              <td>{{ item.filename }}</td>
              <td>{{ item.attrs.isFile ? formatSize(item.attrs.size) : '' }}</td>
              <td>{{ formatMode(item.attrs.mode) }}</td>
              <td>{{ new Date(item.attrs.mtime).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
        <!-- Removed separate loading/empty divs -->
     </div>

     <!-- 使用 FileUploadPopup 组件 -->
     <FileUploadPopup :uploads="uploads" @cancel-upload="cancelUpload" />

    <FileManagerContextMenu
      ref="contextMenuRef"
      :is-visible="contextMenuVisible"
      :position="contextMenuPosition"
      :items="contextMenuItems"
      @close-request="hideContextMenu"
    />


  </div>
</template>

<style scoped>
/* Enhanced Styles */
.file-manager { height: 100%; display: flex; flex-direction: column; font-family: var(--font-family-sans-serif); font-size: 0.9rem; overflow: hidden; background-color: var(--app-bg-color); color: var(--text-color); }

/* Toolbar美化 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--base-padding, 1rem) * 0.5) var(--base-padding, 1rem); /* 调整内边距 */
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap; /* 允许换行 */
  align-content: flex-start; /* 让换行后的行靠上（或靠左，取决于flex-direction）对齐 */
  gap: var(--base-margin, 0.5rem); /* 添加元素间距 */
}

/* Path Bar美化 */
.path-bar {
  display: flex; /* 使用flex布局 */
  align-items: center; /* 垂直居中 */
  background-color: var(--app-bg-color); /* 使用主背景色 */
  border: 1px solid var(--border-color); /* 添加边框 */
  border-radius: 4px; /* 圆角 */
  padding: 0.2rem 0.4rem; /* 内边距 */
  /* flex-grow: 1; /* 不再占据可用空间 */
  overflow: hidden; /* 防止内部溢出 */
  min-width: 100px; /* 最小宽度 */
}
.path-bar span { /* 路径文本容器 */
    white-space: nowrap;
    overflow-x: auto; /* 允许路径横向滚动 */
    padding-right: 0.5rem; /* 给滚动条留空间 */
    color: var(--text-color-secondary); /* 次要文本颜色 */
}
.path-bar strong.editable-path {
    font-weight: 500; /* 稍加粗 */
    color: var(--link-color); /* 使用链接颜色 */
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    margin-left: 0.3rem;
    cursor: text;
    transition: background-color 0.2s ease;
}
.path-bar strong.editable-path:hover {
    background-color: rgba(0, 0, 0, 0.05); /* 悬停背景 */
}
.path-bar strong.editable-path.disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.path-input {
    font-family: inherit;
    font-size: inherit;
    border: none; /* 移除边框，依赖外部容器 */
    background-color: transparent; /* 透明背景 */
    color: var(--text-color);
    padding: 0.1rem 0.4rem;
    flex-grow: 1; /* 占据空间 */
    outline: none; /* 移除默认outline */
    min-width: 100px; /* 最小宽度 */
}
/* 移出 path-bar 的按钮样式 (可以根据需要调整或合并到 .actions-bar button) */
.toolbar-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.1em;
    padding: 0.2rem 0.4rem; /* 调整内边距 */
    vertical-align: middle;
    color: var(--text-color-secondary); /* 次要颜色 */
    border-radius: 3px;
    transition: background-color 0.2s ease, color 0.2s ease;
    margin-left: 0; /* 移除与 path-bar 或其他元素保持间距 */
}
.toolbar-button:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.08); /* 悬停背景 */
    color: var(--text-color); /* 悬停时主颜色 */
}
.toolbar-button:disabled { opacity: 0.5; cursor: not-allowed; }
.toolbar-button i {
    color: var(--button-bg-color); /* 默认状态图标颜色改为按钮背景色 */
    transition: color 0.2s ease;
}
.toolbar-button:hover:not(:disabled) i {
    color: var(--button-hover-bg-color, var(--button-bg-color)); /* 悬停时使用按钮悬停色 */
}

/* 新增 path-actions 容器样式 */
.path-actions {
  display: flex;
  align-items: center;
  /* gap: 0.1rem; */ /* 可以根据需要添加微小的间距，但之前已将按钮 margin 设为 0 */
  flex-shrink: 0; /* 防止被压缩 */
  margin-right: auto; /* 将剩余空间推到右侧，实现左对齐 */
}


/* Actions Bar美化 */
.actions-bar {
    display: flex;
    align-items: center;
    gap: var(--base-margin, 0.5rem); /* 按钮间距 */
    flex-shrink: 0; /* 防止被压缩 */
}
.actions-bar button {
    padding: 0.4rem 0.9rem; /* 调整按钮内边距 */
    cursor: pointer;
    border: 1px solid var(--border-color); /* 添加边框 */
    border-radius: 4px;
    background-color: var(--app-bg-color); /* 按钮背景 */
    color: var(--text-color); /* 按钮文字颜色 */
    font-size: 0.9em;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    display: flex; /* 用于图标和文字对齐 */
    align-items: center;
    gap: 0.3rem; /* 图标和文字间距 */
}
.actions-bar button:hover:not(:disabled) {
    background-color: var(--header-bg-color); /* 悬停背景 */
    border-color: var(--button-bg-color); /* 悬停时边框变色 */
    color: var(--button-bg-color); /* 悬停时文字变色 */
}
.actions-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
/* 明确设置图标颜色 */
.actions-bar button i {
    font-size: 1em;
    color: var(--button-bg-color); /* 默认状态图标颜色改为按钮背景色 */
    transition: color 0.2s ease;
}
.actions-bar button:hover:not(:disabled) i {
    /* 悬停时可以保持按钮背景色，或者根据需要调整 */
    color: var(--button-hover-bg-color, var(--button-bg-color)); /* 悬停时使用按钮悬停色 */
}
/* .path-bar button i 的样式不再需要，因为按钮已移出 */
/*
.path-bar button i {
    color: var(--button-bg-color);
    transition: color 0.2s ease;
}
.path-bar button:hover:not(:disabled) i {
    color: var(--button-hover-bg-color, var(--button-bg-color));
}
*/

/* 新增搜索容器样式 */
.search-container {
   display: flex;
   align-items: center;
   /* margin-left: auto; /* 移除，让其自然流动 */
   margin-right: 0; /* 移除与操作按钮保持间距 */
}

/* 搜索激活按钮样式 (复用 toolbar-button) */
.search-activate-button {
   /* 继承 .toolbar-button 样式 */
}

/* 修改后的搜索框样式 */
.search-bar.active { /* 添加 .active 类 */
   min-width: 150px; /* 激活时给一个最小宽度 */
    display: flex;
    align-items: center;
    position: relative; /* 为了定位图标 */
    /* margin-left: auto; /* 移除这个规则，防止换行后不靠左 */
    margin-right: var(--base-margin, 0.5rem); /* 与操作按钮保持间距 */
    flex-shrink: 1; /* 允许收缩 */
    display: flex; /* 保持内部 flex 布局 */
    align-items: center; /* 保持内部垂直居中 */
    position: relative; /* 保持图标定位 */
}
.search-input {
    /* 保持原有样式，但可能需要调整宽度或 flex 属性 */
    flex-grow: 1; /* 让输入框填充 .search-bar.active */
    padding: 0.4rem 0.8rem 0.4rem 2rem; /* 左侧留出图标空间 */
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--app-bg-color);
    color: var(--text-color);
    font-size: 0.9em;
    min-width: 10px; /* 最小宽度 */
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.search-input:focus {
    outline: none;
    border-color: var(--button-bg-color);
    box-shadow: 0 0 0 2px rgba(var(--button-rgb), 0.2); /* 模拟焦点环 */
}
.search-icon {
    position: absolute;
    left: 0.8rem; /* 定位在输入框内左侧 */
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-color-secondary);
    pointer-events: none; /* 防止图标干扰点击 */
}


.upload-popup { position: fixed; bottom: var(--base-padding); right: var(--base-padding); background-color: var(--app-bg-color); border: 1px solid var(--border-color); border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); padding: 0.8rem; max-width: 300px; max-height: 200px; overflow-y: auto; z-index: 1001; color: var(--text-color); }
.upload-popup h4 { margin: 0 0 var(--base-margin) 0; font-size: 0.9em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem; }
.upload-popup ul { list-style: none; padding: 0; margin: 0; }
.upload-popup li { margin-bottom: var(--base-margin); font-size: 0.85em; display: flex; align-items: center; flex-wrap: wrap; } /* Use theme variable */
.upload-popup progress { margin: 0 0.5rem; width: 80px; height: 0.8em; }
.upload-popup .error { color: red; margin-left: 0.5rem; flex-basis: 100%; font-size: 0.8em; } /* Keep error color */
.upload-popup .cancel-btn { margin-left: auto; padding: 0.1rem 0.4rem; font-size: 0.8em; background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; cursor: pointer; } /* Keep specific cancel button style */
.loading, .no-files { padding: var(--base-padding); text-align: center; color: var(--text-color-secondary); } /* Use theme variable */
/* 移除 .error-alert 和 .close-error-btn 样式 */
/* .error-alert { ... } */
/* .close-error-btn { ... } */
.file-list-container {
    flex-grow: 1;
    overflow-y: auto;
    position: relative; /* Needed for overlay */
    /* 定义基础变量 */
    --base-font-size: 0.8rem; /* --- 减小基础字体大小 --- */
    --base-padding-vertical: 0.4rem; /* 减小基础垂直 padding */
    --base-padding-horizontal: 0.8rem;
    --base-icon-size: 1.1em; /* 相对于 base-font-size */
}
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
  table-layout: fixed;
  overflow: hidden;
  border-spacing: 0; /* Remove default spacing */
  border: 1px solid var(--border-color); /* Add border to table */
  border-radius: 5px; /* Add subtle rounding */
}
thead {
  background-color: var(--header-bg-color);
  position: sticky;
  top: 0;
  z-index: 1;
}
th, td {
    /* border: 1px solid var(--border-color); */ /* Remove individual cell borders */
    border-bottom: 1px solid var(--border-color); /* Use bottom border for separation */
    padding: calc(var(--base-padding-vertical) * var(--row-size-multiplier)) calc(var(--base-padding-horizontal) * var(--row-size-multiplier)); /* 使用变量调整 padding */
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle; /* Align content vertically */
    /* 调整字体大小缩放，使其变化不那么剧烈，并设置下限 (例如 0.85 * base) */
    font-size: calc(var(--base-font-size) * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5)); /* 示例：缩放幅度减半，最低 85% */
    padding: calc(var(--base-padding-vertical) * var(--row-size-multiplier)) calc(var(--base-padding-horizontal) * var(--row-size-multiplier)); /* padding 正常缩放 */
    /* 移除过渡效果以优化性能 */
    /* transition: font-size 0.1s ease, padding 0.1s ease; */
}
th {
    padding-top: 0.2rem; /* --- 减小表头顶部内边距 --- */
    padding-bottom: 0.2rem; /* --- 减小表头底部内边距 --- */
    position: relative;
    font-weight: 500; /* Slightly lighter header weight */
    color: var(--text-color-secondary); /* Use secondary color for header text */
    text-transform: uppercase; /* Uppercase headers */
    /* font-size 继承自 th, td */
    border-bottom-width: 2px; /* Thicker bottom border for header */
}
th.sortable { cursor: pointer; }
th.sortable:hover { background-color: var(--header-bg-color); filter: brightness(0.95); }
td:first-child {
  text-align: center;
  /* font-size 继承自 th, td */
  padding-left: calc(1rem * var(--row-size-multiplier)); /* 使用变量调整 padding */
  padding-right: calc(0.5rem * var(--row-size-multiplier)); /* 使用变量调整 padding */
}
td:first-child .file-icon { /* 文件类型图标颜色 */
    /* 图标大小与字体大小保持类似缩放逻辑 */
    font-size: calc(var(--base-icon-size) * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5));
    color: var(--button-bg-color); /* 默认使用按钮背景色 */
    /* 移除字体大小过渡 */
    transition: color 0.15s ease; /* 只保留颜色过渡 */
}
tbody tr.selected td:first-child .file-icon { /* 选中行图标颜色 */
    color: var(--button-text-color); /* 选中时使用按钮文字颜色 */
}

tbody tr {
    transition: background-color 0.15s ease; /* Smooth hover transition */
}
tbody tr:last-child td {
    border-bottom: none; /* Remove border from last row */
}
tbody tr:hover {
    background-color: var(--header-bg-color); /* Subtle hover */
    filter: brightness(0.98);
}
tbody tr.clickable { cursor: pointer; user-select: none; }
/* 应用内拖拽目标高亮 */
tbody tr.folder-row.drop-target {
   background-color: var(--button-hover-bg-color); /* 使用悬停背景色或更明显的颜色 */
   outline: 2px dashed var(--button-bg-color);
   outline-offset: -2px;
}
tbody tr.selected {
    background-color: var(--button-bg-color);
    color: var(--button-text-color);
}
tbody tr.selected td {
    border-bottom-color: transparent; /* Hide border when selected */
}
tbody tr.selected:hover {
    background-color: var(--button-hover-bg-color);
    color: var(--button-text-color);
}
/* Style specific columns if needed */
td:nth-child(2) { /* Name column */
    font-weight: 500; /* Slightly bolder name */
}
td:nth-child(3), /* Size */
td:nth-child(4), /* Permissions */
td:nth-child(5) { /* Modified */
    color: var(--text-color-secondary); /* Dim metadata */
    /* 元数据字体大小也应用类似缩放逻辑 */
    font-size: calc(var(--base-font-size) * 0.9 * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5));
}

/* 移除旧的上下文菜单样式 */
/* .context-menu { ... } */
/* .context-menu ul { ... } */
/* .context-menu li { ... } */
/* .context-menu li:hover { ... } */
/* .context-menu li.disabled { ... } */

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
  background-color: rgba(40, 40, 40, 0.95); /* Keep dark background for overlay */
  z-index: 1000; /* Ensure it's above the file list but below popups */
  display: flex;
  flex-direction: column;
  color: #f0f0f0; /* Keep light text for dark overlay */
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--base-margin) var(--base-padding); /* Use theme variables */
  background-color: #333; /* Keep dark header for overlay */
  border-bottom: 1px solid #555; /* Keep dark border for overlay */
  font-size: 0.9em;
}

.close-editor-btn {
  background: none;
  border: none;
  color: #ccc; /* Keep light color for dark header */
  font-size: 1.2em;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
}
.close-editor-btn:hover {
  color: white; /* Keep light hover color */
}

.editor-loading, .editor-error {
  padding: calc(var(--base-padding) * 2); /* Use theme variable */
  text-align: center;
  font-size: 1.1em;
}
.editor-error {
    color: #ff8a8a; /* Keep specific error color */
}

.editor-actions {
    display: flex;
    align-items: center;
}

.save-btn {
    background-color: var(--button-bg-color); /* Use theme variable */
    color: var(--button-text-color); /* Use theme variable */
    border: none;
    padding: 0.4rem 0.8rem;
    margin-left: var(--base-padding); /* Use theme variable */
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
}
.save-btn:disabled {
    background-color: #aaa;
    cursor: not-allowed;
}
.save-btn:hover:not(:disabled) {
    background-color: var(--button-hover-bg-color); /* Use theme variable */
}

.save-status {
    margin-left: var(--base-padding); /* Use theme variable */
    font-size: 0.9em;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
}
.save-status.saving {
    color: var(--text-color-secondary); /* Use theme variable */
}
.save-status.success {
    color: #4CAF50; /* Keep specific success color */
    background-color: #e8f5e9; /* Keep specific success background */
}
.save-status.error {
    color: #f44336; /* Keep specific error color */
    background-color: #ffebee; /* Keep specific error background */
}

.editor-instance {
  flex-grow: 1; /* Make editor take remaining space */
  min-height: 0; /* Important for flex-grow in flex column */
}

</style>


