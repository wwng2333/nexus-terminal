<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, watchEffect, type PropType, readonly, defineExpose, shallowRef } from 'vue';
// 移除 debounce 导入
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router'; // 保留用于生成下载 URL (如果下载逻辑移动则可移除)
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
// 导入 SFTP Actions 工厂函数和所需的类型
import { createSftpActionsManager, type WebSocketDependencies } from '../composables/useSftpActions';
import { useFileUploader } from '../composables/useFileUploader';
// import { useFileEditor } from '../composables/useFileEditor'; // 移除旧的 composable 导入
import { useFileEditorStore, type FileInfo } from '../stores/fileEditor.store'; // 导入新的 Store 和 FileInfo 类型
import { useSessionStore } from '../stores/session.store';
import { useSettingsStore } from '../stores/settings.store'; // +++ 实例化 Settings Store +++
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store'; // +++ 实例化焦点切换 Store +++
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
const settingsStore = useSettingsStore(); // +++ 实例化 Settings Store +++
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++

// 从 Settings Store 获取共享设置
const {
  shareFileEditorTabsBoolean,
  fileManagerRowSizeMultiplierNumber, // +++ 获取行大小 getter +++
  fileManagerColWidthsObject, // +++ 获取列宽 getter +++
} = storeToRefs(settingsStore); // 使用 storeToRefs 保持响应性



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

const rowSizeMultiplier = ref(1.0); // 新增：行大小（字体）乘数, 默认值会被 store 覆盖
// --- 键盘导航状态 (移至 useFileManagerKeyboardNavigation) ---
// const selectedIndex = ref<number>(-1);

// --- Column Resizing State (Remains the same) ---
const tableRef = ref<HTMLTableElement | null>(null);
const colWidths = ref({ // 默认值会被 store 覆盖
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
        // 修改：添加 ?. 访问
        currentSftpManager.value?.renameItem(item, newName);
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
        // 修改：在调用前检查 currentSftpManager
        if (!currentSftpManager.value) {
            console.error(`[FileManager ${props.sessionId}-${props.instanceId}] Cannot change permissions: SFTP manager not available.`);
            return;
        }
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
        // 修改：确保在检查后调用，并检查 manager
        if (!currentSftpManager.value) {
            console.error(`[FileManager ${props.sessionId}-${props.instanceId}] Cannot create directory: SFTP manager not available.`);
            return;
        }
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
        // 修改：确保在检查后调用，并检查 manager
        if (!currentSftpManager.value) {
            console.error(`[FileManager ${props.sessionId}-${props.instanceId}] Cannot create file: SFTP manager not available.`);
            return;
        }
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
        alert(t('fileManager.errors.missingConnectionId'));
        return;
    }
    // 修改：简化检查
    if (!currentSftpManager.value) {
        console.error(`[FileManager ${props.sessionId}-${props.instanceId}] Cannot download: SFTP manager is not available.`);
        alert(t('fileManager.errors.sftpManagerNotFound'));
        return;
    }

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
  // 修改：传递 manager 的 fileList 和 currentPath ref (保持 computed)
  fileList: computed(() => currentSftpManager.value?.fileList.value ?? []),
  currentPath: computed(() => currentSftpManager.value?.currentPath.value ?? '/'),
  isConnected: props.wsDeps.isConnected,
  isSftpReady: props.wsDeps.isSftpReady,
  t,
  // --- 传递回调函数 ---
  // 修改：确保在调用前检查 currentSftpManager.value
  onRefresh: () => {
      if (currentSftpManager.value) {
          currentSftpManager.value.loadDirectory(currentSftpManager.value.currentPath.value);
      }
  },
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
  // 修改：传递 manager 的 currentPath (保持 computed)
  currentPath: computed(() => currentSftpManager.value?.currentPath.value ?? '/'),
  fileListContainerRef: fileListContainerRef,
  // 修改：传递一个包装函数给 joinPath
  joinPath: (base: string, target: string): string => {
      return currentSftpManager.value?.joinPath(base, target) ?? `${base}/${target}`.replace(/\/+/g, '/'); // 提供简单的默认实现
  },
  onFileUpload: startFileUpload,
  // 修改：确保在调用前检查 currentSftpManager.value
  onItemMove: (item, newName) => {
      currentSftpManager.value?.renameItem(item, newName);
  },
  selectedItems: selectedItems,
  // 修改：传递 manager 的 fileList ref (保持 computed)
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


// --- 保存设置的函数 ---
const saveLayoutSettings = () => {
  // 确保 colWidths.value 是普通对象，而不是 Proxy
  const widthsToSave = JSON.parse(JSON.stringify(colWidths.value));
  // +++ 添加日志：记录保存的值 +++
  console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Triggering saveLayoutSettings: multiplier=${rowSizeMultiplier.value}, widths=${JSON.stringify(widthsToSave)}`);
  settingsStore.updateFileManagerLayoutSettings(rowSizeMultiplier.value, widthsToSave);
};

// --- 生命周期钩子 ---
onMounted(() => {
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Component mounted.`);
    // --- 移除 onMounted 中的加载逻辑 ---
    // Initial load logic is handled by watchEffect below and the main sftp loading watchEffect
});

// +++ 使用 watchEffect 响应式地加载和应用布局设置 +++
watchEffect(() => {
  // 检查 store 中的值是否有效 (避免在 store 加载完成前使用默认值覆盖本地 ref)
  // fileManagerColWidthsObject 初始可能是空对象 {}，需要检查其是否有键
  const storeMultiplier = fileManagerRowSizeMultiplierNumber.value;
  const storeWidths = fileManagerColWidthsObject.value;

  // +++ 添加日志：记录从 store 获取的值 +++
  console.log(`[FileManager ${props.sessionId}-${props.instanceId}] watchEffect triggered. Store values: multiplier=${storeMultiplier}, widths=${JSON.stringify(storeWidths)}`);

  // 只有当 store 加载完成并提供了有效值时才更新
  // 假设 store 加载完成后 multiplier > 0 且 widths 对象有内容
  if (storeMultiplier > 0 && Object.keys(storeWidths).length > 0) {
    const currentMultiplier = rowSizeMultiplier.value;
    const currentWidthsString = JSON.stringify(colWidths.value);
    const storeWidthsString = JSON.stringify(storeWidths);

    // +++ 添加日志：记录当前值和 store 值，以及是否更新 +++
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Comparing values: Current Multiplier=${currentMultiplier}, Store Multiplier=${storeMultiplier}. Update needed: ${storeMultiplier !== currentMultiplier}`);
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Comparing values: Current Widths=${currentWidthsString}, Store Widths=${storeWidthsString}. Update needed: ${storeWidthsString !== currentWidthsString}`);

    // 仅在值不同时更新，避免不必要的重渲染和潜在的循环更新
    if (storeMultiplier !== currentMultiplier) {
      rowSizeMultiplier.value = storeMultiplier;
      console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Row size multiplier updated from store: ${storeMultiplier}`);
    }
    if (storeWidthsString !== currentWidthsString) {
      // --- 修改：合并 storeWidths 到 colWidths.value ---
      // 确保 colWidths.value 的所有键都存在，并用 store 的值更新（如果存在且有效）
      const updatedWidths = { ...colWidths.value }; // 创建当前值的副本
      for (const key in updatedWidths) {
        if (storeWidths[key] !== undefined && typeof storeWidths[key] === 'number' && storeWidths[key] > 0) {
          updatedWidths[key as keyof typeof updatedWidths] = storeWidths[key];
        }
      }
      colWidths.value = updatedWidths; // 赋值更新后的对象
      console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Column widths updated from store: ${JSON.stringify(updatedWidths)}`);
    }
  } else {
    // +++ 添加日志：记录等待 store 加载 +++
    console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Waiting for valid layout settings from store... Store Multiplier=${storeMultiplier}, Store Widths Keys=${Object.keys(storeWidths).length}`);
  }
});

// 使用 watchEffect 监听连接和 SFTP 就绪状态以触发初始加载
// 恢复使用 props.wsDeps
watchEffect((onCleanup) => {
    let unregisterSuccess: (() => void) | undefined;
    let unregisterError: (() => void) | undefined;
    let timeoutId: NodeJS.Timeout | number | undefined; // 修正类型以兼容 Node 和浏览器环境

    const cleanupListeners = () => {
        unregisterSuccess?.();
        unregisterError?.();
        if (timeoutId) clearTimeout(timeoutId);
        if (isFetchingInitialPath.value) {
             isFetchingInitialPath.value = false;
        }
    };

    onCleanup(cleanupListeners);

    // 修改：添加 ?. 访问 isLoading
    if (currentSftpManager.value && props.wsDeps.isConnected.value && props.wsDeps.isSftpReady.value && !currentSftpManager.value?.isLoading?.value && !initialLoadDone.value && !isFetchingInitialPath.value) {
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
                // 修改：添加 ?. 访问 loadDirectory
                currentSftpManager.value?.loadDirectory(absolutePath);
                initialLoadDone.value = true;
                cleanupListeners();
            }
        });

        unregisterError = wsOnMessage('sftp:realpath:error', (payload: any, message: WebSocketMessage) => { // message 已有类型
            // 修改：使用 payload.requestedPath (如果存在) 或 message.requestId 匹配
            if (message.requestId === requestId && payload?.requestedPath === requestedPath) {
                console.error(`[FileManager ${props.sessionId}-${props.instanceId}] 获取 '${requestedPath}' 的 realpath 失败:`, payload);
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
  // 注册一个 async 函数以兼容 Promise 返回类型
  const focusActionWrapper = async (): Promise<boolean | undefined> => {
    if (props.sessionId === sessionStore.activeSessionId) {
      // 如果是活动会话，调用聚焦函数并返回其结果
      console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Executing focus action for active session.`);
      return focusSearchInput(); // focusSearchInput 返回 boolean
    } else {
      // 如果不是活动会话，返回 undefined 表示跳过
      console.log(`[FileManager ${props.sessionId}-${props.instanceId}] Focus action skipped for inactive session.`);
      return undefined;
    }
  };
  // 调用 registerFocusAction 并存储返回的注销函数
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
        // +++ 在调整结束后保存列宽 +++
        // +++ 添加日志：记录触发保存 +++
        console.log(`[FileManager ${props.sessionId}-${props.instanceId}] stopResize triggered saveLayoutSettings.`);
        saveLayoutSettings();
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
        const oldMultiplier = rowSizeMultiplier.value;
        rowSizeMultiplier.value = parseFloat(newMultiplier.toFixed(2)); // 保留两位小数避免浮点数问题
        // console.log(`Row size multiplier: ${rowSizeMultiplier.value}`); // 调试日志
        // +++ 在行大小变化后保存设置 +++
        if (rowSizeMultiplier.value !== oldMultiplier) {
            // +++ 添加日志：记录触发保存 +++
            console.log(`[FileManager ${props.sessionId}-${props.instanceId}] handleWheel triggered saveLayoutSettings.`);
            saveLayoutSettings();
        }
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
  <div class="flex flex-col h-full overflow-hidden bg-background text-foreground text-sm font-sans">
    <div class="flex items-center justify-between flex-wrap gap-2 p-2 bg-header border-b border-border flex-shrink-0">
        <!-- Path Bar -->
        <div class="flex items-center bg-background border border-border rounded px-1.5 py-0.5 overflow-hidden min-w-[100px] flex-shrink">
          <span v-show="!isEditingPath" class="text-text-secondary whitespace-nowrap overflow-x-auto pr-2">
            {{ t('fileManager.currentPath') }}:
            <strong
              @click="startPathEdit"
              :title="t('fileManager.editPathTooltip')"
              class="font-medium text-link ml-1 px-1 rounded cursor-text transition-colors duration-200"
              :class="{
                'hover:bg-black/5': currentSftpManager && props.wsDeps.isConnected.value,
                'opacity-60 cursor-not-allowed': !currentSftpManager || !props.wsDeps.isConnected.value
              }"
            >
              {{ currentSftpManager?.currentPath?.value ?? '/' }}
            </strong>
          </span>
          <input
            v-show="isEditingPath"
            ref="pathInputRef"
            type="text"
            v-model="editablePath"
            class="flex-grow bg-transparent text-foreground p-0.5 outline-none min-w-[100px]"
            @keyup.enter="handlePathInput"
            @blur="handlePathInput"
            @keyup.esc="cancelPathEdit"
          />
        </div>
        <!-- Path Actions -->
        <div class="flex items-center flex-shrink-0 mr-auto">
          <button
            class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-black/10 hover:enabled:text-foreground"
            @click.stop="currentSftpManager?.loadDirectory(currentSftpManager?.currentPath?.value ?? '/', true)"
            :disabled="!currentSftpManager || !props.wsDeps.isConnected.value || isEditingPath"
            :title="t('fileManager.actions.refresh')"
          >
            <i class="fas fa-sync-alt text-base"></i>
          </button>
          <button
            class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-black/10 hover:enabled:text-foreground"
            @click.stop="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
            :disabled="!currentSftpManager || !props.wsDeps.isConnected.value || currentSftpManager?.currentPath?.value === '/' || isEditingPath"
            :title="t('fileManager.actions.parentDirectory')"
          >
            <i class="fas fa-arrow-up text-base"></i>
          </button>
         <!-- Search Area -->
         <div class="flex items-center flex-shrink-0">
             <button
                 v-if="!isSearchActive"
                 class="flex items-center justify-center w-7 h-7 text-text-secondary rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-black/10 hover:enabled:text-foreground"
                 @click.stop="activateSearch"
                 :disabled="!currentSftpManager || !props.wsDeps.isConnected.value"
                 :title="t('fileManager.searchPlaceholder')"
             >
                 <i class="fas fa-search text-base"></i>
             </button>
             <div v-else class="relative flex items-center min-w-[150px] flex-shrink">
                 <i class="fas fa-search absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"></i>
                 <input
                     ref="searchInputRef"
                     type="text"
                     v-model="searchQuery"
                     :placeholder="t('fileManager.searchPlaceholder')"
                     class="flex-grow bg-background border border-border rounded pl-7 pr-2 py-1 text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary min-w-[10px] transition-colors duration-200"
                     data-focus-id="fileManagerSearch"
                     @blur="deactivateSearch"
                     @keyup.esc="cancelSearch"
                     @keydown.up.prevent="handleKeydown"
                     @keydown.down.prevent="handleKeydown"
                     @keydown.enter.prevent="handleKeydown"
                 />
                 <!-- Optional: Clear button -->
                 <!-- <button @click="searchQuery = ''; searchInputRef?.focus()" v-if="searchQuery" class="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground">&times;</button> -->
             </div>
         </div>
        </div> <!-- End Path Actions -->
       <!-- Main Actions Bar -->
       <div class="flex items-center gap-2 flex-shrink-0">
            <input type="file" ref="fileInputRef" @change="handleFileSelected" multiple class="hidden" />
            <button
              @click="triggerFileUpload"
              :disabled="!currentSftpManager || !props.wsDeps.isConnected.value"
              :title="t('fileManager.actions.uploadFile')"
              class="flex items-center gap-1 px-2.5 py-1 bg-background border border-border rounded text-foreground text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-header hover:enabled:border-primary hover:enabled:text-primary"
            >
              <i class="fas fa-upload text-sm"></i>
              <span>{{ t('fileManager.actions.upload') }}</span>
            </button>
            <button
              @click="handleNewFolderContextMenuClick"
              :disabled="!currentSftpManager || !props.wsDeps.isConnected.value"
              :title="t('fileManager.actions.newFolder')"
              class="flex items-center gap-1 px-2.5 py-1 bg-background border border-border rounded text-foreground text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-header hover:enabled:border-primary hover:enabled:text-primary"
            >
              <i class="fas fa-folder-plus text-sm"></i>
              <span>{{ t('fileManager.actions.newFolder') }}</span>
            </button>
            <button
              @click="handleNewFileContextMenuClick"
              :disabled="!currentSftpManager || !props.wsDeps.isConnected.value"
              :title="t('fileManager.actions.newFile')"
              class="flex items-center gap-1 px-2.5 py-1 bg-background border border-border rounded text-foreground text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-header hover:enabled:border-primary hover:enabled:text-primary"
            >
              <i class="far fa-file-alt text-sm"></i>
              <span>{{ t('fileManager.actions.newFile') }}</span>
            </button>
         </div>
     </div>


    <!-- File List Container -->
    <div
      ref="fileListContainerRef"
      class="flex-grow overflow-y-auto relative outline-none"
      :class="{
        'outline-dashed outline-2 outline-offset-[-2px] outline-primary bg-primary/5': isDraggingOver
      }"
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
        <!-- Drag over overlay text (optional) -->
        <div v-if="isDraggingOver" class="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-lg font-medium rounded pointer-events-none z-10">
          {{ t('fileManager.dropFilesHere', 'Drop files here to upload') }}
        </div>

        <!-- File Table -->
        <table ref="tableRef" class="w-full border-collapse table-fixed border border-border rounded" @contextmenu.prevent>
            <colgroup>
                 <col :style="{ width: `${colWidths.type}px` }">
                <col :style="{ width: `${colWidths.name}px` }">
                <col :style="{ width: `${colWidths.size}px` }">
                <col :style="{ width: `${colWidths.permissions}px` }">
                <col :style="{ width: `${colWidths.modified}px` }">
           </colgroup>
          <thead class="sticky top-0 z-10 bg-header">
            <tr>
              <th
                @click="handleSort('type')"
                class="relative px-2 py-1 border-b-2 border-border text-left text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:bg-black/5"
                :style="{ paddingLeft: `calc(1rem * var(--row-size-multiplier))`, paddingRight: `calc(0.5rem * var(--row-size-multiplier))` }"
              >
                {{ t('fileManager.headers.type') }}
                <span v-if="sortKey === 'type'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize z-20 hover:bg-primary/20" @mousedown.prevent="startResize($event, 0)" @click.stop></span>
              </th>
              <th
                @click="handleSort('filename')"
                class="relative px-2 py-1 border-b-2 border-border text-left text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:bg-black/5"
                :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))` }"
              >
                {{ t('fileManager.headers.name') }}
                <span v-if="sortKey === 'filename'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize z-20 hover:bg-primary/20" @mousedown.prevent="startResize($event, 1)" @click.stop></span>
              </th>
              <th
                @click="handleSort('size')"
                class="relative px-2 py-1 border-b-2 border-border text-left text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:bg-black/5"
                :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))` }"
              >
                {{ t('fileManager.headers.size') }}
                <span v-if="sortKey === 'size'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <span class="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize z-20 hover:bg-primary/20" @mousedown.prevent="startResize($event, 2)" @click.stop></span>
              </th>
              <th
                class="relative px-2 py-1 border-b-2 border-border text-left text-xs font-medium text-text-secondary uppercase tracking-wider select-none"
                :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))` }"
              >
                {{ t('fileManager.headers.permissions') }}
                <span class="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize z-20 hover:bg-primary/20" @mousedown.prevent="startResize($event, 3)" @click.stop></span>
              </th>
              <th
                @click="handleSort('mtime')"
                class="relative px-2 py-1 border-b-2 border-border text-left text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:bg-black/5"
                :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))` }"
              >
                {{ t('fileManager.headers.modified') }}
                <span v-if="sortKey === 'mtime'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                <!-- No resizer on the last column -->
              </th>
            </tr>
          </thead>

          <!-- Loading State -->
          <tbody v-if="!currentSftpManager || currentSftpManager.isLoading.value">
              <tr>
                  <td :colspan="5" class="px-4 py-6 text-center text-text-secondary italic">
                    {{ t('fileManager.loading') }}
                  </td>
              </tr>
          </tbody>

          <!-- Empty Directory State -->
          <tbody v-else-if="filteredFileList.length === 0">
               <tr>
                   <td :colspan="5" class="px-4 py-6 text-center text-text-secondary italic">
                     {{ searchQuery ? t('fileManager.noSearchResults') : t('fileManager.emptyDirectory') }}
                   </td>
               </tr>
          </tbody>

          <!-- File List State -->
          <tbody v-else @contextmenu.prevent="showContextMenu($event)">
            <!-- '..' Entry -->
            <tr v-if="currentSftpManager?.currentPath.value !== '/'"
                class="transition-colors duration-150 cursor-pointer select-none"
                :class="{
                    'bg-primary/10': selectedIndex === 0,
                    'outline-dashed outline-2 outline-offset-[-1px] outline-primary': dragOverTarget === '..',
                    'hover:bg-header/50': dragOverTarget !== '..'
                }"
                @click="handleItemClick($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @contextmenu.prevent.stop="showContextMenu($event, { filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @dragover.prevent="handleDragOverRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } }, $event)"
                @dragleave="handleDragLeaveRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })"
                @drop.prevent="handleDropOnRow({ filename: '..', longname: '..', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } }, $event)"
                :data-filename="'..'"
                >
              <td class="text-center border-b border-border align-middle" :style="{ paddingLeft: `calc(1rem * var(--row-size-multiplier))`, paddingRight: `calc(0.5rem * var(--row-size-multiplier))` }">
                <i class="fas fa-level-up-alt text-primary" :style="{ fontSize: `calc(1.1em * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }"></i>
              </td>
              <td class="border-b border-border align-middle" :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))`, fontSize: `calc(0.8rem * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }">..</td>
              <td class="border-b border-border align-middle"></td>
              <td class="border-b border-border align-middle"></td>
              <td class="border-b border-border align-middle"></td>
            </tr>
            <!-- File Entries -->
            <tr v-for="(item, index) in filteredFileList"
                :key="item.filename"
                :draggable="item.filename !== '..'" @dragstart="handleDragStart(item)" @dragend="handleDragEnd"
                @click="handleItemClick($event, item)"
                class="transition-colors duration-150 select-none"
                :class="[
                    { 'cursor-pointer': item.attrs.isDirectory || item.attrs.isFile },
                    { 'bg-primary text-white': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex) },
                    { 'hover:bg-header/50': !(selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)) },
                    { 'outline-dashed outline-2 outline-offset-[-1px] outline-primary': item.attrs.isDirectory && dragOverTarget === item.filename }
                ]"
               :data-filename="item.filename"
               @contextmenu.prevent.stop="showContextMenu($event, item)"
               @dragover.prevent="handleDragOverRow(item, $event)"
               @dragleave="handleDragLeaveRow(item)"
               @drop.prevent="handleDropOnRow(item, $event)">
              <td class="text-center border-b border-border align-middle" :class="{'border-b-transparent': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)}" :style="{ paddingLeft: `calc(1rem * var(--row-size-multiplier))`, paddingRight: `calc(0.5rem * var(--row-size-multiplier))` }">
                <i :class="['transition-colors duration-150', item.attrs.isDirectory ? 'fas fa-folder text-primary' : (item.attrs.isSymbolicLink ? 'fas fa-link text-cyan-500' : 'far fa-file text-text-secondary'), {'text-white': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)}]" :style="{ fontSize: `calc(1.1em * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }"></i>
              </td>
              <td class="border-b border-border truncate align-middle" :class="{'border-b-transparent': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex), 'font-medium': item.attrs.isDirectory}" :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))`, fontSize: `calc(0.8rem * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }">{{ item.filename }}</td>
              <td class="border-b border-border text-text-secondary truncate align-middle" :class="{'border-b-transparent': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)}" :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))`, fontSize: `calc(0.72rem * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }">{{ item.attrs.isFile ? formatSize(item.attrs.size) : '' }}</td>
              <td class="border-b border-border text-text-secondary truncate font-mono align-middle" :class="{'border-b-transparent': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)}" :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))`, fontSize: `calc(0.72rem * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }">{{ formatMode(item.attrs.mode) }}</td>
              <td class="border-b border-border text-text-secondary truncate align-middle" :class="{'border-b-transparent': selectedItems.has(item.filename) || (index + (currentSftpManager?.currentPath.value !== '/' ? 1 : 0) === selectedIndex)}" :style="{ padding: `calc(0.4rem * var(--row-size-multiplier)) calc(0.8rem * var(--row-size-multiplier))`, fontSize: `calc(0.72rem * max(0.85, var(--row-size-multiplier) * 0.5 + 0.5))` }">{{ new Date(item.attrs.mtime).toLocaleString() }}</td>
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
/* Scoped styles removed for Tailwind CSS refactoring */
</style>
