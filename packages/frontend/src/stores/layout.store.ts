import { defineStore } from 'pinia';
import { ref } from 'vue';

// 定义面板名称的类型，方便管理和引用 (添加 commandHistory)
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor' | 'commandHistory';

// 定义 Store
export const useLayoutStore = defineStore('layout', () => {
  // 使用 ref 创建响应式状态，存储每个面板的可见性 (添加 commandHistory)
  const paneVisibility = ref<Record<PaneName, boolean>>({
    connections: true,
    terminal: true,
    commandBar: true,
    fileManager: true,
    editor: true,
    statusMonitor: true,
    commandHistory: true, // 默认可见
  });

  // Action: 切换指定面板的可见性
  function togglePaneVisibility(paneName: PaneName) {
    if (paneVisibility.value[paneName] !== undefined) {
      paneVisibility.value[paneName] = !paneVisibility.value[paneName];
      console.log(`[Layout Store] Toggled visibility for ${paneName}: ${paneVisibility.value[paneName]}`);
    } else {
      console.warn(`[Layout Store] Attempted to toggle visibility for unknown pane: ${paneName}`);
    }
  }

  // Action: 设置指定面板的可见性
  function setPaneVisibility(paneName: PaneName, isVisible: boolean) {
    if (paneVisibility.value[paneName] !== undefined) {
      paneVisibility.value[paneName] = isVisible;
      console.log(`[Layout Store] Set visibility for ${paneName} to: ${isVisible}`);
    } else {
      console.warn(`[Layout Store] Attempted to set visibility for unknown pane: ${paneName}`);
    }
  }

  return {
    paneVisibility,
    togglePaneVisibility,
    setPaneVisibility,
  };
});
