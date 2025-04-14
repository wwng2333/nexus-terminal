import { Database } from 'sqlite3';
import { getDb } from './database';

const createUsersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    two_factor_secret TEXT NULL, -- 2FA 密钥占位符
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
`;

// MVP (最小可行产品) 阶段: 只包含基础字段，支持密码认证，暂不考虑代理和标签
const createConnectionsTableSQL = `
CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_method TEXT NOT NULL CHECK(auth_method IN ('password')), -- MVP 阶段仅支持密码认证
    encrypted_password TEXT NULL, -- 加密存储的密码占位符 (加密逻辑在应用层实现)
    -- encrypted_private_key TEXT NULL, -- MVP 阶段跳过密钥认证相关字段
    -- encrypted_passphrase TEXT NULL, -- MVP 阶段跳过密钥认证相关字段
    -- proxy_id INTEGER NULL, -- MVP 阶段跳过代理相关字段
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_connected_at INTEGER NULL
);
`;

// 未来可能需要的其他表 (根据项目文档)
// const createProxiesTableSQL = \`...\`; // 代理表
// const createTagsTableSQL = \`...\`; // 标签表
// const createConnectionTagsTableSQL = \`...\`; // 连接与标签的关联表
// const createSettingsTableSQL = \`...\`; // 设置表
// const createAuditLogsTableSQL = \`...\`; // 审计日志表
// const createApiKeysTableSQL = \`...\`; // API 密钥表

/**
 * 执行数据库迁移 (创建表)
 * @param db - 数据库实例
 * @returns Promise，在所有迁移完成后 resolve
 */
export const runMigrations = (db: Database): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(createUsersTableSQL, (err) => {
                if (err) {
                    console.error('创建 users 表时出错:', err.message);
                    return reject(err);
                }
                console.log('Users 表已检查/创建。');
            });

            db.run(createConnectionsTableSQL, (err) => {
                if (err) {
                    console.error('创建 connections 表时出错:', err.message);
                    return reject(err);
                }
                console.log('Connections 表已检查/创建。');
                resolve(); // 所有表创建完成后 resolve Promise
            });

            // 如果未来添加了更多表，在此处继续链式调用 db.run(...)
            // db.run(createProxiesTableSQL, callback);
        });
    });
};

// 允许通过命令行直接运行此文件来执行迁移 (例如: node dist/migrations.js)
if (require.main === module) {
    const db = getDb();
    runMigrations(db)
        .then(() => {
            console.log('数据库迁移执行成功。');
            // 如果是独立运行，可以选择关闭数据库连接，但在应用启动流程中通常不需要
            // db.close();
        })
        .catch((err) => {
            console.error('数据库迁移执行失败:', err);
            process.exit(1);
        });
}
