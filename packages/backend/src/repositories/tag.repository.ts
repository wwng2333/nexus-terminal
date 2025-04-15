import { Database, Statement } from 'sqlite3';
import { getDb } from '../database';

const db = getDb();

// 定义 Tag 类型 (可以共享到 types 文件)
export interface TagData {
    id: number;
    name: string;
    created_at: number;
    updated_at: number; // Assuming tags also have updated_at based on migrations
}

/**
 * 获取所有标签
 */
export const findAllTags = async (): Promise<TagData[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM tags ORDER BY name ASC`, [], (err, rows: TagData[]) => {
            if (err) {
                console.error('Repository: 查询标签列表时出错:', err.message);
                return reject(new Error('获取标签列表失败'));
            }
            resolve(rows);
        });
    });
};

/**
 * 根据 ID 获取单个标签
 */
export const findTagById = async (id: number): Promise<TagData | null> => {
     return new Promise((resolve, reject) => {
         db.get(`SELECT * FROM tags WHERE id = ?`, [id], (err, row: TagData) => {
             if (err) {
                 console.error(`Repository: 查询标签 ${id} 时出错:`, err.message);
                 return reject(new Error('获取标签信息失败'));
             }
             resolve(row || null);
         });
     });
 };


/**
 * 创建新标签
 */
export const createTag = async (name: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(
            `INSERT INTO tags (name, created_at, updated_at) VALUES (?, ?, ?)`
        );
        stmt.run(name, now, now, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                // Handle unique constraint error specifically if needed
                console.error('Repository: 创建标签时出错:', err.message);
                return reject(new Error(`创建标签失败: ${err.message}`));
            }
            resolve((this as any).lastID);
        });
    });
};

/**
 * 更新标签名称
 */
export const updateTag = async (id: number, name: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(
            `UPDATE tags SET name = ?, updated_at = ? WHERE id = ?`
        );
        stmt.run(name, now, id, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                 // Handle unique constraint error specifically if needed
                console.error(`Repository: 更新标签 ${id} 时出错:`, err.message);
                return reject(new Error(`更新标签失败: ${err.message}`));
            }
            resolve((this as any).changes > 0);
        });
    });
};

/**
 * 删除标签
 */
export const deleteTag = async (id: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        // Note: connection_tags junction table has ON DELETE CASCADE for tag_id,
        // so related entries there will be deleted automatically.
        const stmt = db.prepare(`DELETE FROM tags WHERE id = ?`);
        stmt.run(id, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                console.error(`Repository: 删除标签 ${id} 时出错:`, err.message);
                return reject(new Error('删除标签失败'));
            }
            resolve((this as any).changes > 0);
        });
    });
};
