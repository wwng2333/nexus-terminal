import { Database } from 'sqlite3';
import { getDb } from './database';

const createSettingsTableSQL = `
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

const createAuditLogsTableSQL = `
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    details TEXT NULL
);
`;

const createApiKeysTableSQL = `
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hashed_key TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
);
`;

const createPasskeysTableSQL = `
CREATE TABLE IF NOT EXISTS passkeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT UNIQUE NOT NULL, -- Base64URL encoded
    public_key TEXT NOT NULL,          -- Base64URL encoded
    counter INTEGER NOT NULL,
    transports TEXT,                   -- JSON array as string, e.g., '["internal", "usb"]'
    name TEXT,                         -- User-provided name for the key
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

const createNotificationSettingsTableSQL = `
CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_type TEXT NOT NULL CHECK(channel_type IN ('webhook', 'email', 'telegram')),
    name TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT false,
    config TEXT NOT NULL DEFAULT '{}', -- JSON string for channel-specific config
    enabled_events TEXT NOT NULL DEFAULT '[]', -- JSON array of event names
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

// --- 新增表结构定义 ---

const createUsersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    two_factor_secret TEXT NULL, -- 添加 2FA 密钥列，允许为空
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

const createProxiesTableSQL = `
CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SOCKS5', 'HTTP')),
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NULL,
    auth_method TEXT NOT NULL DEFAULT 'none' CHECK(auth_method IN ('none', 'password', 'key')),
    encrypted_password TEXT NULL,
    encrypted_private_key TEXT NULL,
    encrypted_passphrase TEXT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(name, type, host, port)
);
`;

const createConnectionsTableSQL = `
CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NULL, -- 允许 name 为空
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    auth_method TEXT NOT NULL CHECK(auth_method IN ('password', 'key')),
    encrypted_password TEXT NULL,
    encrypted_private_key TEXT NULL,
    encrypted_passphrase TEXT NULL,
    proxy_id INTEGER NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_connected_at INTEGER NULL,
    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL
);
`;

const createTagsTableSQL = `
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

const createConnectionTagsTableSQL = `
CREATE TABLE IF NOT EXISTS connection_tags (
    connection_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (connection_id, tag_id),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
`;

const createIpBlacklistTableSQL = `
CREATE TABLE IF NOT EXISTS ip_blacklist (
    ip TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    last_attempt_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    blocked_until INTEGER NULL -- 封禁截止时间戳 (秒)，NULL 表示未封禁或永久封禁 (根据逻辑决定)
);
`;

const createCommandHistoryTableSQL = `
CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;

const createQuickCommandsTableSQL = `
CREATE TABLE IF NOT EXISTS quick_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NULL, -- 名称可选
    command TEXT NOT NULL, -- 指令必选
    usage_count INTEGER NOT NULL DEFAULT 0, -- 使用频率
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
`;
// --- 结束新增表结构定义 ---


export const runMigrations = (db: Database): Promise<void> => {
    // 使用 Promise 包装 serialize，以便在所有操作完成后解析
    return new Promise<void>((resolveOuter, rejectOuter) => {
        db.serialize(() => {
            // 定义一个统一的错误处理函数
            const handleError = (operation: string, err: Error | null) => {
                if (err) {
                    const errorMsg = `${operation} 时出错: ${err.message}`;
                    console.error(errorMsg);
                    // 停止序列并拒绝外部 Promise
                    rejectOuter(new Error(errorMsg));
                    return true; // 表示有错误发生
                }
                return false; // 表示没有错误
            };

            // 创建 settings 表
            db.run(createSettingsTableSQL, (err: Error | null) => {
                if (handleError('创建 settings 表', err)) return;
                console.log('Settings 表已检查/创建。');
            });

            // 插入默认的 IP 白名单设置 (使用 INSERT OR IGNORE)
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('ipWhitelistEnabled', 'false')", (err: Error | null) => {
                // 对于 INSERT OR IGNORE，即使发生 UNIQUE constraint 错误，err 也可能为 null 或特定错误
                // 但 SQLITE_BUSY 是需要处理的
                if (err && (err as any).code !== 'SQLITE_CONSTRAINT') { // 忽略约束错误，处理其他错误
                   if (handleError('插入默认 ipWhitelistEnabled 设置', err)) return;
                } else if (err && (err as any).code === 'SQLITE_CONSTRAINT') {
                    console.log('默认 ipWhitelistEnabled 设置已存在，跳过插入。');
                } else {
                    console.log('默认 ipWhitelistEnabled 设置已插入或已存在。');
                }
            });

            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('ipWhitelist', '')", (err: Error | null) => {
                 if (err && (err as any).code !== 'SQLITE_CONSTRAINT') {
                    if (handleError('插入默认 ipWhitelist 设置', err)) return;
                 } else if (err && (err as any).code === 'SQLITE_CONSTRAINT') {
                    console.log('默认 ipWhitelist 设置已存在，跳过插入。');
                 } else {
                    console.log('默认 ipWhitelist 设置已插入或已存在。');
                 }
            });

            // 创建 audit_logs 表
            db.run(createAuditLogsTableSQL, (err: Error | null) => {
                if (handleError('创建 audit_logs 表', err)) return;
                console.log('Audit_Logs 表已检查/创建。');
            });

            // 创建 api_keys 表
            db.run(createApiKeysTableSQL, (err: Error | null) => {
                if (handleError('创建 api_keys 表', err)) return;
                console.log('Api_Keys 表已检查/创建。');
            });

            // 创建 passkeys 表
            db.run(createPasskeysTableSQL, (err: Error | null) => {
                if (handleError('创建 passkeys 表', err)) return;
                console.log('Passkeys 表已检查/创建。');
            });

            // 创建 notification_settings 表
            db.run(createNotificationSettingsTableSQL, (err: Error | null) => {
                if (handleError('创建 notification_settings 表', err)) return;
                console.log('Notification_Settings 表已检查/创建。');
            });

            // --- 新增表创建逻辑 ---

            // 创建 users 表
            db.run(createUsersTableSQL, (err: Error | null) => {
                if (handleError('创建 users 表', err)) return;
                console.log('Users 表已检查/创建。');
            });

            // 创建 proxies 表
            db.run(createProxiesTableSQL, (err: Error | null) => {
                if (handleError('创建 proxies 表', err)) return;
                console.log('Proxies 表已检查/创建。');
            });

            // 创建 connections 表
            db.run(createConnectionsTableSQL, (err: Error | null) => {
                if (handleError('创建 connections 表', err)) return;
                console.log('Connections 表已检查/创建。');
            });

            // 创建 tags 表
            db.run(createTagsTableSQL, (err: Error | null) => {
                if (handleError('创建 tags 表', err)) return;
                console.log('Tags 表已检查/创建。');
            });

            // 创建 connection_tags 表
            db.run(createConnectionTagsTableSQL, (err: Error | null) => {
                if (handleError('创建 connection_tags 表', err)) return;
                console.log('Connection_Tags 表已检查/创建。');
            });

            // 创建 ip_blacklist 表
            db.run(createIpBlacklistTableSQL, (err: Error | null) => {
                if (handleError('创建 ip_blacklist 表', err)) return;
                console.log('Ip_Blacklist 表已检查/创建。');
            });

            // 创建 command_history 表
            db.run(createCommandHistoryTableSQL, (err: Error | null) => {
                if (handleError('创建 command_history 表', err)) return;
                console.log('Command_History 表已检查/创建。');
            });

            // 创建 quick_commands 表 - 这是最后一个操作
            db.run(createQuickCommandsTableSQL, (err: Error | null) => {
                if (handleError('创建 quick_commands 表', err)) {
                    // 如果最后一个操作失败，serialize 会停止，rejectOuter 已被调用
                    return;
                }
                console.log('Quick_Commands 表已检查/创建。');

                // 所有操作成功完成
                console.log('所有数据库迁移已成功完成。');
                resolveOuter(); // 解析外部 Promise
            });

            // --- 结束新增表创建逻辑 ---

        }); // 结束 db.serialize
    }); // 结束 new Promise
};
