import { defineStore } from 'pinia';
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
// 导入 axios 用于 API 调用
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient

// 定义所有可用面板的名称
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor' | 'commandHistory' | 'quickCommands' | 'dockerManager';

// 定义布局节点接口
export interface LayoutNode {
  id: string; // 唯一 ID
  type: 'pane' | 'container'; // 节点类型：面板或容器
  component?: PaneName; // 如果 type 是 'pane'，指定要渲染的组件
  direction?: 'horizontal' | 'vertical'; // 如果 type 是 'container'，指定分割方向
  children?: LayoutNode[]; // 如果 type 是 'container'，包含子节点数组
  size?: number; // 节点在父容器中的大小比例 (例如 20, 50, 30)
}

// 本地存储的 Key
const LAYOUT_STORAGE_KEY = 'nexus_terminal_layout_config';
const SIDEBAR_STORAGE_KEY = 'nexus_terminal_sidebar_config'; // 新增侧栏配置 Key

// 生成唯一 ID 的辅助函数
function generateId(): string {
  // 简单实现，实际项目中可能使用更健壮的库如 uuid
  return Math.random().toString(36).substring(2, 15);
}

// 定义默认布局结构
const getDefaultLayout = (): LayoutNode => ({
  id: generateId(), // 根容器 ID
  type: 'container',
  direction: 'horizontal', // 主方向：水平分割
  children: [
    // 左侧边栏：连接列表
    { id: generateId(), type: 'pane', component: 'connections', size: 15 },
    // 中间主区域：垂直分割
    {
      id: generateId(),
      type: 'container',
      direction: 'vertical',
      size: 60, // 中间区域占比
      children: [
        // 上方：终端
        { id: generateId(), type: 'pane', component: 'terminal', size: 60 },
        // 中下方：命令栏 (固定高度，特殊处理或放在终端内?) - 暂时移除，可在配置器中添加
        // { id: generateId(), type: 'pane', component: 'commandBar', size: 5 },
        // 下方：文件管理器
        { id: generateId(), type: 'pane', component: 'fileManager', size: 40 },
      ],
    },
    // 右侧边栏：垂直分割
    {
      id: generateId(),
      type: 'container',
      direction: 'vertical',
      size: 25, // 右侧区域占比
      children: [
        // 上方：编辑器
        { id: generateId(), type: 'pane', component: 'editor', size: 60 },
        // 下方：状态监视器
        { id: generateId(), type: 'pane', component: 'statusMonitor', size: 40 },
        // 可选：命令历史和快捷指令可以放在这里，或者作为可添加的面板
        // { id: generateId(), type: 'pane', component: 'commandHistory', size: 20 },
        // { id: generateId(), type: 'pane', component: 'quickCommands', size: 20 },
      ],
    },
  ],
});

// 定义默认侧栏配置
const getDefaultSidebarPanes = (): { left: PaneName[], right: PaneName[] } => ({
  left: [],
  right: [],
});

// 递归查找主布局树中使用的面板
function getMainLayoutUsedPaneNames(node: LayoutNode | null): Set<PaneName> {
  const usedNames = new Set<PaneName>();
  if (!node) return usedNames;

  function traverse(currentNode: LayoutNode) {
    if (currentNode.type === 'pane' && currentNode.component) {
      usedNames.add(currentNode.component);
    } else if (currentNode.type === 'container' && currentNode.children) {
      currentNode.children.forEach(traverse);
    }
  }

  traverse(node);
  return usedNames;
}

// 获取所有使用的面板（主布局 + 侧栏）
function getAllUsedPaneNames(mainNode: LayoutNode | null, sidebars: { left: PaneName[], right: PaneName[] }): Set<PaneName> {
  const usedNames = getMainLayoutUsedPaneNames(mainNode);
  sidebars.left.forEach(pane => usedNames.add(pane));
  sidebars.right.forEach(pane => usedNames.add(pane));
  return usedNames;
}


// --- Validation Helper ---
// Checks if a value is a valid PaneName
function isValidPaneName(value: any, allPanes: PaneName[]): value is PaneName {
    return typeof value === 'string' && allPanes.includes(value as PaneName);
}

// Checks if an array contains only unique, valid PaneName strings
function isValidPaneNameArray(arr: any, allPanes: PaneName[]): arr is PaneName[] {
    if (!Array.isArray(arr)) return false;
    const seen = new Set<PaneName>();
    for (const item of arr) {
        if (!isValidPaneName(item, allPanes) || seen.has(item)) {
            return false; // Not a valid PaneName or duplicate found
        }
        seen.add(item);
    }
    return true; // All items are unique and valid PaneNames
}


// 定义 Store
export const useLayoutStore = defineStore('layout', () => {
  // --- 状态 ---
  // 主布局树结构
  const layoutTree: Ref<LayoutNode | null> = ref(null);
  // 侧栏面板配置
  const sidebarPanes: Ref<{ left: PaneName[], right: PaneName[] }> = ref(getDefaultSidebarPanes());
  // 所有理论上可用的面板名称
  const allPossiblePanes: Ref<PaneName[]> = ref([
    'connections', 'terminal', 'commandBar', 'fileManager',
    'editor', 'statusMonitor', 'commandHistory', 'quickCommands',
    'dockerManager' // <--- 在这里添加 'dockerManager'
  ]);
  // 新增：控制布局（Header/Footer）可见性的状态
  const isLayoutVisible: Ref<boolean> = ref(true); // 控制整体布局（Header/Footer）可见性
  // 新增：控制主导航栏（Header）可见性的状态
  const isHeaderVisible: Ref<boolean> = ref(true); // 默认可见

  // --- 计算属性 ---
  // 计算当前布局和侧栏中正在使用的所有面板
  const usedPanes: ComputedRef<Set<PaneName>> = computed(() => getAllUsedPaneNames(layoutTree.value, sidebarPanes.value));

  // 计算当前未在布局或侧栏中使用的面板（可用于配置器中添加）
  const availablePanes: ComputedRef<PaneName[]> = computed(() => {
    const used = usedPanes.value;
    return allPossiblePanes.value.filter(pane => !used.has(pane));
  });

  // --- Actions ---
  // 初始化布局和侧栏配置
  async function initializeLayout() {
    let layoutLoadedFromBackend = false;
    let sidebarLoadedFromBackend = false;

    // 1. 尝试从后端加载主布局
    try {
      console.log('[Layout Store] Attempting to load layout from backend...');
      const response = await apiClient.get<LayoutNode | null>('/settings/layout'); // 使用 apiClient
      if (response.data) {
        // TODO: 在这里添加对 response.data 的结构验证，确保它符合 LayoutNode 接口
        layoutTree.value = response.data;
        layoutLoadedFromBackend = true;
        console.log('[Layout Store] 主布局从后端加载成功。');
        // 更新 localStorage
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(response.data));
        } catch (lsError) {
          console.error('[Layout Store] 保存后端主布局到 localStorage 失败:', lsError);
        }
      } else {
        console.log('[Layout Store] 后端未返回主布局数据。');
      }
    } catch (error) {
      console.error('[Layout Store] 从后端加载主布局失败:', error);
    }

    // 2. 尝试从后端加载侧栏配置 (假设 API 端点为 /settings/sidebar)
    try {
        console.log('[Layout Store] Attempting to load sidebar config from backend...');
        const response = await apiClient.get<{ left: any[], right: any[] } | null>('/settings/sidebar'); // Load as any[] first
        // --- Add Validation ---
        if (response.data &&
            isValidPaneNameArray(response.data.left, allPossiblePanes.value) &&
            isValidPaneNameArray(response.data.right, allPossiblePanes.value))
        {
            sidebarPanes.value = response.data as { left: PaneName[], right: PaneName[] }; // Cast after validation
            sidebarLoadedFromBackend = true;
            console.log('[Layout Store] 侧栏配置从后端加载成功并通过验证。');
            // 更新 localStorage
            try {
                localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(response.data));
            } catch (lsError) {
                console.error('[Layout Store] 保存后端侧栏配置到 localStorage 失败:', lsError);
            }
        } else { // Handles the case where the 'if' at line 184 failed
            if (response.data) { // Check if data existed but failed validation
                 console.log('[Layout Store] 后端返回的侧栏配置数据格式无效或包含无效/重复面板名称。');
            } else { // No data was returned from the backend
                 console.log('[Layout Store] 后端未返回侧栏配置数据。');
            }
        }
    } catch (error) {
        console.error('[Layout Store] 从后端加载侧栏配置失败:', error);
    }


    // 3. 如果主布局后端未加载成功，尝试从 localStorage 加载
    if (!layoutLoadedFromBackend) {
      console.log('[Layout Store] Attempting to load main layout from localStorage...');
      try {
        const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (savedLayout) {
          const parsedLayout = JSON.parse(savedLayout) as LayoutNode;
          // TODO: 添加验证逻辑
          layoutTree.value = parsedLayout;
          console.log('[Layout Store] 主布局从 localStorage 加载成功。');
        } else {
          // 4. 如果 localStorage 也没有，使用默认主布局
          layoutTree.value = getDefaultLayout();
          console.log('[Layout Store] 未找到保存的主布局，使用默认布局。');
        }
      } catch (error) {
        console.error('[Layout Store] 从 localStorage 加载或解析主布局失败:', error);
        layoutTree.value = getDefaultLayout();
      }
    }

    // 5. 如果侧栏配置后端未加载成功，尝试从 localStorage 加载
    if (!sidebarLoadedFromBackend) {
        console.log('[Layout Store] Attempting to load sidebar config from localStorage...');
        try {
            const savedSidebars = localStorage.getItem(SIDEBAR_STORAGE_KEY);
            if (savedSidebars) {
                const parsedSidebars = JSON.parse(savedSidebars) as { left: any[], right: any[] }; // Parse as any[] first
                // --- Add Validation ---
                if (parsedSidebars &&
                    isValidPaneNameArray(parsedSidebars.left, allPossiblePanes.value) &&
                    isValidPaneNameArray(parsedSidebars.right, allPossiblePanes.value))
                {
                    sidebarPanes.value = parsedSidebars as { left: PaneName[], right: PaneName[] }; // Cast after validation
                    console.log('[Layout Store] 侧栏配置从 localStorage 加载成功并通过验证。');
                } else {
                     console.warn('[Layout Store] localStorage 中的侧栏配置格式无效或包含无效/重复面板名称，使用默认值。');
                     sidebarPanes.value = getDefaultSidebarPanes();
                }
            } else {
                // 6. 如果 localStorage 也没有，使用默认侧栏配置
                sidebarPanes.value = getDefaultSidebarPanes();
                console.log('[Layout Store] 未找到保存的侧栏配置，使用默认配置。');
            }
        } catch (error) {
            console.error('[Layout Store] 从 localStorage 加载或解析侧栏配置失败:', error);
            sidebarPanes.value = getDefaultSidebarPanes();
        }
    }
  }

  // --- Helper for debounced persistence ---
  // We still might want debounce if updates happen rapidly outside the configurator (e.g., pane resize)
  let persistLayoutDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedPersistLayout = () => {
      if (persistLayoutDebounceTimer) clearTimeout(persistLayoutDebounceTimer);
      persistLayoutDebounceTimer = setTimeout(async () => { // Make async
          await persistLayoutTree(); // Await the async persist function
      }, 1000);
  };

  // 更新整个布局树（通常由配置器保存时调用）
  async function updateLayoutTree(newTree: LayoutNode | null) { // Make async
    // 可选：添加验证逻辑
    if (newTree) {
        // TODO: Add validation
    }
    // Check if the tree actually changed before updating and persisting
    if (JSON.stringify(newTree) !== JSON.stringify(layoutTree.value)) {
        layoutTree.value = newTree;
        console.log('[Layout Store] 布局树已更新。 New tree:', newTree);
        // --- Directly call persist ---
        await persistLayoutTree(); // Await persistence directly
    } else {
        console.log('[Layout Store] updateLayoutTree called but tree is unchanged.');
    }
  }

  // 新增：更新侧栏配置
  async function updateSidebarPanes(newPanes: { left: PaneName[], right: PaneName[] }) { // Make async
    // --- Add Validation ---
    if (newPanes &&
        isValidPaneNameArray(newPanes.left, allPossiblePanes.value) &&
        isValidPaneNameArray(newPanes.right, allPossiblePanes.value))
    {
        // Check if panes actually changed
        if (JSON.stringify(newPanes) !== JSON.stringify(sidebarPanes.value)) {
            sidebarPanes.value = newPanes as { left: PaneName[], right: PaneName[] }; // Assign validated data
            console.log('[Layout Store] 侧栏配置已通过验证并更新。 New sidebarPanes value:', JSON.parse(JSON.stringify(sidebarPanes.value)));
            // --- Directly call persist ---
            await persistSidebarPanes(); // Await persistence directly
        } else {
             console.log('[Layout Store] updateSidebarPanes called but panes are unchanged.');
        }
    } else {
        console.error('[Layout Store] updateSidebarPanes 接收到无效的侧栏配置数据，未更新状态:', newPanes);
        // 可选：抛出错误或通知用户
    }
  }
  // 递归查找并更新节点大小
  function findAndUpdateNodeSize(node: LayoutNode | null, nodeId: string, childrenSizes: { index: number; size: number }[]): LayoutNode | null {
    if (!node) return null;
    if (node.id === nodeId && node.type === 'container' && node.children) {
      const updatedChildren = [...node.children];
      childrenSizes.forEach(({ index, size }) => {
        if (updatedChildren[index]) {
          updatedChildren[index] = { ...updatedChildren[index], size: size };
        }
      });
      return { ...node, children: updatedChildren };
    }

    if (node.type === 'container' && node.children) {
      const updatedChildren = node.children.map(child => findAndUpdateNodeSize(child, nodeId, childrenSizes));
      // 检查是否有子节点被更新
      if (updatedChildren.some((child, index) => child !== node.children![index])) {
        return { ...node, children: updatedChildren.filter(Boolean) as LayoutNode[] };
      }
    }
    return node; // 未找到或未更新，返回原节点
  }


  // 新增 Action: 更新特定容器节点的子节点大小
  function updateNodeSizes(nodeId: string, childrenSizes: { index: number; size: number }[]) {
    console.log(`[Layout Store] 请求更新节点 ${nodeId} 的子节点大小:`, childrenSizes);
    const originalJson = JSON.stringify(layoutTree.value); // Store original state
    const updatedTree = findAndUpdateNodeSize(layoutTree.value, nodeId, childrenSizes);

    if (updatedTree && JSON.stringify(updatedTree) !== originalJson) { // Compare with original JSON
       layoutTree.value = updatedTree;
       console.log(`[Layout Store] 节点 ${nodeId} 的子节点大小已更新，触发防抖保存。`);
       // --- Use debounced persist for resize ---
       debouncedPersistLayout();
    } else {
       console.log(`[Layout Store] 未找到节点 ${nodeId} 或大小未改变。`);
    }
  }
  // 新增 Action: 切换布局（Header/Footer）的可见性
  function toggleLayoutVisibility() {
    isLayoutVisible.value = !isLayoutVisible.value;
    console.log(`[Layout Store] 布局可见性切换为: ${isLayoutVisible.value}`);
    // 注意：这个状态目前不与后端同步
  }

  // 新增 Action: 从后端加载主导航栏可见性设置
  async function loadHeaderVisibility() {
    console.log('[Layout Store] Attempting to load header visibility from backend...');
    try {
      // --- 调用后端 API (复用 nav-bar-visibility 接口) ---
      const response = await apiClient.get<{ visible: boolean }>('/settings/nav-bar-visibility'); // 使用 apiClient
      if (response && typeof response.data.visible === 'boolean') {
        isHeaderVisible.value = response.data.visible;
        console.log(`[Layout Store] Header visibility loaded from backend: ${isHeaderVisible.value}`);
      } else {
        console.warn('[Layout Store] Invalid response from backend for header visibility, using default.');
        isHeaderVisible.value = true; // 默认值
      }
    } catch (error) {
      console.error('[Layout Store] Failed to load header visibility from backend:', error);
      // 出错时使用默认值
      isHeaderVisible.value = true;
    }
  }

  // 新增 Action: 切换主导航栏可见性并同步到后端
  async function toggleHeaderVisibility() {
    const newValue = !isHeaderVisible.value;
    console.log(`[Layout Store] Toggling header visibility to: ${newValue}`);
    isHeaderVisible.value = newValue; // 立即更新 UI

    try {
      // --- 调用后端 API (复用 nav-bar-visibility 接口) ---
      await apiClient.put('/settings/nav-bar-visibility', { visible: newValue }); // 使用 apiClient
      console.log('[Layout Store] Header visibility saved to backend.');
    } catch (error) {
      console.error('[Layout Store] Failed to save header visibility to backend:', error);
      // 可选：如果保存失败，回滚状态？
      // isHeaderVisible.value = !newValue;
      // alert('Failed to save preference.'); // 或者通知用户
    }
  }

 // 新增 Action: 获取系统内置的默认布局
 function getSystemDefaultLayout(): LayoutNode {
   console.log('[Layout Store] Getting system default layout.');
   return getDefaultLayout(); // 直接调用内部函数
 }

 // 新增 Action: 获取系统内置的默认侧栏配置
 function getSystemDefaultSidebarPanes(): { left: PaneName[], right: PaneName[] } {
     console.log('[Layout Store] Getting system default sidebar panes.');
     return getDefaultSidebarPanes();
 }

 // 新增 Action: 将当前主布局树持久化到后端和 localStorage
 async function persistLayoutTree() { // Make async
   // ... (existing try/catch logic for backend and localStorage) ...
   // Ensure apiClient calls are awaited if they return promises
   try {
     console.log('[Layout Store] Attempting to save main layout to backend...');
     await apiClient.put('/settings/layout', layoutTree.value); // await
     console.log('[Layout Store] 主布局已成功保存到后端 (sent value):', layoutTree.value);
   } catch (error) {
     console.error('[Layout Store] 保存主布局到后端失败:', error);
   }
   // localStorage is synchronous
   try {
     const layoutToSave = JSON.stringify(layoutTree.value);
     localStorage.setItem(LAYOUT_STORAGE_KEY, layoutToSave);
     console.log('[Layout Store] 主布局已自动保存到 localStorage (saved value):', layoutToSave);
   } catch (error) {
     console.error('[Layout Store] 保存主布局到 localStorage 失败:', error);
   }
 }

 // 新增 Action: 将当前侧栏配置持久化到后端和 localStorage
 async function persistSidebarPanes() { // Make async
    // ... (existing try/catch logic for backend and localStorage) ...
    try {
         console.log('[Layout Store] Attempting to save sidebar config to backend...');
         await apiClient.put('/settings/sidebar', sidebarPanes.value); // await
         console.log('[Layout Store] 侧栏配置已成功保存到后端。');
     } catch (error) {
         console.error('[Layout Store] 保存侧栏配置到后端失败:', error);
     }
     // localStorage is synchronous
     try {
         const sidebarsToSave = JSON.stringify(sidebarPanes.value);
         localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarsToSave);
         console.log('[Layout Store] 侧栏配置已自动保存到 localStorage。');
     } catch (error) {
         console.error('[Layout Store] 保存侧栏配置到 localStorage 失败:', error);
     }
 }


 // --- REMOVE the old watchers that called persist ---
 // watch(layoutTree, ...); // REMOVE THIS
 // watch(sidebarPanes, ...); // REMOVE THIS
 // --- 初始化 ---
 // Store 创建时自动初始化布局和侧栏
 initializeLayout();
 // 单独加载 Header 可见性（如果需要与布局初始化分开）
 loadHeaderVisibility();


 // --- 返回 ---
 return {
   // State
   layoutTree,
   sidebarPanes, // <--- 暴露侧栏状态
   allPossiblePanes,
   isLayoutVisible,
   isHeaderVisible,
   // Computed
   availablePanes,
   usedPanes,
   // Actions
   updateLayoutTree,
   updateSidebarPanes, // <--- 暴露侧栏更新 action
   initializeLayout,
   updateNodeSizes,
   generateId,
   toggleLayoutVisibility,
   loadHeaderVisibility,
   toggleHeaderVisibility,
   getSystemDefaultLayout,
   getSystemDefaultSidebarPanes, // <--- 暴露获取默认侧栏配置的方法
   // Persist actions (可选暴露，如果需要手动触发)
   // persistLayoutTree,
   // persistSidebarPanes,
 };
});
