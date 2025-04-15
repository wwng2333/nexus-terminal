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
// --- 结束新增表结构定义 ---


export const runMigrations = async (db: Database): Promise<void> => {
    try {
        // 创建 settings 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createSettingsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 settings 表时出错: ${err.message}`));
                console.log('Settings 表已检查/创建。');
                resolve();
            });
        });

        // 插入默认的 IP 白名单设置
        await new Promise<void>((resolve, reject) => {
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('ipWhitelistEnabled', 'false')", (err: Error | null) => {
                if (err) return reject(new Error(`插入默认 ipWhitelistEnabled 设置时出错: ${err.message}`));
                console.log('默认 ipWhitelistEnabled 设置已插入。');
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('ipWhitelist', '')", (err: Error | null) => {
                if (err) return reject(new Error(`插入默认 ipWhitelist 设置时出错: ${err.message}`));
                console.log('默认 ipWhitelist 设置已插入。');
                resolve();
            });
        });

        // 创建 audit_logs 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createAuditLogsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 audit_logs 表时出错: ${err.message}`));
                console.log('Audit_Logs 表已检查/创建。');
                resolve();
            });
        });

        // 创建 api_keys 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createApiKeysTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 api_keys 表时出错: ${err.message}`));
                console.log('Api_Keys 表已检查/创建。');
                resolve();
            });
        });

        // 创建 passkeys 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createPasskeysTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 passkeys 表时出错: ${err.message}`));
                console.log('Passkeys 表已检查/创建。');
                resolve();
            });
        });

        // 创建 notification_settings 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createNotificationSettingsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 notification_settings 表时出错: ${err.message}`));
                console.log('Notification_Settings 表已检查/创建。');
                resolve();
            });
        });

        // --- 新增表创建逻辑 ---

        // 创建 users 表
        await new Promise<void>((resolve, reject) => {
            db.run(createUsersTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 users 表时出错: ${err.message}`));
                console.log('Users 表已检查/创建。');
                resolve();
            });
        });

        // 创建 proxies 表
        await new Promise<void>((resolve, reject) => {
            db.run(createProxiesTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 proxies 表时出错: ${err.message}`));
                console.log('Proxies 表已检查/创建。');
                resolve();
            });
        });

        // 创建 connections 表 (依赖 proxies)
        await new Promise<void>((resolve, reject) => {
            db.run(createConnectionsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 connections 表时出错: ${err.message}`));
                console.log('Connections 表已检查/创建。');
                resolve();
            });
        });

        // 创建 tags 表
        await new Promise<void>((resolve, reject) => {
            db.run(createTagsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 tags 表时出错: ${err.message}`));
                console.log('Tags 表已检查/创建。');
                resolve();
            });
        });

        // 创建 connection_tags 表 (依赖 connections, tags)
        await new Promise<void>((resolve, reject) => {
            db.run(createConnectionTagsTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 connection_tags 表时出错: ${err.message}`));
                console.log('Connection_Tags 表已检查/创建。');
                resolve();
            });
        });

        // 创建 ip_blacklist 表
        await new Promise<void>((resolve, reject) => {
            db.run(createIpBlacklistTableSQL, (err: Error | null) => {
                if (err) return reject(new Error(`创建 ip_blacklist 表时出错: ${err.message}`));
                console.log('Ip_Blacklist 表已检查/创建。');
                resolve();
            });
        });

        // --- 结束新增表创建逻辑 ---


        console.log('所有数据库迁移已完成。');
    } catch (error) {
        console.error('数据库迁移过程中出错:', error);
        throw error;
    }
};
