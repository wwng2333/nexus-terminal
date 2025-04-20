<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, type Ref, reactive } from 'vue'; // 导入 reactive
import { useI18n } from 'vue-i18n';
import { useLayoutStore, type LayoutNode, type PaneName } from '../stores/layout.store';
import draggable from 'vuedraggable';
import LayoutNodeEditor from './LayoutNodeEditor.vue'; // *** 导入节点编辑器 ***

// --- Props ---
const props = defineProps({
  isVisible: {
    type: Boolean,
    required: true,
  },
});

// --- Emits ---
const emit = defineEmits(['close']);

// --- Setup ---
const { t } = useI18n();
const layoutStore = useLayoutStore();

// --- State ---
// 创建布局树的本地副本，以便在不直接修改 store 的情况下进行编辑
const localLayoutTree: Ref<LayoutNode | null> = ref(null);
// 标记是否有更改未保存
const hasChanges = ref(false);

// --- Dialog State ---
const dialogRef = ref<HTMLElement | null>(null); // 对话框元素的引用
// 移除 initialDialogState, width, height 从 dialogStyle
// dialogStyle 现在不再需要，因为定位由 overlay flex 处理，尺寸由 CSS 处理
// const dialogStyle = reactive({
//   top: '50%',
//   left: '50%',
//   transform: 'translate(-50%, -50%)', // 初始居中
//   position: 'absolute' as 'absolute', // 显式设置定位
// });
// 移除 Resizing 相关的状态
// const isResizing = ref(false);
// const resizeHandle = ref<string | null>(null);
// const startDragPos = { x: 0, y: 0 };
// const startDialogRect = { width: 0, height: 0, top: 0, left: 0 };
// const minDialogSize = { width: 400, height: 300 }; // 移至 CSS

// --- Watchers ---
// 当弹窗可见时，从 store 加载当前布局并计算初始位置
watch(() => props.isVisible, (newValue) => {
  if (newValue) {
    // 加载布局
    if (layoutStore.layoutTree) {
      localLayoutTree.value = JSON.parse(JSON.stringify(layoutStore.layoutTree));
    }
    hasChanges.value = false;
    console.log('[LayoutConfigurator] 弹窗打开，已加载当前布局到本地副本。');

    // 弹窗打开时的逻辑 (不再需要设置样式)
    console.log('[LayoutConfigurator] Dialog opened.');
    // 移除 requestAnimationFrame 和尺寸/位置计算逻辑

  } else {
    localLayoutTree.value = null; // 关闭时清空本地副本
    // 移除 isResizing 和事件监听器移除 (因为 resizing 功能已移除)
    // isResizing.value = false;
    // window.removeEventListener('mousemove', handleMouseMove);
    // window.removeEventListener('mouseup', handleMouseUp);
  }
}, /*{ immediate: true }*/); // 移除 immediate: true 解决初始化顺序问题

// 监听本地布局树的变化，标记有未保存更改
watch(localLayoutTree, (newValue, oldValue) => {
  // 确保不是初始化加载触发的 watch
  if (oldValue !== null && props.isVisible) {
    hasChanges.value = true;
    console.log('[LayoutConfigurator] 本地布局已更改。');
  }
}, { deep: true });

// --- Helper Function for Local Tree ---
// 递归查找本地布局树中所有使用的面板组件名称
function getLocalUsedPaneNames(node: LayoutNode | null): Set<PaneName> {
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


// --- Computed ---
// const availablePanes = computed(() => layoutStore.availablePanes); // 旧的，基于 store
const allPossiblePanes = computed(() => layoutStore.allPossiblePanes); // 获取所有可能的面板

// *** 新增：计算当前配置器预览中可用的面板 ***
const configuratorAvailablePanes = computed(() => {
  const localUsed = getLocalUsedPaneNames(localLayoutTree.value);
  return allPossiblePanes.value.filter(pane => !localUsed.has(pane));
});


// 将 PaneName 映射到用户友好的中文标签
const paneLabels = computed(() => ({
  connections: t('layout.pane.connections', '连接列表'),
  terminal: t('layout.pane.terminal', '终端'),
  commandBar: t('layout.pane.commandBar', '命令栏'),
  fileManager: t('layout.pane.fileManager', '文件管理器'),
  editor: t('layout.pane.editor', '编辑器'),
  statusMonitor: t('layout.pane.statusMonitor', '状态监视器'),
  commandHistory: t('layout.pane.commandHistory', '命令历史'),
  quickCommands: t('layout.pane.quickCommands', '快捷指令'),
  dockerManager: t('layout.pane.dockerManager', 'Docker 管理器'), // 添加 dockerManager
}));

// --- Methods ---
const closeDialog = () => {
  if (hasChanges.value) {
    if (confirm(t('layoutConfigurator.confirmClose', '有未保存的更改，确定要关闭吗？'))) {
      emit('close');
    }
  } else {
    emit('close');
  }
};

const saveLayout = () => {
  if (localLayoutTree.value) {
    layoutStore.updateLayoutTree(localLayoutTree.value);
    hasChanges.value = false;
    console.log('[LayoutConfigurator] 布局已保存到 Store。');
    emit('close'); // 保存后关闭
  } else {
    console.error('[LayoutConfigurator] 无法保存，本地布局树为空。');
  }
};

const resetToDefault = () => {
  if (confirm(t('layoutConfigurator.confirmReset', '确定要恢复默认布局吗？当前更改将丢失。'))) {
    // 重新调用 store 的初始化方法来获取默认布局
    layoutStore.initializeLayout();
    // 重新加载到本地副本
    if (layoutStore.layoutTree) {
      localLayoutTree.value = JSON.parse(JSON.stringify(layoutStore.layoutTree));
      hasChanges.value = true; // 标记为有更改，因为是重置操作
      console.log('[LayoutConfigurator] 已重置为默认布局。');
    }
  }
};

// --- Resizing Methods (Removed) ---
// Resizing functionality is removed to allow content-based sizing.

// --- Drag & Drop Methods (for panes, unchanged) ---
// 克隆函数：当从可用列表拖拽时，创建新的 LayoutNode 对象
const clonePane = (paneName: PaneName): LayoutNode => {
  console.log(`[LayoutConfigurator] 克隆面板: ${paneName}`);
  return {
    id: layoutStore.generateId(), // 使用 store 中的函数生成新 ID
    type: 'pane',
    component: paneName,
    size: 50, // 默认大小，可以后续调整
  };
};

// 移除旧的 handleDragStart
// const handleDragStart = (event: DragEvent, paneName: PaneName) => { ... }

// 移除旧的预览区域 drop/dragover 处理，由 LayoutNodeEditor 内部处理
// const handleDropOnPreview = (event: DragEvent) => { ... };
// const handleDragOverPreview = (event: DragEvent) => { ... };

// *** 新增：处理来自 LayoutNodeEditor 的更新事件 ***
const handleNodeUpdate = (updatedNode: LayoutNode) => {
  // 因为 LayoutNodeEditor 是直接操作 localLayoutTree 的副本，
  // 理论上 v-model 绑定应该能处理更新。
  // 但为了明确和处理可能的深层更新问题，我们直接替换根节点。
  // 注意：这假设 LayoutNodeEditor 只会 emit 根节点的更新事件，
  // 或者我们需要一个更复杂的查找和替换逻辑。
  // 简单的做法是，只要有更新，就认为整个 localLayoutTree 可能变了。
  // （vuedraggable 的 v-model 应该能处理大部分情况）
  // 暂时只打印日志，依赖 v-model 的更新
  console.log('[LayoutConfigurator] Received node update:', updatedNode);
  // 如果 v-model 更新不完全，可能需要手动更新：
  localLayoutTree.value = updatedNode; // 强制更新整个树
};

// *** 新增：处理来自 LayoutNodeEditor 的移除事件 ***
// 递归查找并移除指定索引的节点
function findAndRemoveNode(node: LayoutNode | null, parentNodeId: string | undefined, nodeIndex: number): LayoutNode | null {
  if (!node) return null;

  // 如果当前节点是目标节点的父节点
  if (node.id === parentNodeId && node.type === 'container' && node.children && node.children[nodeIndex]) {
    const updatedChildren = [...node.children];
    updatedChildren.splice(nodeIndex, 1);
     console.log(`[LayoutConfigurator] Removed node at index ${nodeIndex} from parent ${parentNodeId}`);
    // 如果移除后容器为空，可以选择移除容器自身，这里暂时保留空容器
    return { ...node, children: updatedChildren };
  }

  // 递归查找子节点
  if (node.type === 'container' && node.children) {
    const updatedChildren = node.children.map(child => findAndRemoveNode(child, parentNodeId, nodeIndex));
     // 检查是否有子节点被更新（即目标节点在更深层被找到并移除）
     if (updatedChildren.some((child, index) => child !== node.children![index])) {
       return { ...node, children: updatedChildren.filter(Boolean) as LayoutNode[] };
     }
  }

  return node; // 未找到或未修改，返回原节点
}

const handleNodeRemove = (payload: { parentNodeId: string | undefined; nodeIndex: number }) => {
  console.log('[LayoutConfigurator] Received node remove request:', payload);
  if (payload.parentNodeId === undefined && payload.nodeIndex === 0) {
     // 尝试移除根节点，不允许或清空布局
     if (confirm('确定要清空整个布局吗？')) {
       localLayoutTree.value = null; // 或者设置为空容器
     }
  } else if (payload.parentNodeId) {
     localLayoutTree.value = findAndRemoveNode(localLayoutTree.value, payload.parentNodeId, payload.nodeIndex);
  } else {
     console.warn('[LayoutConfigurator] Invalid remove payload:', payload);
  }
};


</script>

<template>
  <div v-if="isVisible" class="layout-configurator-overlay" @click.self="closeDialog">
    <!-- 移除 :style 绑定，尺寸和定位由 CSS 控制 -->
    <div ref="dialogRef" class="layout-configurator-dialog">
      <!-- Resize Handles Removed -->

      <header class="dialog-header">
        <h2>{{ t('layoutConfigurator.title', '配置工作区布局') }}</h2>
        <button class="close-button" @click="closeDialog" :title="t('common.close', '关闭')">&times;</button>
      </header>

      <main class="dialog-content">
        <section class="available-panes-section">
          <h3>{{ t('layoutConfigurator.availablePanes', '可用面板') }}</h3>
          <!-- *** 使用 draggable 包裹列表 *** -->
          <draggable
            :list="configuratorAvailablePanes"
            tag="ul"
            class="available-panes-list"
            :item-key="(element: PaneName) => element"
            :group="{ name: 'layout-items', pull: 'clone', put: false }"
            :sort="false"
            :clone="clonePane"
          >
            <template #item="{ element }: { element: PaneName }"> 
              <li
                class="available-pane-item"
              >
                <i class="fas fa-grip-vertical drag-handle"></i> 
                {{ paneLabels[element] || element }} 
              </li>
            </template>

             <template #footer>
               <li v-if="configuratorAvailablePanes.length === 0" class="no-available-panes"> <!-- *** 使用新的计算属性 *** -->
                 {{ t('layoutConfigurator.noAvailablePanes', '所有面板都已在布局中') }}
               </li>
             </template>
          </draggable>
        </section>

        <section
          class="layout-preview-section"
        >
          <h3>{{ t('layoutConfigurator.layoutPreview', '布局预览（拖拽到此处）') }}</h3>
          <div class="preview-area">
            <!-- *** 使用 LayoutNodeEditor 渲染预览 *** -->
            <LayoutNodeEditor
              v-if="localLayoutTree"
              :node="localLayoutTree"
              :parent-node="null"
              :node-index="0"
              :pane-labels="paneLabels"
              @update:node="handleNodeUpdate"
              @removeNode="handleNodeRemove"
            />
            <p v-else style="text-align: center; color: #aaa; margin-top: 50px;">
              {{ t('layoutConfigurator.emptyLayout', '布局为空，请从左侧拖拽面板或添加容器。') }}
            </p>
          </div>
          <div class="preview-actions">
             <button @click="resetToDefault" class="button-secondary">
               {{ t('layoutConfigurator.resetDefault', '恢复默认') }}
             </button>
             
           </div>
        </section>
      </main>

      <footer class="dialog-footer">
        <button @click="closeDialog" class="button-secondary">{{ t('common.cancel', '取消') }}</button>
        <button @click="saveLayout" class="button-primary" :disabled="!hasChanges">
          {{ t('common.save', '保存') }} {{ hasChanges ? '*' : '' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.layout-configurator-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  /* 使用 Flexbox 居中 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  /* 移除 pointer-events: none; */
}

.layout-configurator-dialog {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  /* 让宽度和高度自适应内容 */
  width: auto; /* 或移除 */
  height: auto; /* 或移除 */
  /* 添加最大/最小尺寸限制 */
  min-width: 500px; /* 根据需要调整 */
  min-height: 400px; /* 根据需要调整 */
  max-width: 90vw; /* 视口宽度的90% */
  max-height: 90vh; /* 视口高度的90% */
  display: flex;
  flex-direction: column;
  /* overflow: hidden; */ /* 改为 auto 或 visible 以允许内容撑开 */
  overflow: auto; /* 如果内容可能超出 max-height/max-width */
  position: relative; /* 改为 relative，因为 overlay flex 负责居中 */
  /* 移除 top, left, transform, position: absolute */
  /* 允许 dialog 接收点击事件 */
  pointer-events: auto;
  cursor: default; /* 保持默认光标 */
}

/* 移除 body.resizing 样式 */

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #eee;
  background-color: #f8f9fa;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.8rem;
  cursor: pointer;
  color: #aaa;
  line-height: 1;
  padding: 0;
}
.close-button:hover {
  color: #333;
}

.dialog-content {
  flex-grow: 1;
  padding: 1.5rem;
  overflow-y: auto; /* 允许内容区滚动 */
  display: flex; /* 左右布局 */
  gap: 1.5rem;
}

.available-panes-section {
  flex: 1; /* 占据一部分空间 */
  min-width: 200px;
  border-right: 1px solid #eee;
  padding-right: 1.5rem;
}

.layout-preview-section {
  flex: 2; /* 占据更多空间 */
  display: flex;
  flex-direction: column;
}

h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: #495057;
}

.available-panes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.available-pane-item {
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.5rem;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: grab;
  display: flex;
  align-items: center;
  transition: background-color 0.2s ease;
}
.available-pane-item:hover {
  background-color: #e9ecef;
}
.available-pane-item:active {
  cursor: grabbing;
  background-color: #ced4da;
}

.drag-handle {
  margin-right: 0.5rem;
  color: #adb5bd;
  cursor: grab;
}
.available-pane-item:active .drag-handle {
  cursor: grabbing;
}

.no-available-panes {
  color: #6c757d;
  font-style: italic;
  padding: 0.5rem 0;
}

.preview-area {
  flex-grow: 1;
  border: 2px dashed #ced4da;
  border-radius: 4px;
  padding: 1rem;
  background-color: #f8f9fa;
  min-height: 300px; /* 保证预览区有一定高度 */
  display: flex; /* 用于内部占位符居中 */
  flex-direction: column;
  /* justify-content: center; */ /* 移除，让内容从顶部开始 */
  /* align-items: center; */ /* 移除 */
  overflow: auto; /* 如果预览内容复杂，允许滚动 */
}

.preview-actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.5rem;
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  background-color: #f8f9fa;
}

/* 通用按钮样式 */
.button-primary,
.button-secondary {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease, opacity 0.2s ease;
}

.button-primary {
  background-color: #007bff;
  color: white;
}
.button-primary:hover {
  background-color: #0056b3;
}
.button-primary:disabled {
  background-color: #6c757d;
  opacity: 0.7;
  cursor: not-allowed;
}

.button-secondary {
  background-color: #e9ecef;
  color: #343a40;
  border: 1px solid #ced4da;
}
.button-secondary:hover {
  background-color: #dee2e6;
}


/* --- Resize Handle Styles (Removed) --- */

</style>
