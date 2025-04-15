export type NotificationChannelType = 'webhook' | 'email' | 'telegram';

export type NotificationEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'CONNECTION_ADDED'
  | 'CONNECTION_UPDATED'
  | 'CONNECTION_DELETED'
  | 'SETTINGS_UPDATED'
  | 'PROXY_ADDED'
  | 'PROXY_UPDATED'
  | 'PROXY_DELETED'
  | 'TAG_ADDED'
  | 'TAG_UPDATED'
  | 'TAG_DELETED'
  | 'API_KEY_ADDED'
  | 'API_KEY_DELETED'
  | 'PASSKEY_ADDED'
  | 'PASSKEY_DELETED'
  | 'SERVER_ERROR'; // Generic error event

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'GET' | 'PUT'; // Default to POST
  headers?: Record<string, string>; // Optional custom headers
  bodyTemplate?: string; // Optional template for the request body (e.g., using placeholders like {{event}}, {{details}})
}

export interface EmailConfig {
  to: string; // Comma-separated list of recipient emails
  subjectTemplate?: string; // Optional subject template
  // SMTP settings per channel
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean; // Use TLS
  smtpUser?: string;
  smtpPass?: string; // Consider encryption or secure storage
  from?: string; // Sender email address
}

export interface TelegramConfig {
  botToken: string; // Consider storing this securely, maybe encrypted or via env vars
  chatId: string; // Target chat ID
  messageTemplate?: string; // Optional message template
}

export type NotificationChannelConfig = WebhookConfig | EmailConfig | TelegramConfig;

export interface NotificationSetting {
  id?: number;
  channel_type: NotificationChannelType;
  name: string;
  enabled: boolean;
  config: NotificationChannelConfig; // Parsed JSON config
  enabled_events: NotificationEvent[]; // Parsed JSON array
  created_at?: number | string;
  updated_at?: number | string;
}

// Raw data structure from the database before parsing JSON fields
export interface RawNotificationSetting {
    id: number;
    channel_type: NotificationChannelType;
    name: string;
    enabled: number; // SQLite stores BOOLEAN as 0 or 1
    config: string; // JSON string
    enabled_events: string; // JSON string
    created_at: number | string;
    updated_at: number | string;
}

// Type for the data sent with a notification event
export interface NotificationPayload {
    event: NotificationEvent;
    timestamp: number;
    details?: Record<string, any> | string; // Contextual information about the event
}
