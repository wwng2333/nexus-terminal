<script setup lang="ts">
import { ref, computed, watch, type Ref } from 'vue'; // Re-added computed
import { useI18n } from 'vue-i18n';
import { useLayoutStore, type LayoutNode, type PaneName } from '../stores/layout.store';
import draggable from 'vuedraggable';
import LayoutNodeEditor from './LayoutNodeEditor.vue';

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
const localLayoutTree: Ref<LayoutNode | null> = ref(null);
const hasChanges = ref(false);
const localSidebarPanes: Ref<{ left: PaneName[], right: PaneName[] }> = ref({ left: [], right: [] });
const localAvailablePanes: Ref<PaneName[]> = ref([]); // New state for available panes

// --- Dialog State ---
const dialogRef = ref<HTMLElement | null>(null);

// --- Watchers ---
watch(() => props.isVisible, (newValue) => {
  if (newValue) {
    // Load main layout
    if (layoutStore.layoutTree) {
      localLayoutTree.value = JSON.parse(JSON.stringify(layoutStore.layoutTree));
    } else {
      localLayoutTree.value = null; // Ensure it's null if store is null
    }
    // Load sidebar config
    if (layoutStore.sidebarPanes) {
      localSidebarPanes.value = JSON.parse(JSON.stringify(layoutStore.sidebarPanes));
    } else {
      localSidebarPanes.value = { left: [], right: [] }; // Default
    }
    // Initialize available panes: Always include non-terminal panes, include terminal only if not already used.
    const initialUsed = getAllLocalUsedPaneNames(localLayoutTree.value, localSidebarPanes.value);
    const nonTerminalPanes = layoutStore.allPossiblePanes.filter(p => p !== 'terminal');
    const available = [...nonTerminalPanes]; // Start with all non-terminal panes
    if (!initialUsed.has('terminal')) {
        // Add terminal only if it's not used in the current layout
        // Try to insert it at its original position for consistency
        const terminalOriginalIndex = layoutStore.allPossiblePanes.indexOf('terminal');
        let inserted = false;
        for (let i = 0; i < available.length; i++) {
             const currentPane = available[i];
             const currentOriginalIndex = layoutStore.allPossiblePanes.indexOf(currentPane);
             if (terminalOriginalIndex < currentOriginalIndex) {
                 available.splice(i, 0, 'terminal');
                 inserted = true;
                 break;
             }
        }
        if (!inserted) {
             available.push('terminal'); // Add to end if needed
        }
    }
    localAvailablePanes.value = available;

    hasChanges.value = false; // Reset changes flag on open
    console.log('[LayoutConfigurator] Dialog opened, initialized available panes (non-terminals always present).');
  } else {
    localLayoutTree.value = null; // Clear main layout
    localSidebarPanes.value = { left: [], right: [] }; // Clear sidebars
    localAvailablePanes.value = []; // Clear available panes
    console.log('[LayoutConfigurator] Dialog closed.');
  }
});

// Watch for changes in the main layout tree
watch(localLayoutTree, (newValue, oldValue) => {
  // Check if it's not the initial load and the dialog is visible
  if (oldValue !== undefined && oldValue !== null && props.isVisible) {
      // Use stringify for a simple deep comparison
      if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
          console.log('[LayoutConfigurator] Main layout tree changed.');
          hasChanges.value = true;
      }
  }
}, { deep: true });

// Watch for changes in the sidebar configuration
watch(localSidebarPanes, (newValue, oldValue) => {
   // Check if it's not the initial load and the dialog is visible
   if (oldValue !== undefined && props.isVisible) {
       const newJson = JSON.stringify(newValue);
       const oldJson = JSON.stringify(oldValue);
       console.log('[LayoutConfigurator Watcher] localSidebarPanes changed.');
       // Use stringify for a simple deep comparison, including order changes
       if (newJson !== oldJson) {
            console.log('[LayoutConfigurator Watcher] Sidebar panes changed, setting hasChanges.');
            hasChanges.value = true;
       }
   }
}, { deep: true });


// --- Helper Functions ---
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

function getAllLocalUsedPaneNames(mainNode: LayoutNode | null, sidebars: { left: PaneName[], right: PaneName[] }): Set<PaneName> {
  const usedNames = getMainLayoutUsedPaneNames(mainNode);
  sidebars.left.forEach(pane => usedNames.add(pane));
  sidebars.right.forEach(pane => usedNames.add(pane));
  return usedNames;
}

// Helper to add pane back to available list if not present
function addPaneToAvailableList(paneName: PaneName) {
   if (!localAvailablePanes.value.includes(paneName) && layoutStore.allPossiblePanes.includes(paneName)) {
       // Maintain original order if possible, otherwise just add
       // Find the original index in allPossiblePanes
       const originalIndex = layoutStore.allPossiblePanes.indexOf(paneName);
       let inserted = false;
       // Try to insert based on original order relative to existing available panes
       for (let i = 0; i < localAvailablePanes.value.length; i++) {
           const currentAvailablePane = localAvailablePanes.value[i];
           const currentOriginalIndex = layoutStore.allPossiblePanes.indexOf(currentAvailablePane);
           if (originalIndex < currentOriginalIndex) {
               localAvailablePanes.value.splice(i, 0, paneName);
               inserted = true;
               break;
           }
       }
       if (!inserted) {
            localAvailablePanes.value.push(paneName); // Add to end if no suitable spot found
       }
       console.log(`[LayoutConfigurator] Added '${paneName}' back to available panes.`);
   }
}

// --- Computed ---
// Panel Labels for display
const paneLabels = computed(() => ({ // Assuming labels might depend on i18n
  connections: t('layout.pane.connections', '连接列表'),
  terminal: t('layout.pane.terminal', '终端'),
  commandBar: t('layout.pane.commandBar', '命令栏'),
  fileManager: t('layout.pane.fileManager', '文件管理器'),
  editor: t('layout.pane.editor', '编辑器'),
  statusMonitor: t('layout.pane.statusMonitor', '状态监视器'),
  commandHistory: t('layout.pane.commandHistory', '命令历史'),
  quickCommands: t('layout.pane.quickCommands', '快捷指令'),
  dockerManager: t('layout.pane.dockerManager', 'Docker 管理器'),
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
  // Save main layout
  if (localLayoutTree.value) {
    layoutStore.updateLayoutTree(localLayoutTree.value);
    console.log('[LayoutConfigurator] Main layout saved to Store.');
  } else {
    // Handle potentially empty layout based on store logic
     layoutStore.updateLayoutTree(null); // Assuming null is valid for empty
    console.log('[LayoutConfigurator] Main layout is empty, saved null to Store.');
  }

  // Save sidebar config
  const sidebarConfigToSave = JSON.parse(JSON.stringify(localSidebarPanes.value));
  console.log('[LayoutConfigurator] Preparing to save sidebar config:', sidebarConfigToSave); // Log before sending
  layoutStore.updateSidebarPanes(sidebarConfigToSave);
  console.log('[LayoutConfigurator] Sidebar config sent to Store.');

  hasChanges.value = false;
  emit('close');
};

const resetToDefault = () => {
  if (confirm(t('layoutConfigurator.confirmReset', '确定要恢复默认布局和侧栏配置吗？当前更改将丢失。'))) {
    // Reset main layout
    const defaultLayout = layoutStore.getSystemDefaultLayout();
    localLayoutTree.value = JSON.parse(JSON.stringify(defaultLayout));

    // Reset sidebar config
    const defaultSidebarPanes = layoutStore.getSystemDefaultSidebarPanes();
    localSidebarPanes.value = JSON.parse(JSON.stringify(defaultSidebarPanes));

    // Reset available panes using the new logic
    const defaultUsed = getAllLocalUsedPaneNames(localLayoutTree.value, localSidebarPanes.value);
    const nonTerminalPanesDefault = layoutStore.allPossiblePanes.filter(p => p !== 'terminal');
    const availableDefault = [...nonTerminalPanesDefault];
    if (!defaultUsed.has('terminal')) {
        const terminalOriginalIndex = layoutStore.allPossiblePanes.indexOf('terminal');
         let inserted = false;
        for (let i = 0; i < availableDefault.length; i++) {
             const currentPane = availableDefault[i];
             const currentOriginalIndex = layoutStore.allPossiblePanes.indexOf(currentPane);
             if (terminalOriginalIndex < currentOriginalIndex) {
                 availableDefault.splice(i, 0, 'terminal');
                 inserted = true;
                 break;
             }
        }
         if (!inserted) {
             availableDefault.push('terminal');
         }
    }
     localAvailablePanes.value = availableDefault;

    console.log('[LayoutConfigurator] Reset to default layout, sidebar panes, and available panes (non-terminals always present).');
    hasChanges.value = true; // Mark as changed after reset
  }
};

// Clone function for dragging available panes
const clonePane = (paneName: PaneName): LayoutNode => {
  console.log(`[LayoutConfigurator] Cloning pane: ${paneName}`);
  return {
    id: layoutStore.generateId(),
    type: 'pane',
    component: paneName,
    size: 50, // Default size, can be adjusted later
  };
};

// Handle updates from LayoutNodeEditor (for main layout)
const handleNodeUpdate = (updatedNode: LayoutNode) => {
  console.log('[LayoutConfigurator] Received node update from editor:', updatedNode);
  // Assuming the update is for the root node for simplicity
  // v-model on LayoutNodeEditor might handle this, but explicit update is safer
  localLayoutTree.value = updatedNode;
  // No need to set hasChanges here, the watcher on localLayoutTree handles it
};

// Handle remove requests from LayoutNodeEditor (for main layout) - CORRECTED VERSION
function findAndRemoveNode(node: LayoutNode | null, parentNodeId: string | undefined, nodeIndex: number): LayoutNode | null {
    if (!node) return null;

    // Case 1: Found the parent container
    if (node.id === parentNodeId && node.type === 'container' && node.children && node.children[nodeIndex]) {
        const updatedChildren = [...node.children];
        const removedNode = updatedChildren.splice(nodeIndex, 1)[0]; // Remove and get the node
        console.log(`[LayoutConfigurator] Removing node at index ${nodeIndex} from parent ${parentNodeId}`);

        // Add the pane back to available list if it was a pane node
        if (removedNode.type === 'pane' && removedNode.component) {
            addPaneToAvailableList(removedNode.component);
        }
        // If the removed node was a container, recursively add its children back
        else if (removedNode.type === 'container') { // Check type directly
             function addPanesFromContainer(containerNode: LayoutNode | null) { // Accept null
                 if (!containerNode || !containerNode.children) return; // Guard against null/undefined children
                 containerNode.children.forEach(child => {
                     if (child.type === 'pane' && child.component) {
                         addPaneToAvailableList(child.component);
                     } else if (child.type === 'container') {
                         addPanesFromContainer(child); // Recurse into nested containers
                     }
                 });
             }
             addPanesFromContainer(removedNode);
        }
        return { ...node, children: updatedChildren };
    }

    // Case 2: Traverse deeper
    if (node.type === 'container' && node.children) {
        const updatedChildren = node.children.map(child => findAndRemoveNode(child, parentNodeId, nodeIndex));
        // Check if any child subtree was modified
        if (updatedChildren.some((child, index) => child !== node.children![index])) {
            return { ...node, children: updatedChildren.filter(Boolean) as LayoutNode[] };
        }
    }

    // Case 3: No match or not a container
    return node;
}

// CORRECTED handleNodeRemove
const handleNodeRemove = (payload: { parentNodeId: string | undefined; nodeIndex: number }) => {
  console.log('[LayoutConfigurator] Received node remove request:', payload);
  if (payload.parentNodeId === undefined && payload.nodeIndex === 0) {
     if (confirm(t('layoutConfigurator.confirmClearLayout', '确定要清空整个布局吗？所有面板将返回可用列表。'))) {
       // Add all panes from the tree back to available list before clearing
       const usedInTree = getMainLayoutUsedPaneNames(localLayoutTree.value); // Single declaration
       usedInTree.forEach(paneName => addPaneToAvailableList(paneName)); // Correctly call the helper
       // Clear the tree
       localLayoutTree.value = null;
     }
  } else if (payload.parentNodeId) {
     localLayoutTree.value = findAndRemoveNode(localLayoutTree.value, payload.parentNodeId, payload.nodeIndex);
     // Watcher on localLayoutTree handles hasChanges
  } else {
     console.warn('[LayoutConfigurator] Invalid remove payload:', payload);
  }
};

// Remove pane from sidebar list
const removeSidebarPane = (side: 'left' | 'right', index: number) => {
   const removedPane = localSidebarPanes.value[side].splice(index, 1)[0]; // Remove and get pane name
   if (removedPane) {
       console.log(`[LayoutConfigurator] Removed pane '${removedPane}' from ${side} sidebar at index ${index}.`);
       addPaneToAvailableList(removedPane); // Correctly call the helper
   }
   // Explicitly set hasChanges flag (watcher might not catch splice reliably?)
   hasChanges.value = true;
};

// Handler for vuedraggable end event to ensure changes flag is set and handle added items
const onDraggableChange = (event: any, side: 'left' | 'right') => { // Add side parameter
    console.log(`[LayoutConfigurator] Draggable change event detected on ${side} sidebar:`, event);

    // Check if an element was added to the sidebar list
    if (event.added) {
        const addedElement = event.added.element;
        const targetList = localSidebarPanes.value[side]; // Use the side parameter directly
        const addedIndex = event.added.newIndex;

        // Check if the added element is a LayoutNode object (dragged from available panes)
        if (targetList && typeof addedElement === 'object' && addedElement !== null && addedElement.type === 'pane' && typeof addedElement.component === 'string') {
            // Replace the added LayoutNode object with its component name (PaneName)
            targetList.splice(addedIndex, 1, addedElement.component);
            console.log(`[LayoutConfigurator] Replaced added LayoutNode at index ${addedIndex} on ${side} sidebar with PaneName: ${addedElement.component}`);
        } else {
             console.log(`[LayoutConfigurator] Added event detected on ${side} sidebar, but element was not a LayoutNode:`, addedElement);
        }
    } else if (event.moved || event.removed) {
         console.log(`[LayoutConfigurator] Item moved or removed within/from ${side} sidebar.`);
    }

    // Ensure changes flag is set for any modification (add, remove, move)
    hasChanges.value = true;
};

// Handle drag end from the available panes list
const handleAvailablePaneDragEnd = (event: any) => {
   // Check if the item was dropped into a different list (main layout or sidebars)
   if (event.to !== event.from) {
       // Find the component (Draggable) associated with the source item element
       // This might rely on internal structure, adjust if needed or find a better way
       const draggedItemElement = event.item; // The original element in the source list
       let paneName: PaneName | null = null;

       // Attempt to get data via Vue's internal context (might be unstable)
       // Note: __draggable_component__ might not be reliable across versions. Consider data attributes if this fails.
       if ((draggedItemElement as any)?.__draggable_component__?.context?.element) {
            paneName = (draggedItemElement as any).__draggable_component__.context.element as PaneName;
       } else {
            // Fallback: Try getting from the data array using oldIndex if context fails
            if (event.oldIndex !== undefined && localAvailablePanes.value[event.oldIndex]) {
                paneName = localAvailablePanes.value[event.oldIndex];
                console.warn("[LayoutConfigurator] Using index fallback to get pane name in drag end.");
            }
       }


       if (paneName === 'terminal') {
            console.log('[LayoutConfigurator] "terminal" pane dropped elsewhere. Removing from available list.');
            // Find the precise index in the *current* state of localAvailablePanes, as it might have shifted
            const currentIndex = localAvailablePanes.value.indexOf('terminal');
            if (currentIndex > -1) {
                localAvailablePanes.value.splice(currentIndex, 1);
            } else {
                 console.warn('[LayoutConfigurator] Could not find "terminal" in available list to remove after drag.');
            }
       } else if (paneName) {
            console.log(`[LayoutConfigurator] Non-terminal pane "${paneName}" dropped elsewhere. Kept in available list (clone).`);
            // Do nothing, item remains in localAvailablePanes
       } else {
            console.error('[LayoutConfigurator] Could not determine dragged pane name in handleAvailablePaneDragEnd.');
       }
   } else {
        console.log('[LayoutConfigurator] Item dropped back into available list or drag cancelled.');
   }
};

</script>

<template>
  <div v-if="isVisible" class="layout-configurator-overlay" @click.self="closeDialog">
    <div ref="dialogRef" class="layout-configurator-dialog">

      <header class="dialog-header">
        <h2>{{ t('layoutConfigurator.title', '配置工作区布局') }}</h2>
        <button class="close-button" @click="closeDialog" :title="t('common.close', '关闭')">&times;</button>
      </header>

      <!-- Grid Layout -->
      <main class="dialog-content-grid">

        <!-- Available Panes -->
        <section class="available-panes-section">
          <h3>{{ t('layoutConfigurator.availablePanes', '可用面板') }}</h3>
          <draggable
            :list="localAvailablePanes"
            tag="ul"
            class="available-panes-list"
            @end="handleAvailablePaneDragEnd"
            :item-key="(element: PaneName) => element"
            :group="{ name: 'layout-items', pull: 'clone', put: false }"
            :sort="false"
            :clone="clonePane"
          >
            <template #item="{ element }: { element: PaneName }">
              <li class="available-pane-item">
                <i class="fas fa-grip-vertical drag-handle"></i>
                {{ paneLabels[element] || element }}
              </li>
            </template>
            <template #footer>
              <li v-if="localAvailablePanes.length === 0" class="no-available-panes">
                {{ t('layoutConfigurator.noAvailablePanes', '所有面板都已在布局中') }}
              </li>
            </template>
          </draggable>
        </section>

        <!-- Main Layout Preview -->
        <section class="layout-preview-section">
          <h3>{{ t('layoutConfigurator.layoutPreview', '主布局预览（拖拽到此处）') }}</h3>
          <div class="preview-area main-layout-area">
            <LayoutNodeEditor
              v-if="localLayoutTree"
              :node="localLayoutTree"
              :parent-node="null"
              :node-index="0"
              :pane-labels="paneLabels"
              @update:node="handleNodeUpdate"
              @removeNode="handleNodeRemove"
              :group="'layout-items'"
            />
            <p v-else class="empty-placeholder">
              {{ t('layoutConfigurator.emptyLayout', '布局为空，请从左侧拖拽面板或添加容器。') }}
            </p>
          </div>
          <div class="preview-actions">
             <button @click="resetToDefault" class="button-secondary">
               {{ t('layoutConfigurator.resetDefault', '恢复默认') }}
             </button>
           </div>
        </section>

        <!-- Sidebar Configuration Container -->
        <div class="sidebar-container">
            <!-- Left Sidebar Config -->
            <section class="sidebar-config-section left-sidebar-section">
                <h3>{{ t('layoutConfigurator.leftSidebar', '左侧栏面板') }}</h3>
                <draggable
                    :list="localSidebarPanes.left"
                    tag="ul"
                    class="sidebar-panes-list"
                    :item-key="(element: PaneName) => `left-${element}`"
                    group="layout-items"
                    :sort="true"
                    @change="(event) => onDraggableChange(event, 'left')"
                >
                    <template #item="{ element, index }: { element: PaneName, index: number }">
                        <li class="sidebar-pane-item">
                            <i class="fas fa-grip-vertical drag-handle"></i>
                            <!-- Correctly display translated label -->
                            <span>{{ paneLabels[element] || element }}</span>
                            <button @click="removeSidebarPane('left', index)" class="remove-sidebar-btn" :title="t('common.remove', '移除')">&times;</button>
                        </li>
                    </template>
                    <template #footer>
                        <li v-if="localSidebarPanes.left.length === 0" class="empty-placeholder sidebar-empty">
                            {{ t('layoutConfigurator.dropHere', '从可用面板拖拽到此处') }}
                        </li>
                    </template>
                </draggable>
            </section>

            <!-- Right Sidebar Config -->
            <section class="sidebar-config-section right-sidebar-section">
                <h3>{{ t('layoutConfigurator.rightSidebar', '右侧栏面板') }}</h3>
                 <draggable
                    :list="localSidebarPanes.right"
                    tag="ul"
                    class="sidebar-panes-list"
                    :item-key="(element: PaneName) => `right-${element}`"
                    group="layout-items"
                    :sort="true"
                    @change="(event) => onDraggableChange(event, 'right')"
                >
                    <template #item="{ element, index }: { element: PaneName, index: number }">
                         <li class="sidebar-pane-item">
                            <i class="fas fa-grip-vertical drag-handle"></i>
                            <!-- Correctly display translated label -->
                            <span>{{ paneLabels[element] || element }}</span>
                            <button @click="removeSidebarPane('right', index)" class="remove-sidebar-btn" :title="t('common.remove', '移除')">&times;</button>
                        </li>
                    </template>
                     <template #footer>
                        <li v-if="localSidebarPanes.right.length === 0" class="empty-placeholder sidebar-empty">
                             {{ t('layoutConfigurator.dropHere', '从可用面板拖拽到此处') }}
                        </li>
                    </template>
                </draggable>
            </section>
        </div>

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
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.layout-configurator-dialog {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  width: auto;
  height: auto;
  min-width: 800px; /* Adjusted min-width */
  min-height: 600px; /* Adjusted min-height */
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: auto;
  position: relative;
  pointer-events: auto;
  cursor: default;
}

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

/* Grid Layout for Dialog Content */
.dialog-content-grid {
  flex-grow: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "available main"
    "available sidebars";
  gap: 1.5rem;
  min-height: 450px;
}

.available-panes-section {
  grid-area: available;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-right: 1px solid #eee;
  padding-right: 1.5rem;
  min-width: 200px; /* Ensure minimum width */
}

.layout-preview-section {
  grid-area: main;
  display: flex;
  flex-direction: column;
  min-width: 350px;
  min-height: 250px;
}

.sidebar-container {
   grid-area: sidebars;
   display: grid;
   grid-template-columns: 1fr 1fr;
   gap: 1.5rem;
   border-top: 1px solid #eee;
   padding-top: 1rem;
   margin-top: 1rem;
   min-height: 150px;
}

.sidebar-config-section {
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
  flex-grow: 1; /* Allow list to take available space */
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

.preview-area.main-layout-area {
  flex-grow: 1;
  border: 2px dashed #ced4da;
  border-radius: 4px;
  padding: 1rem;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  overflow: auto;
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

/* Button Styles */
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

/* Sidebar List Styles */
.sidebar-panes-list {
    list-style: none;
    padding: 0;
    margin: 0;
    min-height: 120px;
    background-color: #f8f9fa;
    border: 1px dashed #ced4da;
    border-radius: 4px;
    padding: 0.5rem;
    flex-grow: 1;
    overflow-y: auto;
}

.sidebar-pane-item {
    padding: 0.5rem 0.8rem;
    margin-bottom: 0.5rem;
    background-color: #e9ecef;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background-color 0.2s ease;
}
.sidebar-pane-item:hover {
    background-color: #d8dde2;
}
.sidebar-pane-item:active {
    cursor: grabbing;
    background-color: #ced4da;
}

.sidebar-pane-item .drag-handle {
    margin-right: 0.5rem;
    color: #6c757d;
    cursor: grab;
}
.sidebar-pane-item:active .drag-handle {
    cursor: grabbing;
}
/* Ensure text span takes available space */
.sidebar-pane-item span {
    flex-grow: 1; /* Allow text to take space */
    margin-right: 0.5rem; /* Space before remove button */
    overflow: hidden; /* Prevent long text overflow */
    text-overflow: ellipsis;
    white-space: nowrap;
}


.remove-sidebar-btn {
    background: none;
    border: none;
    color: #adb5bd;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 0.3rem;
    line-height: 1;
    flex-shrink: 0; /* Prevent button from shrinking */
}
.remove-sidebar-btn:hover {
    color: #dc3545; /* Red on hover */
}

.empty-placeholder {
    text-align: center;
    color: #aaa;
    padding: 2rem 1rem;
    font-style: italic;
    font-size: 0.9em;
    width: 100%;
}
.sidebar-empty {
    padding: 1rem;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
}

</style>
