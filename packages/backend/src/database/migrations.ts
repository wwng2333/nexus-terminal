import { Database } from 'sqlite3';

// 1. 定义 migrations 表 SQL
const createMigrationsTableSQL = `
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY, -- 迁移的版本号
    name TEXT NOT NULL,     -- 迁移的描述性名称
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) -- 应用迁移的时间戳
);
`;

// 2. 定义迁移列表
// 注意：这里的迁移应该代表数据库模式从某个已知状态到下一个状态的变化。
// 初始模式通常在 database.ts 中通过 schema.registry.ts 创建。
// 这里的迁移应该从版本 1 开始，代表初始模式创建后的第一个变更。
interface Migration {
    id: number;
    name: string;
    sql: string; // 可以是多条 SQL 语句，用 ; 分隔。db.exec 会处理。
}

const definedMigrations: Migration[] = [
    {
        id: 1,
        name: 'Add ssh_keys table and update connections table for SSH key management',
        sql: `
            -- 创建 ssh_keys 表
            CREATE TABLE IF NOT EXISTS ssh_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                encrypted_private_key TEXT NOT NULL,
                encrypted_passphrase TEXT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );

            -- 修改 connections 表，添加 ssh_key_id 列和外键约束
            -- 注意：如果 connections 表已存在且没有该列，则添加列。
            -- SQLite 的 ALTER TABLE 功能有限，如果表已存在，直接添加带外键的列可能不完全生效或报错。
            -- 但如果表是新创建的（通过 schema.ts），则外键会生效。
            -- 这里我们尝试添加列并定义引用，对于新数据库是安全的。
            -- 对于已存在的旧数据库，可能需要更复杂的迁移（重命名旧表，创建新表，复制数据）。
            -- 为简化起见，我们先执行添加列的操作。
            ALTER TABLE connections ADD COLUMN ssh_key_id INTEGER NULL REFERENCES ssh_keys(id) ON DELETE SET NULL;

            -- 可选：如果旧的 connections 表没有将 private_key/passphrase 设为 NULL，可以在此更新
            -- UPDATE connections SET encrypted_private_key = NULL WHERE encrypted_private_key = ''; -- 示例
            -- UPDATE connections SET encrypted_passphrase = NULL WHERE encrypted_passphrase = ''; -- 示例
        `
    },
    // --- 未来可以添加更多迁移 ---
    // { id: 2, name: '...', sql: '...' },
];

/**
 * 运行数据库迁移。
 * 检查当前数据库版本，并按顺序应用所有新的迁移。
 * @param db 数据库实例
 */
export const runMigrations = (db: Database): Promise<void> => {
    return new Promise((resolve, reject) => {
        console.log('[Migrations] 开始检查和应用数据库迁移...');

        db.serialize(() => {
            // 步骤 1: 确保 migrations 表存在
            db.run(createMigrationsTableSQL, (err) => {
                if (err) {
                    console.error('[Migrations] 创建 migrations 表失败:', err);
                    return reject(new Error(`创建 migrations 表失败: ${err.message}`));
                }
                console.log('[Migrations] migrations 表已确保存在。');

                // 步骤 2: 获取当前数据库版本 (已应用的最大迁移 ID)
                db.get('SELECT MAX(id) as currentVersion FROM migrations', (err, row: { currentVersion: number | null }) => {
                    if (err) {
                        console.error('[Migrations] 查询当前数据库版本失败:', err);
                        return reject(new Error(`查询当前数据库版本失败: ${err.message}`));
                    }

                    const currentVersion = row?.currentVersion ?? 0; // 如果表为空或没有记录，则认为版本为 0
                    console.log(`[Migrations] 当前数据库版本: ${currentVersion}`);

                    // 步骤 3: 确定需要应用的迁移
                    const migrationsToApply = definedMigrations
                        .filter(m => m.id > currentVersion)
                        .sort((a, b) => a.id - b.id); // 确保按 ID 升序应用

                    if (migrationsToApply.length === 0) {
                        console.log('[Migrations] 数据库已是最新版本，无需迁移。');
                        return resolve();
                    }

                    console.log(`[Migrations] 发现 ${migrationsToApply.length} 个新迁移需要应用:`, migrationsToApply.map(m => `  #${m.id}: ${m.name}`));

                    // 步骤 4: 按顺序应用迁移 (每个迁移在一个事务中)
                    const applyNextMigration = (index: number) => {
                        if (index >= migrationsToApply.length) {
                            // 所有迁移成功应用
                            console.log('[Migrations] 所有新迁移已成功应用！');
                            return resolve();
                        }

                        const migration = migrationsToApply[index];
                        console.log(`[Migrations] 应用迁移 #${migration.id}: ${migration.name}...`);

                        // 开始事务
                        db.run('BEGIN TRANSACTION', (beginErr) => {
                            if (beginErr) {
                                console.error(`[Migrations] 开始迁移 #${migration.id} 事务失败:`, beginErr);
                                return reject(new Error(`开始迁移 #${migration.id} 事务失败: ${beginErr.message}`));
                            }

                            // 执行迁移 SQL (db.exec 可以执行多条语句)
                            db.exec(migration.sql, (execErr) => {
                                if (execErr) {
                                    console.error(`[Migrations] 执行迁移 #${migration.id} SQL 失败:`, execErr);
                                    // 回滚事务
                                    db.run('ROLLBACK', (rollbackErr) => {
                                        if (rollbackErr) console.error(`[Migrations] 回滚迁移 #${migration.id} 事务失败:`, rollbackErr);
                                        reject(new Error(`执行迁移 #${migration.id} SQL 失败: ${execErr.message}`));
                                    });
                                    return; // 停止执行后续步骤
                                }

                                // SQL 执行成功，记录迁移到 migrations 表
                                const insertSQL = 'INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, strftime(\'%s\', \'now\'))';
                                db.run(insertSQL, [migration.id, migration.name], (insertErr) => {
                                    if (insertErr) {
                                        console.error(`[Migrations] 记录迁移 #${migration.id} 到 migrations 表失败:`, insertErr);
                                        // 回滚事务
                                        db.run('ROLLBACK', (rollbackErr) => {
                                            if (rollbackErr) console.error(`[Migrations] 回滚迁移 #${migration.id} 事务失败:`, rollbackErr);
                                            reject(new Error(`记录迁移 #${migration.id} 到 migrations 表失败: ${insertErr.message}`));
                                        });
                                        return; // 停止执行后续步骤
                                    }

                                    // 记录成功，提交事务
                                    db.run('COMMIT', (commitErr) => {
                                        if (commitErr) {
                                            console.error(`[Migrations] 提交迁移 #${migration.id} 事务失败:`, commitErr);
                                            // 提交失败比较严重，可能需要手动检查数据库状态
                                            reject(new Error(`提交迁移 #${migration.id} 事务失败: ${commitErr.message}`));
                                            return; // 停止执行后续步骤
                                        }

                                        console.log(`[Migrations] 迁移 #${migration.id}: ${migration.name} 应用成功。`);
                                        // 成功应用当前迁移，继续下一个
                                        applyNextMigration(index + 1);
                                    });
                                });
                            });
                        });
                    };

                    // 开始应用第一个需要应用的迁移
                    applyNextMigration(0);
                });
            });
        });
    });
};
