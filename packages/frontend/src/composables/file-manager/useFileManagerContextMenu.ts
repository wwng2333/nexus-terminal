import { ref, nextTick, type Ref, type ComponentPublicInstance } from 'vue'; // 导入 ComponentPublicInstance
import type { FileListItem } from '../../types/sftp.types'; // 修正路径
import { type useI18n } from 'vue-i18n'; // 导入 useI18n 以获取 t 的类型
import type FileManagerContextMenu from '../../components/FileManagerContextMenu.vue'; // <-- 导入组件类型

// 定义菜单项类型 (可以根据需要扩展)
export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

// 定义 Composable 的输入参数类型
export interface UseFileManagerContextMenuOptions {
  selectedItems: Ref<Set<string>>;
  lastClickedIndex: Ref<number>;
  fileList: Ref<Readonly<FileListItem[]>>; // 使用 Readonly 避免直接修改
  currentPath: Ref<string>;
  isConnected: Ref<boolean>;
  isSftpReady: Ref<boolean>;
  t: ReturnType<typeof useI18n>['t']; // 使用 useI18n 获取 t 的类型
  // --- 回调函数 ---
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: (item: FileListItem) => void;
  onDelete: () => void; // 删除操作现在由外部处理
  onRename: (item: FileListItem) => void;
  onChangePermissions: (item: FileListItem) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
}

export function useFileManagerContextMenu(options: UseFileManagerContextMenuOptions) {
  const {
    selectedItems,
    lastClickedIndex,
    fileList,
    currentPath,
    isConnected,
    isSftpReady,
    t,
    onRefresh,
    onUpload,
    onDownload,
    onDelete,
    onRename,
    onChangePermissions,
    onNewFolder,
    onNewFile,
  } = options;

  const contextMenuVisible = ref(false);
  const contextMenuPosition = ref({ x: 0, y: 0 });
  const contextMenuItems = ref<ContextMenuItem[]>([]);
  const contextTargetItem = ref<FileListItem | null>(null);
  // 修正 Ref 类型为组件实例类型
  const contextMenuRef = ref<InstanceType<typeof FileManagerContextMenu> | null>(null);

  const showContextMenu = (event: MouseEvent, item?: FileListItem) => {
    event.preventDefault();
    const targetItem = item || null;

    // Adjust selection based on right-click target (逻辑保持不变)
    if (targetItem && !event.ctrlKey && !event.metaKey && !event.shiftKey && !selectedItems.value.has(targetItem.filename)) {
        selectedItems.value.clear();
        selectedItems.value.add(targetItem.filename);
        // 使用传入的 fileList ref
        const index = fileList.value.findIndex((f: FileListItem) => f.filename === targetItem.filename); // 添加类型
        lastClickedIndex.value = index;
    } else if (!targetItem) {
        selectedItems.value.clear();
        lastClickedIndex.value = -1;
    }

    contextTargetItem.value = targetItem;
    let menu: ContextMenuItem[] = [];
    const selectionSize = selectedItems.value.size;
    const clickedItemIsSelected = targetItem && selectedItems.value.has(targetItem.filename);
    const canPerformActions = isConnected.value && isSftpReady.value;

    // Build context menu items (使用传入的回调)
    if (selectionSize > 1 && clickedItemIsSelected) {
        // Multi-selection menu
        menu = [
            { label: t('fileManager.actions.deleteMultiple', { count: selectionSize }), action: onDelete, disabled: !canPerformActions },
            { label: t('fileManager.actions.refresh'), action: onRefresh, disabled: !canPerformActions },
        ];
    } else if (targetItem && targetItem.filename !== '..') {
        // Single item (not '..') menu
        menu = [
            { label: t('fileManager.actions.newFolder'), action: onNewFolder, disabled: !canPerformActions },
            { label: t('fileManager.actions.newFile'), action: onNewFile, disabled: !canPerformActions },
            { label: t('fileManager.actions.upload'), action: onUpload, disabled: !canPerformActions },
            { label: t('fileManager.actions.refresh'), action: onRefresh, disabled: !canPerformActions },
        ];
        if (targetItem.attrs.isFile) {
            menu.splice(1, 0, { label: t('fileManager.actions.download', { name: targetItem.filename }), action: () => onDownload(targetItem), disabled: !canPerformActions });
        }
        menu.push({ label: t('fileManager.actions.delete'), action: onDelete, disabled: !canPerformActions });
        menu.push({ label: t('fileManager.actions.rename'), action: () => onRename(targetItem), disabled: !canPerformActions });
        menu.push({ label: t('fileManager.actions.changePermissions'), action: () => onChangePermissions(targetItem), disabled: !canPerformActions });

    } else if (!targetItem) {
        // Right-click on empty space menu
        menu = [
            { label: t('fileManager.actions.newFolder'), action: onNewFolder, disabled: !canPerformActions },
            { label: t('fileManager.actions.newFile'), action: onNewFile, disabled: !canPerformActions },
            { label: t('fileManager.actions.upload'), action: onUpload, disabled: !canPerformActions },
            { label: t('fileManager.actions.refresh'), action: onRefresh, disabled: !canPerformActions },
        ];
    } else { // Clicked on '..'
        menu = [{ label: t('fileManager.actions.refresh'), action: onRefresh, disabled: !canPerformActions }];
    }

    contextMenuItems.value = menu;

    // Set initial position based on click event
    contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    contextMenuVisible.value = true; // Make menu visible so we can measure it

    // Use nextTick to allow the DOM to update and the menu to render
    nextTick(() => {
        // Access the DOM element via $el from the component instance ref
        const menuElement = contextMenuRef.value?.$el as HTMLDivElement | undefined;
        if (menuElement && contextMenuVisible.value) {
            // const menuElement = contextMenuRef.value; // Old way
            const menuRect = menuElement.getBoundingClientRect(); // Now should work
            const menuWidth = menuRect.width;
            const menuHeight = menuRect.height;

            let finalX = contextMenuPosition.value.x;
            let finalY = contextMenuPosition.value.y;

            // Adjust horizontally if needed
            if (finalX + menuWidth > window.innerWidth) {
                finalX = window.innerWidth - menuWidth - 5;
            }

            // Adjust vertically if needed
            if (finalY + menuHeight > window.innerHeight) {
                finalY = window.innerHeight - menuHeight - 5;
            }

            // Ensure menu doesn't go off-screen top or left
            finalX = Math.max(5, finalX);
            finalY = Math.max(5, finalY);

            // Update the position state if adjustments were made
            if (finalX !== contextMenuPosition.value.x || finalY !== contextMenuPosition.value.y) {
                 console.log(`[useFileManagerContextMenu] Adjusting context menu position: (${contextMenuPosition.value.x}, ${contextMenuPosition.value.y}) -> (${finalX}, ${finalY})`);
                 contextMenuPosition.value = { x: finalX, y: finalY };
            }

            // Add global listener to hide menu *after* positioning
            document.removeEventListener('click', hideContextMenu, { capture: true });
            document.addEventListener('click', hideContextMenu, { capture: true, once: true });
        } else {
             // Fallback listener if measurement fails
             document.removeEventListener('click', hideContextMenu, { capture: true });
             document.addEventListener('click', hideContextMenu, { capture: true, once: true });
        }
    });
  };

  const hideContextMenu = () => {
    if (!contextMenuVisible.value) return;
    contextMenuVisible.value = false;
    contextMenuItems.value = [];
    contextTargetItem.value = null; // 清理目标项
    document.removeEventListener('click', hideContextMenu, { capture: true });
  };

  // 返回需要暴露的状态和方法
  return {
    contextMenuVisible,
    contextMenuPosition,
    contextMenuItems,
    contextTargetItem, // 可能外部需要知道右键点击了哪个项
    contextMenuRef,
    showContextMenu,
    hideContextMenu,
  };
}