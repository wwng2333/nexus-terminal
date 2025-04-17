import { getDb } from '../database';

// 定义命令历史记录的接口
export interface CommandHistoryEntry {
    id: number;
    command: string;
    timestamp: number; // Unix 时间戳 (秒)
}

/**
 * 插入或更新一条命令历史记录。
 * 如果命令已存在，则更新其时间戳；否则，插入新记录。
 * @param command - 要添加或更新的命令字符串
 * @returns 返回插入或更新记录的 ID
 */
export const upsertCommand = (command: string): Promise<number> => {
    const db = getDb();
    // 使用 INSERT ... ON CONFLICT DO UPDATE 语法 (SQLite 3.24.0+)
    // 如果 command 列冲突 (假设我们为 command 列添加了 UNIQUE 约束，或者手动检查)
    // 这里我们先不加 UNIQUE 约束，而是先尝试 UPDATE，再尝试 INSERT
    const now = Math.floor(Date.now() / 1000); // 获取当前时间戳

    return new Promise((resolve, reject) => {
        // 1. 尝试更新现有记录的时间戳
        const updateSql = `UPDATE command_history SET timestamp = ? WHERE command = ?`;
        db.run(updateSql, [now, command], function (updateErr) {
            if (updateErr) {
                console.error('更新命令历史记录时间戳时出错:', updateErr);
                return reject(new Error('无法更新命令历史记录'));
            }

            if (this.changes > 0) {
                // 更新成功，需要获取被更新记录的 ID
                const selectSql = `SELECT id FROM command_history WHERE command = ? ORDER BY timestamp DESC LIMIT 1`;
                db.get(selectSql, [command], (selectErr, row: { id: number } | undefined) => {
                    if (selectErr) {
                        console.error('获取更新后记录 ID 时出错:', selectErr);
                        return reject(new Error('无法获取更新后的记录 ID'));
                    }
                    if (row) {
                        resolve(row.id);
                    } else {
                        // 理论上不应该发生，因为我们刚更新了它
                        reject(new Error('更新成功但无法找到记录 ID'));
                    }
                });
            } else {
                // 2. 没有记录被更新，说明命令不存在，执行插入
                const insertSql = `INSERT INTO command_history (command, timestamp) VALUES (?, ?)`;
                db.run(insertSql, [command, now], function (insertErr) {
                    if (insertErr) {
                        console.error('插入新命令历史记录时出错:', insertErr);
                        return reject(new Error('无法插入新命令历史记录'));
                    }
                    resolve(this.lastID); // 返回新插入的行 ID
                });
            }
        });
    });
};

/**
 * 获取所有命令历史记录，按时间戳升序排列（最旧的在前）
 * @returns 返回包含所有历史记录条目的数组
 */
export const getAllCommands = (): Promise<CommandHistoryEntry[]> => {
    const db = getDb();
    const sql = `SELECT id, command, timestamp FROM command_history ORDER BY timestamp ASC`;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows: CommandHistoryEntry[]) => {
            if (err) {
                console.error('获取命令历史记录时出错:', err);
                return reject(new Error('无法获取命令历史记录'));
            }
            resolve(rows);
        });
    });
};

/**
 * 根据 ID 删除指定的命令历史记录
 * @param id - 要删除的记录 ID
 * @returns 返回删除的行数 (通常是 1 或 0)
 */
export const deleteCommandById = (id: number): Promise<number> => {
    const db = getDb();
    const sql = `DELETE FROM command_history WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [id], function (err) {
            if (err) {
                console.error('删除命令历史记录时出错:', err);
                return reject(new Error('无法删除命令历史记录'));
            }
            resolve(this.changes); // 返回受影响的行数
        });
    });
};

/**
 * 清空所有命令历史记录
 * @returns 返回删除的行数
 */
export const clearAllCommands = (): Promise<number> => {
    const db = getDb();
    const sql = `DELETE FROM command_history`;
    return new Promise((resolve, reject) => {
        db.run(sql, [], function (err) {
            if (err) {
                console.error('清空命令历史记录时出错:', err);
                return reject(new Error('无法清空命令历史记录'));
            }
            resolve(this.changes); // 返回受影响的行数
        });
    });
};
