import { Request, Response } from 'express';
import * as QuickCommandsService from '../services/quick-commands.service';
import { QuickCommandSortBy } from '../services/quick-commands.service';

/**
 * 处理添加新快捷指令的请求
 */
export const addQuickCommand = async (req: Request, res: Response): Promise<void> => {
    const { name, command } = req.body;

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
        res.status(400).json({ message: '指令内容不能为空' });
        return;
    }
    // 名称可以是 null 或 string
    if (name !== null && typeof name !== 'string') {
         res.status(400).json({ message: '名称必须是字符串或 null' });
         return;
    }

    try {
        const newId = await QuickCommandsService.addQuickCommand(name, command);
        res.status(201).json({ id: newId, message: '快捷指令已添加' });
    } catch (error: any) {
        console.error('添加快捷指令控制器出错:', error);
        res.status(500).json({ message: error.message || '无法添加快捷指令' });
    }
};

/**
 * 处理获取所有快捷指令的请求 (支持排序)
 */
export const getAllQuickCommands = async (req: Request, res: Response): Promise<void> => {
    const sortBy = req.query.sortBy as QuickCommandSortBy | undefined;
    // 验证 sortBy 参数
    const validSortBy: QuickCommandSortBy = (sortBy === 'name' || sortBy === 'usage_count') ? sortBy : 'name';

    try {
        const commands = await QuickCommandsService.getAllQuickCommands(validSortBy);
        res.status(200).json(commands);
    } catch (error: any) {
        console.error('获取快捷指令控制器出错:', error);
        res.status(500).json({ message: error.message || '无法获取快捷指令' });
    }
};

/**
 * 处理更新快捷指令的请求
 */
export const updateQuickCommand = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    const { name, command } = req.body;

    if (isNaN(id)) {
        res.status(400).json({ message: '无效的 ID' });
        return;
    }
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
        res.status(400).json({ message: '指令内容不能为空' });
        return;
    }
    if (name !== null && typeof name !== 'string') {
         res.status(400).json({ message: '名称必须是字符串或 null' });
         return;
    }

    try {
        const success = await QuickCommandsService.updateQuickCommand(id, name, command);
        if (success) {
            res.status(200).json({ message: '快捷指令已更新' });
        } else {
            res.status(404).json({ message: '未找到要更新的快捷指令' });
        }
    } catch (error: any) {
        console.error('更新快捷指令控制器出错:', error);
        res.status(500).json({ message: error.message || '无法更新快捷指令' });
    }
};

/**
 * 处理删除快捷指令的请求
 */
export const deleteQuickCommand = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
        res.status(400).json({ message: '无效的 ID' });
        return;
    }

    try {
        const success = await QuickCommandsService.deleteQuickCommand(id);
        if (success) {
            res.status(200).json({ message: '快捷指令已删除' });
        } else {
            res.status(404).json({ message: '未找到要删除的快捷指令' });
        }
    } catch (error: any) {
        console.error('删除快捷指令控制器出错:', error);
        res.status(500).json({ message: error.message || '无法删除快捷指令' });
    }
};

/**
 * 处理增加快捷指令使用次数的请求
 */
export const incrementUsage = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
        res.status(400).json({ message: '无效的 ID' });
        return;
    }

    try {
        const success = await QuickCommandsService.incrementUsageCount(id);
        if (success) {
            res.status(200).json({ message: '使用次数已增加' });
        } else {
            // 即使没找到也可能返回成功，避免不必要的错误提示
            console.warn(`尝试增加不存在的快捷指令 (ID: ${id}) 的使用次数`);
            res.status(200).json({ message: '使用次数已记录 (或指令不存在)' });
            // 或者严格一点返回 404:
            // res.status(404).json({ message: '未找到要增加使用次数的快捷指令' });
        }
    } catch (error: any) {
        console.error('增加快捷指令使用次数控制器出错:', error);
        res.status(500).json({ message: error.message || '无法增加使用次数' });
    }
};
