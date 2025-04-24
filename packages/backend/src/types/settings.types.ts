// packages/backend/src/types/settings.types.ts

// Define PaneName here as it's logically related to layout/sidebar settings
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor' | 'commandHistory' | 'quickCommands' | 'dockerManager';

/**
 * 布局节点接口 (Mirrors frontend definition for backend use)
 */
export interface LayoutNode {
  id: string; // 唯一 ID (Note: Backend might not always use/store this)
  type: 'pane' | 'container'; // 节点类型：面板或容器
  component?: PaneName; // 如果 type 是 'pane'，指定要渲染的组件
  direction?: 'horizontal' | 'vertical'; // 如果 type 是 'container'，指定分割方向
  children?: LayoutNode[]; // 如果 type 是 'container'，包含子节点数组
  size?: number; // 节点在父容器中的大小比例 (例如 20, 50, 30)
}

/**
 * 侧栏配置数据结构 (Managed by Settings Repository/Service)
 */
export interface SidebarConfig {
    left: PaneName[];
    right: PaneName[];
}

/**
 * 用于更新侧栏配置的 DTO
 */
export interface UpdateSidebarConfigDto extends SidebarConfig {} // Simple alias for now, can add validation later

// You can add other settings-related types here if needed