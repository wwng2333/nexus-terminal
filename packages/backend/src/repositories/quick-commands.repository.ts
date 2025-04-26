import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection';

// 定义快捷指令的接口
export interface QuickCommand {
    id: number;
    name: string | null; // 名称可选
    command: string;
    usage_count: number;
    created_at: number; // Unix 时间戳 (秒)
    updated_at: number; // Unix 时间戳 (秒)
}

type DbQuickCommandRow = QuickCommand;

/**
 * 添加一条新的快捷指令
 * @param name - 指令名称 (可选)
 * @param command - 指令内容
 * @returns 返回插入记录的 ID
 */
export const addQuickCommand = async (name: string | null, command: string): Promise<number> => {
    const sql = `INSERT INTO quick_commands (name, command, created_at, updated_at) VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'))`;
    try {
        const db = await getDbInstance();
        const result = await runDb(db, sql, [name, command]);
        if (typeof result.lastID !== 'number' || result.lastID <= 0) {
             throw new Error('添加快捷指令后未能获取有效的 lastID');
        }
        return result.lastID;
    } catch (err: any) {
        console.error('添加快捷指令时出错:', err.message);
        throw new Error('无法添加快捷指令');
    }
};

/**
 * 更新指定的快捷指令
 * @param id - 要更新的记录 ID
 * @param name - 新的指令名称 (可选)
 * @param command - 新的指令内容
 * @returns 返回是否成功更新 (true/false)
 */
export const updateQuickCommand = async (id: number, name: string | null, command: string): Promise<boolean> => {
    const sql = `UPDATE quick_commands SET name = ?, command = ?, updated_at = strftime('%s', 'now') WHERE id = ?`;
    try {
        const db = await getDbInstance();
        const result = await runDb(db, sql, [name, command, id]);
        return result.changes > 0;
    } catch (err: any) {
        console.error('更新快捷指令时出错:', err.message);
        throw new Error('无法更新快捷指令');
    }
};

/**
 * 根据 ID 删除指定的快捷指令
 * @param id - 要删除的记录 ID
 * @returns 返回是否成功删除 (true/false)
 */
export const deleteQuickCommand = async (id: number): Promise<boolean> => {
    const sql = `DELETE FROM quick_commands WHERE id = ?`;
    try {
        const db = await getDbInstance();
        const result = await runDb(db, sql, [id]);
        return result.changes > 0;
    } catch (err: any) {
        console.error('删除快捷指令时出错:', err.message);
        throw new Error('无法删除快捷指令');
    }
};

/**
 * 获取所有快捷指令
 * @param sortBy - 排序字段 ('name' 或 'usage_count')
 * @returns 返回包含所有快捷指令条目的数组
 */
export const getAllQuickCommands = async (sortBy: 'name' | 'usage_count' = 'name'): Promise<QuickCommand[]> => {
    let orderByClause = 'ORDER BY name ASC'; // 默认按名称升序
    if (sortBy === 'usage_count') {
        orderByClause = 'ORDER BY usage_count DESC, name ASC'; // 按使用频率降序，同频率按名称升序
    }
    const sql = `SELECT id, name, command, usage_count, created_at, updated_at FROM quick_commands ${orderByClause}`;
    try {
        const db = await getDbInstance();
        const rows = await allDb<DbQuickCommandRow>(db, sql);
        return rows;
    } catch (err: any) {
        console.error('获取快捷指令时出错:', err.message);
        throw new Error('无法获取快捷指令');
    }
};

/**
 * 增加指定快捷指令的使用次数
 * @param id - 要增加次数的记录 ID
 * @returns 返回是否成功更新 (true/false)
 */
export const incrementUsageCount = async (id: number): Promise<boolean> => {
    const sql = `UPDATE quick_commands SET usage_count = usage_count + 1, updated_at = strftime('%s', 'now') WHERE id = ?`;
    try {
        const db = await getDbInstance();
        const result = await runDb(db, sql, [id]);
        return result.changes > 0;
    } catch (err: any) {
        console.error('增加快捷指令使用次数时出错:', err.message);
        throw new Error('无法增加快捷指令使用次数');
    }
};

/**
 * 根据 ID 查找快捷指令 (用于编辑前获取数据)
 * @param id - 要查找的记录 ID
 * @returns 返回找到的快捷指令条目，如果未找到则返回 undefined
 */
export const findQuickCommandById = async (id: number): Promise<QuickCommand | undefined> => {
    const sql = `SELECT id, name, command, usage_count, created_at, updated_at FROM quick_commands WHERE id = ?`;
    try {
        const db = await getDbInstance();
        const row = await getDbRow<DbQuickCommandRow>(db, sql, [id]);
        return row;
    } catch (err: any) {
        console.error('查找快捷指令时出错:', err.message);
        throw new Error('无法查找快捷指令');
    }
};
