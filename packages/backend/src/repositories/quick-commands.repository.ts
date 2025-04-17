import { getDb } from '../database';

// 定义快捷指令的接口
export interface QuickCommand {
    id: number;
    name: string | null; // 名称可选
    command: string;
    usage_count: number;
    created_at: number; // Unix 时间戳 (秒)
    updated_at: number; // Unix 时间戳 (秒)
}

/**
 * 添加一条新的快捷指令
 * @param name - 指令名称 (可选)
 * @param command - 指令内容
 * @returns 返回插入记录的 ID
 */
export const addQuickCommand = (name: string | null, command: string): Promise<number> => {
    const db = getDb();
    const sql = `INSERT INTO quick_commands (name, command, created_at, updated_at) VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'))`;
    return new Promise((resolve, reject) => {
        db.run(sql, [name, command], function (err) {
            if (err) {
                console.error('添加快捷指令时出错:', err);
                return reject(new Error('无法添加快捷指令'));
            }
            resolve(this.lastID);
        });
    });
};

/**
 * 更新指定的快捷指令
 * @param id - 要更新的记录 ID
 * @param name - 新的指令名称 (可选)
 * @param command - 新的指令内容
 * @returns 返回更新的行数 (通常是 1 或 0)
 */
export const updateQuickCommand = (id: number, name: string | null, command: string): Promise<number> => {
    const db = getDb();
    const sql = `UPDATE quick_commands SET name = ?, command = ?, updated_at = strftime('%s', 'now') WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [name, command, id], function (err) {
            if (err) {
                console.error('更新快捷指令时出错:', err);
                return reject(new Error('无法更新快捷指令'));
            }
            resolve(this.changes);
        });
    });
};

/**
 * 根据 ID 删除指定的快捷指令
 * @param id - 要删除的记录 ID
 * @returns 返回删除的行数 (通常是 1 或 0)
 */
export const deleteQuickCommand = (id: number): Promise<number> => {
    const db = getDb();
    const sql = `DELETE FROM quick_commands WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [id], function (err) {
            if (err) {
                console.error('删除快捷指令时出错:', err);
                return reject(new Error('无法删除快捷指令'));
            }
            resolve(this.changes);
        });
    });
};

/**
 * 获取所有快捷指令
 * @param sortBy - 排序字段 ('name' 或 'usage_count')
 * @returns 返回包含所有快捷指令条目的数组
 */
export const getAllQuickCommands = (sortBy: 'name' | 'usage_count' = 'name'): Promise<QuickCommand[]> => {
    const db = getDb();
    let orderByClause = 'ORDER BY name ASC'; // 默认按名称升序
    if (sortBy === 'usage_count') {
        orderByClause = 'ORDER BY usage_count DESC, name ASC'; // 按使用频率降序，同频率按名称升序
    }
    // SQLite 中 NULLS LAST/FIRST 的支持可能不一致，这里简单处理 NULL 名称排在前面
    const sql = `SELECT id, name, command, usage_count, created_at, updated_at FROM quick_commands ${orderByClause}`;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows: QuickCommand[]) => {
            if (err) {
                console.error('获取快捷指令时出错:', err);
                return reject(new Error('无法获取快捷指令'));
            }
            resolve(rows);
        });
    });
};

/**
 * 增加指定快捷指令的使用次数
 * @param id - 要增加次数的记录 ID
 * @returns 返回更新的行数 (通常是 1 或 0)
 */
export const incrementUsageCount = (id: number): Promise<number> => {
    const db = getDb();
    const sql = `UPDATE quick_commands SET usage_count = usage_count + 1, updated_at = strftime('%s', 'now') WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [id], function (err) {
            if (err) {
                console.error('增加快捷指令使用次数时出错:', err);
                return reject(new Error('无法增加快捷指令使用次数'));
            }
            resolve(this.changes);
        });
    });
};

/**
 * 根据 ID 查找快捷指令 (用于编辑前获取数据)
 * @param id - 要查找的记录 ID
 * @returns 返回找到的快捷指令条目，如果未找到则返回 undefined
 */
export const findQuickCommandById = (id: number): Promise<QuickCommand | undefined> => {
    const db = getDb();
    const sql = `SELECT id, name, command, usage_count, created_at, updated_at FROM quick_commands WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.get(sql, [id], (err, row: QuickCommand | undefined) => {
            if (err) {
                console.error('查找快捷指令时出错:', err);
                return reject(new Error('无法查找快捷指令'));
            }
            resolve(row);
        });
    });
};
