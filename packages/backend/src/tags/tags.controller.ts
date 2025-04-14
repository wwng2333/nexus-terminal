import { Request, Response } from 'express';
import { Statement } from 'sqlite3';
import { getDb } from '../database';

const db = getDb();

// 标签数据结构 (用于类型提示)
interface TagInfo {
    id: number;
    name: string;
    created_at: number;
    updated_at: number;
}

/**
 * 创建新标签 (POST /api/v1/tags)
 */
export const createTag = async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body;
    const userId = req.session.userId; // 保留以备将来多用户支持

    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ message: '标签名称不能为空。' });
        return;
    }

    const tagName = name.trim();
    const now = Math.floor(Date.now() / 1000);

    try {
        // 插入数据库，name 字段有 UNIQUE 约束，重复会报错
        const result = await new Promise<{ lastID: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `INSERT INTO tags (name, created_at, updated_at) VALUES (?, ?, ?)`
            );
            stmt.run(tagName, now, now, function (this: Statement, err: Error | null) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return reject(new Error(`标签 "${tagName}" 已存在。`));
                    }
                    console.error('插入标签时出错:', err.message);
                    return reject(new Error('创建标签失败'));
                }
                resolve({ lastID: (this as any).lastID });
            });
            stmt.finalize();
        });

        res.status(201).json({
            message: '标签创建成功。',
            tag: { id: result.lastID, name: tagName, created_at: now, updated_at: now }
        });

    } catch (error: any) {
        console.error('创建标签时发生错误:', error);
        res.status(500).json({ message: error.message || '创建标签时发生内部服务器错误。' });
    }
};

/**
 * 获取标签列表 (GET /api/v1/tags)
 */
export const getTags = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId; // 保留

    try {
        const tags = await new Promise<TagInfo[]>((resolve, reject) => {
            db.all(
                `SELECT id, name, created_at, updated_at FROM tags ORDER BY name ASC`,
                (err, rows: TagInfo[]) => {
                    if (err) {
                        console.error('查询标签列表时出错:', err.message);
                        return reject(new Error('获取标签列表失败'));
                    }
                    resolve(rows);
                }
            );
        });
        res.status(200).json(tags);
    } catch (error: any) {
        console.error('获取标签列表时发生错误:', error);
        res.status(500).json({ message: error.message || '获取标签列表时发生内部服务器错误。' });
    }
};

/**
 * 获取单个标签信息 (GET /api/v1/tags/:id)
 */
export const getTagById = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);
    const userId = req.session.userId; // 保留

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }

    try {
        const tag = await new Promise<TagInfo | null>((resolve, reject) => {
            db.get(
                `SELECT id, name, created_at, updated_at FROM tags WHERE id = ?`,
                [tagId],
                (err, row: TagInfo) => {
                    if (err) {
                        console.error(`查询标签 ${tagId} 时出错:`, err.message);
                        return reject(new Error('获取标签信息失败'));
                    }
                    resolve(row || null);
                }
            );
        });

        if (!tag) {
            res.status(404).json({ message: '标签未找到。' });
        } else {
            res.status(200).json(tag);
        }
    } catch (error: any) {
        console.error(`获取标签 ${tagId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '获取标签信息时发生内部服务器错误。' });
    }
};

/**
 * 更新标签信息 (PUT /api/v1/tags/:id)
 */
export const updateTag = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);
    const { name } = req.body;
    const userId = req.session.userId; // 保留

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ message: '标签名称不能为空。' });
        return;
    }

    const tagName = name.trim();
    const now = Math.floor(Date.now() / 1000);

    try {
        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `UPDATE tags SET name = ?, updated_at = ? WHERE id = ?`
            );
            stmt.run(tagName, now, tagId, function (this: Statement, err: Error | null) {
                if (err) {
                     if (err.message.includes('UNIQUE constraint failed')) {
                        return reject(new Error(`标签名称 "${tagName}" 已存在。`));
                    }
                    console.error(`更新标签 ${tagId} 时出错:`, err.message);
                    return reject(new Error('更新标签失败'));
                }
                resolve({ changes: (this as any).changes });
            });
            stmt.finalize();
        });

        if (result.changes === 0) {
            res.status(404).json({ message: '标签未找到或名称未更改。' });
        } else {
             // 获取更新后的信息并返回
            const updatedTag = await new Promise<TagInfo | null>((resolve, reject) => {
                db.get(
                    `SELECT id, name, created_at, updated_at FROM tags WHERE id = ?`,
                    [tagId],
                    (err, row: TagInfo) => err ? reject(err) : resolve(row || null)
                );
            });
            res.status(200).json({ message: '标签更新成功。', tag: updatedTag });
        }
    } catch (error: any) {
        console.error(`更新标签 ${tagId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '更新标签时发生内部服务器错误。' });
    }
};

/**
 * 删除标签 (DELETE /api/v1/tags/:id)
 */
export const deleteTag = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);
    const userId = req.session.userId; // 保留

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }

    try {
        // TODO: 在删除标签前，需要考虑处理 connection_tags 关联表中的数据
        // 例如：可以选择删除关联记录，或者阻止删除有关联的标签
        // 当前简化处理：直接删除标签

        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `DELETE FROM tags WHERE id = ?`
            );
            stmt.run(tagId, function (this: Statement, err: Error | null) {
                if (err) {
                    console.error(`删除标签 ${tagId} 时出错:`, err.message);
                    return reject(new Error('删除标签失败'));
                }
                resolve({ changes: (this as any).changes });
            });
            stmt.finalize();
        });

        if (result.changes === 0) {
            res.status(404).json({ message: '标签未找到。' });
        } else {
            res.status(200).json({ message: '标签删除成功。' });
        }
    } catch (error: any) {
        console.error(`删除标签 ${tagId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除标签时发生内部服务器错误。' });
    }
};
