// 定义审计日志记录的操作类型
export type AuditLogActionType =
  // Authentication
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | '2FA_ENABLED'
  | '2FA_DISABLED'
  | 'PASSKEY_REGISTERED'
  | 'PASSKEY_DELETED' // Assuming deletion is possible later

  // Connections
  | 'CONNECTION_CREATED'
  | 'CONNECTION_UPDATED'
  | 'CONNECTION_DELETED'
  | 'CONNECTION_TESTED' // Maybe log test attempts?
  | 'CONNECTIONS_IMPORTED'
  | 'CONNECTIONS_EXPORTED'

  // Proxies
  | 'PROXY_CREATED'
  | 'PROXY_UPDATED'
  | 'PROXY_DELETED'

  // Tags
  | 'TAG_CREATED'
  | 'TAG_UPDATED'
  | 'TAG_DELETED'

  // Settings
  | 'SETTINGS_UPDATED' // General settings update
  | 'IP_WHITELIST_UPDATED' // Specific setting update
  | 'FOCUS_SWITCHER_SEQUENCE_UPDATED' // +++ 新增：焦点切换顺序更新 +++

  // Notifications
  | 'NOTIFICATION_SETTING_CREATED'
  | 'NOTIFICATION_SETTING_UPDATED'
  | 'NOTIFICATION_SETTING_DELETED'

  // API Keys
  | 'API_KEY_CREATED'
  | 'API_KEY_DELETED'

  // SFTP (Consider logging specific actions if needed, e.g., UPLOAD, DOWNLOAD, DELETE_FILE)
  | 'SFTP_ACTION' // Generic SFTP action for now

  // SSH Actions (via WebSocket)
  | 'SSH_CONNECT_SUCCESS'
  | 'SSH_CONNECT_FAILURE'
  | 'SSH_SHELL_FAILURE'

  // System/Error
  | 'SERVER_STARTED'
  | 'SERVER_ERROR' // Log significant backend errors
  | 'DATABASE_MIGRATION'
  | 'ADMIN_SETUP_COMPLETE'; // *** 新增：初始管理员设置完成 ***

// 审计日志条目的结构 (从数据库读取时)
export interface AuditLogEntry {
    id: number;
    timestamp: number; // Unix timestamp (seconds)
    action_type: AuditLogActionType;
    details: string | null; // JSON string or null
}

// 用于创建日志条目的数据结构
export interface AuditLogData {
    actionType: AuditLogActionType;
    details?: Record<string, any> | string | null;
}
