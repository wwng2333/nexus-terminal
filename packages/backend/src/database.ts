import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// 数据库文件路径 (相对于 backend 项目根目录)
const dbDir = path.resolve(__dirname, '../../data'); // 使用 '../../data' 定位到 monorepo 根目录下的 data 文件夹
const dbPath = path.join(dbDir, 'nexus-terminal.db');

// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`数据库目录已创建: ${dbDir}`);
}

// 使用详细模式以获得更丰富的错误信息
const verboseSqlite3 = sqlite3.verbose();

// 创建并连接数据库
// 使用单例 (singleton) 模式确保只有一个数据库连接实例
let dbInstance: sqlite3.Database | null = null;

export const getDb = (): sqlite3.Database => {
    if (!dbInstance) {
        dbInstance = new verboseSqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('打开数据库时出错:', err.message);
                // 在实际应用中，这里可能需要更健壮的错误处理，例如直接退出进程
                process.exit(1);
            } else {
                console.log(`已连接到 SQLite 数据库: ${dbPath}`);
                // 可选：启用外键约束 (如果数据库设计中使用了外键)
                // dbInstance.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
                //   if (pragmaErr) {
                //     console.error('启用外键约束失败:', pragmaErr.message);
                //   }
                // });
            }
        });
    }
    return dbInstance;
};

// 优雅停机：在应用接收到中断信号 (如 Ctrl+C) 时关闭数据库连接
process.on('SIGINT', () => {
    if (dbInstance) {
        dbInstance.close((err) => {
            if (err) {
                console.error('关闭数据库时出错:', err.message);
            } else {
                console.log('数据库连接已关闭。');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

export default getDb;
