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

        console.log('所有数据库迁移已完成。');
    } catch (error) {
        console.error('数据库迁移过程中出错:', error);
        throw error;
    }
};
