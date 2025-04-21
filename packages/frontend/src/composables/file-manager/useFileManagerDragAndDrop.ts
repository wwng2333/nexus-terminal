import { ref, type Ref } from 'vue';
import type { FileListItem } from '../../types/sftp.types'; // 确保路径正确

// 定义 Composable 的输入参数类型
export interface UseFileManagerDragAndDropOptions {
  // 响应式引用
  isConnected: Ref<boolean>;
  currentPath: Ref<string>;
  fileListContainerRef: Ref<HTMLDivElement | null>; // 文件列表容器的引用
  selectedItems: Ref<Set<string>>; // 当前选中的项目集合
  fileList: Ref<Readonly<FileListItem[]>>; // 完整的文件列表 (用于查找选中项的对象)

  // 函数依赖
  joinPath: (base: string, target: string) => string; // 路径拼接函数
  onFileUpload: (file: File) => void; // 触发文件上传的回调
  onItemMove: (sourceItem: FileListItem, newFullPath: string) => void; // 触发文件/文件夹移动的回调
}

export function useFileManagerDragAndDrop(options: UseFileManagerDragAndDropOptions) {
  const {
    isConnected,
    currentPath,
    fileListContainerRef,
    joinPath,
    onFileUpload,
    onItemMove,
    selectedItems, // 获取传入的 selectedItems
    fileList,      // 获取传入的 fileList
  } = options;

  // --- 拖放状态 Refs ---
  const isDraggingOver = ref(false); // 是否有文件拖拽悬停在容器上 (用于外部文件)
  const draggedItem = ref<FileListItem | null>(null); // 内部拖拽时，被拖拽的项
  const dragOverTarget = ref<string | null>(null); // 内部/外部拖拽时，悬停的目标文件夹名称 (用于行高亮)
  const scrollIntervalId = ref<number | null>(null); // 自动滚动计时器 ID

  // --- 自动滚动常量 ---
  const SCROLL_ZONE_HEIGHT = 50; // px
  const SCROLL_SPEED = 10; // px per interval

  // --- 辅助函数：停止自动滚动 ---
  const stopAutoScroll = () => {
    if (scrollIntervalId.value !== null) {
      clearInterval(scrollIntervalId.value);
      scrollIntervalId.value = null;
    }
  };

  // --- 事件处理函数 ---
  const handleDragEnter = (event: DragEvent) => {
     if (isConnected.value && event.dataTransfer?.types.includes('Files')) {
        isDraggingOver.value = true;
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault(); // 必须阻止默认行为以允许 drop
    const isExternalFileDrag = event.dataTransfer?.types.includes('Files') ?? false;
    const isInternalDrag = !!draggedItem.value;

    let effect: 'copy' | 'move' | 'none' = 'none';
    let currentTargetFilename: string | null = null;
    let highlightContainer = false;

    const targetElement = event.target as HTMLElement;
    const targetRow = targetElement.closest('tr.file-row');
    const targetFilename = (targetRow instanceof HTMLElement) ? targetRow.dataset.filename : undefined;
    const targetIsFolder = targetRow?.classList.contains('folder-row');

    if (isConnected.value) {
        if (isExternalFileDrag) {
            effect = 'copy';
            highlightContainer = true;
            if (targetIsFolder && targetFilename && targetFilename !== '..') {
                currentTargetFilename = targetFilename;
            } else {
                currentTargetFilename = null;
            }
        } else if (isInternalDrag && draggedItem.value) {
            highlightContainer = false;
            if (targetIsFolder && targetFilename && targetFilename !== draggedItem.value.filename) {
                effect = 'move';
                currentTargetFilename = targetFilename;
            } else {
                effect = 'none';
                currentTargetFilename = null;
            }
        } else {
            effect = 'none';
            currentTargetFilename = null;
            highlightContainer = false;
        }
    } else {
        effect = 'none';
        currentTargetFilename = null;
        highlightContainer = false;
    }

    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = effect;
    }
    isDraggingOver.value = highlightContainer;
    dragOverTarget.value = currentTargetFilename;

    // --- 处理自动滚动 ---
    const container = fileListContainerRef.value;
    if (container && (isExternalFileDrag || isInternalDrag) && effect !== 'none') {
        const rect = container.getBoundingClientRect();
        const mouseY = event.clientY - rect.top;

        if (mouseY < SCROLL_ZONE_HEIGHT) {
            if (scrollIntervalId.value === null) {
                scrollIntervalId.value = window.setInterval(() => {
                    if (container.scrollTop > 0) {
                        container.scrollTop -= SCROLL_SPEED;
                    } else {
                        stopAutoScroll();
                    }
                }, 30);
            }
        } else if (mouseY > container.clientHeight - SCROLL_ZONE_HEIGHT) {
            if (scrollIntervalId.value === null) {
                scrollIntervalId.value = window.setInterval(() => {
                    if (container.scrollTop < container.scrollHeight - container.clientHeight) {
                        container.scrollTop += SCROLL_SPEED;
                    } else {
                        stopAutoScroll();
                    }
                }, 30);
            }
        } else {
            stopAutoScroll();
        }
    } else {
         stopAutoScroll();
    }
  };

  const handleDragLeave = (event: DragEvent) => {
     const target = event.relatedTarget as Node | null;
    const container = (event.currentTarget as HTMLElement);
    if (!target || !container.contains(target)) {
       isDraggingOver.value = false;
       dragOverTarget.value = null;
       stopAutoScroll();
    }
  };

  const handleDrop = (event: DragEvent) => {
    const wasDraggingOver = isDraggingOver.value;
    const currentDragTarget = dragOverTarget.value;
    isDraggingOver.value = false;
    dragOverTarget.value = null;
    stopAutoScroll();

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0 || !isConnected.value) {
        if (draggedItem.value) draggedItem.value = null; // 清理内部拖拽状态
        return;
    }
    // 检查放置目标是否有效 (由 handleDragOver 决定)
    // 对于外部文件，要么容器高亮 (wasDraggingOver)，要么行高亮 (currentDragTarget)
    if (!wasDraggingOver && !currentDragTarget) {
         console.log(`[DragDrop] Drop ignored: Drop target was not valid according to handleDragOver.`);
         return;
    }


    const fileListArray = Array.from(files);
    let targetFolderPath = currentPath.value; // 默认上传到当前目录

    // 如果是放置在特定子文件夹行上
    if (currentDragTarget && currentDragTarget !== '..') {
        targetFolderPath = joinPath(currentPath.value, currentDragTarget);
        console.log(`[DragDrop] Dropped ${fileListArray.length} external files onto folder '${currentDragTarget}'. Uploading to: ${targetFolderPath}`);
    } else {
        console.log(`[DragDrop] Dropped ${fileListArray.length} external files onto current path '${currentPath.value}'.`);
    }

    // 注意：原始代码中 startFileUpload 没有使用 targetFolderPath，这里暂时保持一致
    // 如果需要上传到子目录，需要修改 useFileUploader 或此处的调用方式
    fileListArray.forEach(onFileUpload);
    draggedItem.value = null; // 确保清理内部拖拽状态
  };

  const handleDragStart = (item: FileListItem) => {
    if (item.filename === '..') return;
    // console.log(`[DragDrop] Drag Start: ${item.filename}`);
    draggedItem.value = item;
  };

  const handleDragEnd = () => {
    // console.log(`[DragDrop] Drag End`);
    draggedItem.value = null;
    dragOverTarget.value = null;
    stopAutoScroll();
    // 最好由 CSS :active 或其他状态处理，但作为后备
    document.querySelectorAll('.file-row.drop-target').forEach(el => el.classList.remove('drop-target'));
  };

  const handleDragOverRow = (targetItem: FileListItem, event: DragEvent) => {
     event.preventDefault(); // 允许 drop
    // 内部拖拽逻辑: 只能拖拽非 '..' 项，目标必须是文件夹或 '..'，且不能是自身
    if (!draggedItem.value || draggedItem.value.filename === '..' || (targetItem.filename !== '..' && (!targetItem.attrs.isDirectory || draggedItem.value.filename === targetItem.filename))) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        dragOverTarget.value = null; // 清除可能存在的旧目标
        return;
    }
    // 设置放置效果为 'move' 并记录目标
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragOverTarget.value = targetItem.filename;
  };

  const handleDragLeaveRow = (targetItem: FileListItem) => {
    // 只有当鼠标离开当前高亮的目标行时才清除高亮状态
    if (dragOverTarget.value === targetItem.filename) {
       dragOverTarget.value = null;
   }
  };

  const handleDropOnRow = (targetItem: FileListItem, event: DragEvent) => {
    event.preventDefault();
    // 检查是否是外部文件拖拽 (dataTransfer.files 存在)
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
        // 如果是外部文件拖拽，不阻止冒泡，让父容器的 handleDrop 处理上传
        // console.log(`[DragDrop] External file drop detected on row, letting parent handle.`);
        // 不需要清除 draggedItem.value，因为外部拖拽时它应该为 null
        // dragOverTarget.value = null; // 清除悬停状态 (父容器 handleDrop 会处理)
        return; // 让事件冒泡到父 div 的 handleDrop
    }

    // --- 以下是处理内部文件移动的逻辑 ---
    event.stopPropagation(); // 仅在处理内部移动时阻止冒泡
    const sourceItem = draggedItem.value;
    const currentDragOverTarget = dragOverTarget.value; // 保存当前目标，然后清除
    dragOverTarget.value = null; // 清除悬停状态

    // 验证内部拖放操作的有效性
    if (!sourceItem || sourceItem.filename === '..' || (targetItem.filename !== '..' && !targetItem.attrs.isDirectory) || sourceItem.filename === targetItem.filename || targetItem.filename !== currentDragOverTarget) {
        // console.log(`[DragDrop] Internal drop on row ignored: Invalid target, source, or drop occurred outside the intended target row. Source: ${sourceItem?.filename}, Target: ${targetItem.filename}, Drop Target: ${currentDragOverTarget}`);
        if (sourceItem) draggedItem.value = null; // 清理拖拽状态
        return;
    }

    // --- 计算路径 ---
    const sourceFullPath = joinPath(currentPath.value, sourceItem.filename);
    let targetDirectoryFullPath: string;

    if (targetItem.filename === '..') {
        const current = currentPath.value;
        if (current === '/') { // 不能从根目录移动到父目录
             // console.warn(`[DragDrop] Cannot move item from root to its parent.`);
             draggedItem.value = null;
             return;
        }
        const lastSlashIndex = current.lastIndexOf('/');
        targetDirectoryFullPath = lastSlashIndex <= 0 ? '/' : current.substring(0, lastSlashIndex);
        if (!targetDirectoryFullPath) targetDirectoryFullPath = '/'; // 处理根目录下的文件/文件夹
    } else {
        // 移动到子目录
        targetDirectoryFullPath = joinPath(currentPath.value, targetItem.filename);
    }

    const newFullPath = joinPath(targetDirectoryFullPath, sourceItem.filename);

    // 检查源路径和计算出的目标路径是否相同
    if (sourceFullPath === newFullPath) {
        // console.warn(`[DragDrop] Source and destination paths are the same.`);
        draggedItem.value = null;
        return;
    }

    // --- 调用 SFTP 操作 (处理单选/多选) ---
    const itemsToMove: FileListItem[] = [];
    // 检查被拖拽的项是否在选区内
    if (selectedItems.value.has(sourceItem.filename)) {
        // 多选拖拽：移动所有选中的项
        console.log(`[DragDrop] Multi-item drop detected. Moving ${selectedItems.value.size} selected items.`);
        selectedItems.value.forEach(filename => {
            // 从完整文件列表中查找对应的 FileListItem 对象
            const itemToMove = fileList.value.find(f => f.filename === filename);
            if (itemToMove && itemToMove.filename !== '..') { // 确保找到且不是 '..'
                 // 检查目标路径是否与源路径相同 (对于每个项目)
                 const currentItemSourcePath = joinPath(currentPath.value, itemToMove.filename);
                 const currentItemNewPath = joinPath(targetDirectoryFullPath, itemToMove.filename);
                 if (currentItemSourcePath !== currentItemNewPath) {
                     itemsToMove.push(itemToMove);
                 } else {
                     console.warn(`[DragDrop] Skipping move for ${itemToMove.filename}: Source and destination paths are the same.`);
                 }
            }
        });
        // 清空选择是一个好习惯，可以在移动成功后进行，但这里为简化暂时不清空
        // clearSelection(); // 需要从 useFileManagerSelection 引入或作为参数传入
    } else {
        // 单选拖拽 (拖拽了一个未选中的项)
        console.log(`[DragDrop] Single unselected item drop detected. Moving ${sourceItem.filename}.`);
        // 检查目标路径是否与源路径相同
        if (sourceFullPath !== newFullPath) {
            itemsToMove.push(sourceItem);
        } else {
             console.warn(`[DragDrop] Skipping move for ${sourceItem.filename}: Source and destination paths are the same.`);
        }
    }

    // 统一执行移动操作
    if (itemsToMove.length > 0) {
        console.log(`[DragDrop] Executing move for ${itemsToMove.length} items to target directory: ${targetDirectoryFullPath}`);
        itemsToMove.forEach(item => {
            const itemNewFullPath = joinPath(targetDirectoryFullPath, item.filename);
            console.log(`[DragDrop]   - Moving '${item.filename}' to '${itemNewFullPath}'`);
            onItemMove(item, itemNewFullPath); // 调用移动回调
        });
    } else {
        console.log("[DragDrop] No valid items to move.");
    }

    // 清理拖拽状态
    draggedItem.value = null;
  };


  // --- 返回状态和处理函数 ---
  return {
    isDraggingOver,
    dragOverTarget,
    draggedItem, // 需要暴露以供 handleDragOverRow 等函数内部判断
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
  };
}