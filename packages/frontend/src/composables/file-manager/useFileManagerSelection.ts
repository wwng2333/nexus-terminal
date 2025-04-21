import { ref, type Ref } from 'vue';
import type { FileListItem } from '../../types/sftp.types'; // 确保路径正确

// 定义 Composable 的输入参数类型
export interface UseFileManagerSelectionOptions {
  // 注意：这里传入的应该是当前渲染在表格中的列表 (可能已排序/过滤)
  // 在 FileManager.vue 中，这通常是 filteredFileList 或 sortedFileList
  displayedFileList: Ref<Readonly<FileListItem[]>>;
  // 回调函数，当需要执行导航或打开文件时调用
  onItemAction: (item: FileListItem) => void;
}

export function useFileManagerSelection(options: UseFileManagerSelectionOptions) {
  const { displayedFileList, onItemAction } = options;

  const selectedItems = ref(new Set<string>());
  const lastClickedIndex = ref(-1); // 索引相对于 displayedFileList

  const handleItemClick = (event: MouseEvent, item: FileListItem) => {
    console.log(`[Selection] handleItemClick called for item: ${item.filename}`, { event, item });
    let shouldPerformAction = false; // 初始化标志
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    console.log(`[Selection] Modifiers: Ctrl/Meta=${ctrlOrMeta}, Shift=${shift}`);

    // 查找点击项在当前显示列表中的索引
    const itemIndex = displayedFileList.value.findIndex((f) => f.filename === item.filename);
    console.log(`[Selection] Item index in displayed list: ${itemIndex}`);

    // 如果找不到项（理论上不应发生），或者点击的是 '..'
    // (注意: '..' 通常是单独处理或在列表开头，这里假设它不在 displayedFileList 中，或者其点击事件由外部单独处理)
    // 我们主要处理 displayedFileList 中的项的选择逻辑
    if (itemIndex === -1) {
        // 如果点击的是 '..'
        // 如果点击的是 '..'
        if (item.filename === '..') {
            console.log("[Selection] Clicked on '..'");
            // 只有在没有修饰键时才执行 '..' 的动作
            if (!ctrlOrMeta && !shift) {
                console.log("[Selection] '..' clicked without modifiers. Clearing selection and marking for action.");
                console.log('[Selection] Before clear:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
                selectedItems.value.clear();
                lastClickedIndex.value = -1;
                shouldPerformAction = true; // 标记执行动作
                console.log('[Selection] After clear:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
            } else {
                 console.log("[Selection] '..' clicked with modifiers. Ignoring action.");
            }
            // 如果有修饰键，则不执行动作，直接返回 (修改：移到下面统一处理)
            // (不需要修改 selectedItems 或 lastClickedIndex)
            // 注意：这里没有 else，因为如果 shouldPerformAction 仍为 false，后面的 if 会阻止调用 onItemAction
        } else {
             // 如果不是 '..' 且找不到索引，则忽略无效点击
             return;
        }
        // 如果是 '..' 且没有修饰键，会继续到函数末尾的 action 调用检查
        // 如果是 '..' 且有修饰键，则在此处返回 (因为上面没有 return) -> 不对，应该在上面 if block 里 return
        // 统一处理 '..' 的返回逻辑：如果有修饰键，则不继续执行后续的选择/动作逻辑
        if (item.filename === '..' && (ctrlOrMeta || shift)) {
             console.log("[Selection] Returning early for '..' click with modifiers.");
             return;
        }
        // 如果不是 '..' 且找不到索引，也返回
        if (item.filename !== '..' && itemIndex === -1) {
             console.log("[Selection] Item not found in displayed list (and not '..'). Returning.");
             return;
        }

    }


    // --- 主要选择逻辑 ---
    console.log('[Selection] Before selection logic:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);

    // --- 调整后的主要选择逻辑 ---
    if (ctrlOrMeta) { // 1. 检查 Ctrl/Meta
      console.log('[Selection] Branch: Ctrl/Meta Click');
      event.preventDefault();
      event.stopPropagation(); // <-- 阻止冒泡
      // Ctrl/Cmd + Click: Toggle selection
      // '..' 不应参与多选 (已在前面处理)
      // if (item.filename === '..') return; // '..' 已在前面处理
      if (selectedItems.value.has(item.filename)) {
        console.log(`[Selection] Ctrl/Meta: Removing ${item.filename}`);
        selectedItems.value.delete(item.filename);
      } else {
        console.log(`[Selection] Ctrl/Meta: Adding ${item.filename}`);
        selectedItems.value.add(item.filename); // Keep the add operation
      }
      // Removed the extra else block here
      lastClickedIndex.value = itemIndex; // 更新最后点击的索引
      console.log('[Selection] After Ctrl/Meta:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
      console.log('[Selection] After Ctrl/Meta:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
    } else if (shift) { // 2. 检查 Shift (移除 lastClickedIndex !== -1 条件)
      console.log('[Selection] Branch: Shift Click');
      event.preventDefault();
      event.stopPropagation(); // <-- 阻止冒泡
      // Shift + Click: Range selection
      // '..' 不应参与范围选择 (已在前面处理)
      // if (item.filename === '..') return; // '..' 已在前面处理
      console.log('[Selection] Shift: Clearing previous selection.');
      selectedItems.value.clear();
      // 如果 lastClickedIndex 是 -1 (例如第一次 Shift 点击)，则只选中当前项
      const start = lastClickedIndex.value === -1 ? itemIndex : Math.min(lastClickedIndex.value, itemIndex);
      const end = lastClickedIndex.value === -1 ? itemIndex : Math.max(lastClickedIndex.value, itemIndex);
      console.log(`[Selection] Shift: Range from ${start} to ${end}`);
      for (let i = start; i <= end; i++) {
        // 确保索引有效且不是 '..'
        const fileToAdd = displayedFileList.value[i];
        if (fileToAdd && fileToAdd.filename !== '..') {
          console.log(`[Selection] Shift: Adding ${fileToAdd.filename}`);
          selectedItems.value.add(fileToAdd.filename);
        }
      }
      // Shift-click 也更新 lastClickedIndex 为当前点击项
      lastClickedIndex.value = itemIndex;
      console.log('[Selection] After Shift:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
      console.log('[Selection] After Shift:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);
    } else { // 3. 处理普通单击 (没有修饰键)
      console.log('[Selection] Branch: Single Click');
      // Single Click: Select only the clicked item and perform action
      console.log('[Selection] Single Click: Clearing previous selection.');
      selectedItems.value.clear();
       // '..' 不应被加入 selectedItems (已在前面处理 shouldPerformAction)
      if (item.filename !== '..') {
          console.log(`[Selection] Single Click: Adding ${item.filename}`);
          selectedItems.value.add(item.filename);
          lastClickedIndex.value = itemIndex; // 更新最后点击的索引
      } else {
           // 点击 '..' 的 lastClickedIndex 已在前面处理
          // lastClickedIndex.value = -1;
      }
      console.log('[Selection] After Single Click selection update:', new Set(selectedItems.value), 'Last index:', lastClickedIndex.value);


      // --- 调用外部传入的动作回调 ---
      // 只有单击时才执行导航或打开文件
      // 标记执行动作 (只在普通单击时)
      shouldPerformAction = true;
    }

    // 在函数末尾根据标志决定是否执行动作
    console.log(`[Selection] Final check: shouldPerformAction = ${shouldPerformAction}`);
    if (shouldPerformAction) {
        console.log(`[Selection] Calling onItemAction for ${item.filename}`);
        onItemAction(item);
    } else {
        console.log(`[Selection] Skipping onItemAction for ${item.filename}`);
    }
  };

  // 清空选择的辅助函数，可能在其他地方（如路径改变时）需要
  const clearSelection = () => {
      selectedItems.value.clear();
      lastClickedIndex.value = -1;
  };

  return {
    selectedItems,
    lastClickedIndex, // 只读暴露，主要由内部管理
    handleItemClick,
    clearSelection, // 暴露清空选择的方法
  };
}