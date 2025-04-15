import { Request, Response } from 'express';
import * as TagService from '../services/tag.service';

/**
 * 创建新标签 (POST /api/v1/tags)
 */
export const createTag = async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ message: '标签名称不能为空。' });
        return;
    }

    try {
        const newTag = await TagService.createTag(name);
        res.status(201).json({ message: '标签创建成功。', tag: newTag });
    } catch (error: any) {
        console.error('Controller: 创建标签时发生错误:', error);
        if (error.message.includes('已存在')) {
            res.status(409).json({ message: error.message }); // Conflict
        } else {
            res.status(500).json({ message: error.message || '创建标签时发生内部服务器错误。' });
        }
    }
};

/**
 * 获取标签列表 (GET /api/v1/tags)
 */
export const getTags = async (req: Request, res: Response): Promise<void> => {
    try {
        const tags = await TagService.getAllTags();
        res.status(200).json(tags);
    } catch (error: any) {
        console.error('Controller: 获取标签列表时发生错误:', error);
        res.status(500).json({ message: error.message || '获取标签列表时发生内部服务器错误。' });
    }
};

/**
 * 获取单个标签信息 (GET /api/v1/tags/:id)
 */
export const getTagById = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }

    try {
        const tag = await TagService.getTagById(tagId);
        if (!tag) {
            res.status(404).json({ message: '标签未找到。' });
        } else {
            res.status(200).json(tag);
        }
    } catch (error: any) {
        console.error(`Controller: 获取标签 ${tagId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '获取标签信息时发生内部服务器错误。' });
    }
};

/**
 * 更新标签信息 (PUT /api/v1/tags/:id)
 */
export const updateTag = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);
    const { name } = req.body;

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ message: '标签名称不能为空。' });
        return;
    }

    try {
        const updatedTag = await TagService.updateTag(tagId, name);
        if (!updatedTag) {
            res.status(404).json({ message: '标签未找到。' });
        } else {
            res.status(200).json({ message: '标签更新成功。', tag: updatedTag });
        }
    } catch (error: any) {
        console.error(`Controller: 更新标签 ${tagId} 时发生错误:`, error);
         if (error.message.includes('已存在')) {
            res.status(409).json({ message: error.message }); // Conflict
        } else if (error.message.includes('不能为空')) {
             res.status(400).json({ message: error.message });
        }
        else {
            res.status(500).json({ message: error.message || '更新标签时发生内部服务器错误。' });
        }
    }
};

/**
 * 删除标签 (DELETE /api/v1/tags/:id)
 */
export const deleteTag = async (req: Request, res: Response): Promise<void> => {
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
        res.status(400).json({ message: '无效的标签 ID。' });
        return;
    }

    try {
        const deleted = await TagService.deleteTag(tagId);
        if (!deleted) {
            res.status(404).json({ message: '标签未找到。' });
        } else {
            res.status(200).json({ message: '标签删除成功。' });
        }
    } catch (error: any) {
        console.error(`Controller: 删除标签 ${tagId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除标签时发生内部服务器错误。' });
    }
};
