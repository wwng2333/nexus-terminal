import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
// 导入 Repository 模块以调用其初始化相关函数
import * as appearanceRepository from './repositories/appearance.repository';
import * as terminalThemeRepository from './repositories/terminal-theme.repository';
// 导入预设主题定义
import { presetTerminalThemes } from './config/preset-themes-definition';

// 数据库文件路径
const dbDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dbDir, 'nexus-terminal.db');

// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`数据库目录已创建: ${dbDir}`);
}

const verboseSqlite3 = sqlite3.verbose();
let dbInstance: sqlite3.Database | null = null;

/**
 * 执行数据库初始化序列：创建表、插入预设主题、设置默认外观。
 * @param db 数据库实例
 */
const runDatabaseInitializations = (db: sqlite3.Database) => {
    db.serialize(() => {
        console.log('[DB Init] 开始数据库初始化序列...');

        // 1. 启用外键约束 (必须在事务之外或序列化块的开始处)
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
          if (pragmaErr) {
            console.error('[DB Init] 启用外键约束失败:', pragmaErr.message);
            // 根据需要处理错误，可能需要阻止后续初始化
          } else {
            console.log('[DB Init] 外键约束已启用。');
          }
        });

        // 2. 创建 terminal_themes 表
        db.run(terminalThemeRepository.SQL_CREATE_TABLE, (err) => {
            if (err) {
                console.error('[DB Init] 创建 terminal_themes 表失败:', err.message);
            } else {
                console.log('[DB Init] terminal_themes 表已存在或已创建。');
                // 3. 初始化预设主题 (只有在表创建成功或已存在后才执行)
                terminalThemeRepository.initializePresetThemes(presetTerminalThemes)
                    .then(() => console.log('[DB Init] 预设主题初始化检查完成。'))
                    .catch(initErr => console.error('[DB Init] 初始化预设主题时出错:', initErr));
            }
        });

        // 4. 创建 appearance_settings 表
        db.run(appearanceRepository.SQL_CREATE_TABLE, (err) => {
            if (err) {
                console.error('[DB Init] 创建 appearance_settings 表失败:', err.message);
            } else {
                console.log('[DB Init] appearance_settings 表已存在或已创建。');
                // 5. 确保默认设置存在并设置默认激活主题 (只有在表创建成功或已存在后才执行)
                // 注意：这需要等待预设主题初始化完成，但 serialize 会保证顺序
                appearanceRepository.ensureDefaultSettingsExist()
                    .then(() => console.log('[DB Init] 外观设置初始化检查完成。'))
                    .catch(initErr => console.error('[DB Init] 初始化外观设置时出错:', initErr));
            }
        });

        // TODO: 在这里添加其他表的创建和初始化逻辑...

        console.log('[DB Init] 数据库初始化序列提交。');
    });
};

export const getDb = (): sqlite3.Database => {
    if (!dbInstance) {
        console.log(`[DB] 尝试连接到数据库: ${dbPath}`);
        dbInstance = new verboseSqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('[DB] 打开数据库时出错:', err.message);
                process.exit(1);
            } else {
                console.log(`[DB] 已连接到 SQLite 数据库: ${dbPath}`);
                // 连接成功后运行初始化逻辑
                runDatabaseInitializations(dbInstance as sqlite3.Database);
            }
        });
    }
    return dbInstance;
};

// 优雅停机
process.on('SIGINT', () => {
    if (dbInstance) {
        console.log('[DB] 收到 SIGINT，正在关闭数据库连接...');
        dbInstance.close((err) => {
            if (err) {
                console.error('[DB] 关闭数据库时出错:', err.message);
            } else {
                console.log('[DB] 数据库连接已关闭。');
            }
            process.exit(err ? 1 : 0);
        });
    } else {
        process.exit(0);
    }
});

export default getDb;

// 注意：为了让这个文件工作，需要修改 repository 文件：
// 1. 从 repository 文件中移除顶层的 createTableIfNotExists() 调用。
// 2. 从 repository 文件中导出 SQL_CREATE_TABLE 字符串常量。
// 3. 从 appearance.repository.ts 导出 ensureDefaultSettingsExist 函数。
