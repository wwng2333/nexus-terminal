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

// 更新后的 Schema，支持密码和密钥认证
const createConnectionsTableSQL = `
CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_method TEXT NOT NULL CHECK(auth_method IN ('password', 'key')), -- 更新 CHECK 约束
    encrypted_password TEXT NULL,
    encrypted_private_key TEXT NULL,
    encrypted_passphrase TEXT NULL,
    proxy_id INTEGER NULL, -- 新增：关联的代理 ID
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_connected_at INTEGER NULL,
    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL -- 设置外键约束，删除代理时将关联设为 NULL
);
`;

// 新增：创建 proxies 表的 SQL
const createProxiesTableSQL = `
CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SOCKS5', 'HTTP')), -- 代理类型，目前支持 SOCKS5 和 HTTP
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NULL, -- 代理认证用户名 (可选)
    encrypted_password TEXT NULL, -- 加密存储的代理密码 (可选)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
`;

// 新增：创建 tags 表的 SQL
const createTagsTableSQL = `
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- 标签名称，唯一
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
`;

// 未来可能需要的其他表 (根据项目文档)
// const createConnectionTagsTableSQL = \`...\`; // 连接与标签的关联表
// const createSettingsTableSQL = \`...\`; // 设置表
// const createAuditLogsTableSQL = \`...\`; // 审计日志表
// const createApiKeysTableSQL = \`...\`; // API 密钥表

// Interface for PRAGMA table_info result rows
interface TableInfoColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

// Helper function to add a column if it doesn't exist
const addColumnIfNotExists = (db: Database, tableName: string, columnName: string, columnDefinition: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        // Check if the column exists using PRAGMA table_info
        // Explicitly type the 'columns' parameter
        db.all(`PRAGMA table_info(${tableName})`, (err, columns: TableInfoColumn[]) => {
            if (err) {
                console.error(`Error checking table info for ${tableName}:`, err.message);
                return reject(err);
            }
            // Now 'col' inside .some() will have the correct type
            const columnExists = columns.some(col => col.name === columnName);
            if (!columnExists) {
                // Column doesn't exist, add it
                const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`;
                db.run(sql, (alterErr) => {
                    if (alterErr) {
                        console.error(`Error adding column ${columnName} to ${tableName}:`, alterErr.message);
                        // Don't reject immediately, maybe it's a harmless error (like constraint issue)
                        // Let subsequent migrations try. If it's critical, the app might fail later.
                        console.warn(`Potential harmless error adding column ${columnName}. Continuing migration.`);
                        resolve();
                        // return reject(alterErr);
                    } else {
                        console.log(`Column ${columnName} added to table ${tableName}.`);
                        resolve();
                    }
                });
            } else {
                // Column already exists
                // console.log(`Column ${columnName} already exists in table ${tableName}.`);
                resolve();
            }
        });
    });
};


/**
 * 执行数据库迁移 (创建表和添加列)
 * @param db - 数据库实例
 * @returns Promise，在所有迁移完成后 resolve
 */
export const runMigrations = async (db: Database): Promise<void> => {
    // Use async/await for better readability with sequential operations
    try {
        await new Promise<void>((resolve, reject) => {
            db.run(createUsersTableSQL, (err) => {
                if (err) return reject(new Error(`创建 users 表时出错: ${err.message}`));
                console.log('Users 表已检查/创建。');
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            db.run(createConnectionsTableSQL, (err) => {
                // Ignore "duplicate column name" error if table already exists partially
                if (err && !err.message.includes('duplicate column name')) {
                     return reject(new Error(`创建 connections 表时出错: ${err.message}`));
                }
                 if (err && err.message.includes('duplicate column name')) {
                     console.warn('创建 connections 表时遇到 "duplicate column name" 错误，可能表已部分存在，将尝试 ALTER TABLE。');
                 }
                console.log('Connections 表已检查/尝试创建。');
                resolve();
            });
        });

        // Add columns to connections table if they don't exist
        // Add auth_method first in case it's missing from very old schema
        await addColumnIfNotExists(db, 'connections', 'auth_method', "TEXT NOT NULL DEFAULT 'password'"); // Add default for existing rows
        await addColumnIfNotExists(db, 'connections', 'encrypted_private_key', 'TEXT NULL');
        await addColumnIfNotExists(db, 'connections', 'encrypted_passphrase', 'TEXT NULL');
        // 新增：添加 proxy_id 列到 connections 表 (如果不存在)
        // 注意：直接添加带 FOREIGN KEY 的列在旧版 SQLite 中可能有限制，但现代版本通常支持。
        // 如果遇到问题，可能需要更复杂的迁移步骤（创建新表，复制数据，重命名）。
        // 这里我们先尝试直接添加。ON DELETE SET NULL 意味着如果代理被删除，关联的连接不会被删除，只是 proxy_id 变为空。
        await addColumnIfNotExists(db, 'connections', 'proxy_id', 'INTEGER NULL REFERENCES proxies(id) ON DELETE SET NULL');

        // 创建 proxies 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createProxiesTableSQL, (err) => {
                if (err) return reject(new Error(`创建 proxies 表时出错: ${err.message}`));
                console.log('Proxies 表已检查/创建。');
                resolve();
            });
        });

        // 新增：创建 tags 表 (如果不存在)
        await new Promise<void>((resolve, reject) => {
            db.run(createTagsTableSQL, (err) => {
                if (err) return reject(new Error(`创建 tags 表时出错: ${err.message}`));
                console.log('Tags 表已检查/创建。');
                resolve();
            });
        });

        // Add other tables or columns here in the future

        console.log('数据库迁移检查完成。');

    } catch (error) {
        console.error('数据库迁移过程中发生错误:', error);
        throw error; // Re-throw the error to be caught by the caller
    }
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
