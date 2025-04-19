import { defineStore } from 'pinia';
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

// 定义所有可用面板的名称
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor' | 'commandHistory' | 'quickCommands';

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

// 递归查找布局树中所有使用的面板组件名称
function getUsedPaneNames(node: LayoutNode | null): Set<PaneName> {
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

// 定义 Store
export const useLayoutStore = defineStore('layout', () => {
  // --- 状态 ---
  // 核心状态：存储当前布局树结构
  const layoutTree: Ref<LayoutNode | null> = ref(null);
  // 存储所有理论上可用的面板名称
  const allPossiblePanes: Ref<PaneName[]> = ref([
    'connections', 'terminal', 'commandBar', 'fileManager',
    'editor', 'statusMonitor', 'commandHistory', 'quickCommands'
  ]);
  // 新增：控制布局（Header/Footer）可见性的状态
  const isLayoutVisible: Ref<boolean> = ref(true);

  // --- 计算属性 ---
  // 计算当前布局中正在使用的面板
  const usedPanes: ComputedRef<Set<PaneName>> = computed(() => getUsedPaneNames(layoutTree.value));

  // 计算当前未在布局中使用的面板（可用于配置器中添加）
  const availablePanes: ComputedRef<PaneName[]> = computed(() => {
    const used = usedPanes.value;
    return allPossiblePanes.value.filter(pane => !used.has(pane));
  });

  // --- Actions ---
  // 初始化布局：尝试从 localStorage 加载，否则使用默认布局
  function initializeLayout() {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (savedLayout) {
        const parsedLayout = JSON.parse(savedLayout) as LayoutNode;
        // 可选：添加验证逻辑确保加载的布局结构有效
        layoutTree.value = parsedLayout;
        console.log('[Layout Store] 从 localStorage 加载布局成功。');
      } else {
        layoutTree.value = getDefaultLayout();
        console.log('[Layout Store] 未找到保存的布局，使用默认布局。');
      }
    } catch (error) {
      console.error('[Layout Store] 加载或解析布局失败:', error);
      layoutTree.value = getDefaultLayout(); // 出错时回退到默认布局
    }
  }

  // 更新整个布局树（通常由配置器保存时调用）
  function updateLayoutTree(newTree: LayoutNode) {
    // 可选：添加验证逻辑
    layoutTree.value = newTree;
    console.log('[Layout Store] 布局树已更新。');
    // 保存将在 watch 中自动触发
  }

  // 新增：递归查找并更新节点大小
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
    const updatedTree = findAndUpdateNodeSize(layoutTree.value, nodeId, childrenSizes);
    if (updatedTree && updatedTree !== layoutTree.value) {
       // 只有在树实际发生变化时才更新 ref 以触发 watch
       layoutTree.value = updatedTree;
       console.log(`[Layout Store] 节点 ${nodeId} 的子节点大小已更新。`);
    } else if (updatedTree === layoutTree.value) {
       console.log(`[Layout Store] 未找到节点 ${nodeId} 或大小未改变。`);
    } else {
       console.error(`[Layout Store] 更新节点 ${nodeId} 大小后得到无效的树结构。`);
    }
  }
 
  // 新增 Action: 切换布局（Header/Footer）的可见性
  function toggleLayoutVisibility() {
    isLayoutVisible.value = !isLayoutVisible.value;
    console.log(`[Layout Store] 布局可见性切换为: ${isLayoutVisible.value}`);
  }
  // --- 持久化 ---
  // 监听 layoutTree 的变化，并自动保存到 localStorage
  watch(
    layoutTree,
    (newTree) => {
      if (newTree) {
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newTree));
          console.log('[Layout Store] 布局已自动保存到 localStorage。');
        } catch (error) {
          console.error('[Layout Store] 保存布局到 localStorage 失败:', error);
        }
      } else {
        // 如果布局被清空，也移除本地存储
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        console.log('[Layout Store] 布局为空，已从 localStorage 移除。');
      }
    },
    { deep: true } // 需要深度监听来捕获嵌套结构的变化
  );

  // --- 初始化 ---
  // Store 创建时自动初始化布局
  initializeLayout();

  // --- 返回 ---
  return {
    layoutTree,
    availablePanes, // 供配置器使用
    usedPanes,      // 可用于调试或内部逻辑
    updateLayoutTree,
    initializeLayout, // 允许外部重置或重新加载
    updateNodeSizes, // *** 新增：暴露更新大小的 action ***
    // 暴露 generateId 供配置器使用（如果需要）
    generateId,
    // 暴露 allPossiblePanes 供配置器显示所有选项
    allPossiblePanes,
    // 新增：暴露布局可见性状态和切换方法
    isLayoutVisible,
    toggleLayoutVisibility,
  };
});
