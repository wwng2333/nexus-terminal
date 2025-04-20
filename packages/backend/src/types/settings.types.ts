// packages/backend/src/types/settings.types.ts

// Define PaneName here as it's logically related to layout/sidebar settings
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor' | 'commandHistory' | 'quickCommands' | 'dockerManager';

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