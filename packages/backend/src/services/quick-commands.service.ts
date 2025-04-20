import * as QuickCommandsRepository from '../repositories/quick-commands.repository';
import { QuickCommand } from '../repositories/quick-commands.repository';

// 定义排序类型
export type QuickCommandSortBy = 'name' | 'usage_count';

/**
 * 添加快捷指令
 * @param name - 指令名称 (可选)
 * @param command - 指令内容
 * @returns 返回添加记录的 ID
 */
export const addQuickCommand = async (name: string | null, command: string): Promise<number> => {
    if (!command || command.trim().length === 0) {
        throw new Error('指令内容不能为空');
    }
    // 如果 name 是空字符串，则视为 null
    const finalName = name && name.trim().length > 0 ? name.trim() : null;
    return QuickCommandsRepository.addQuickCommand(finalName, command.trim());
};

/**
 * 更新快捷指令
 * @param id - 要更新的记录 ID
 * @param name - 新的指令名称 (可选)
 * @param command - 新的指令内容
 * @returns 返回是否成功更新 (更新行数 > 0)
 */
export const updateQuickCommand = async (id: number, name: string | null, command: string): Promise<boolean> => {
    if (!command || command.trim().length === 0) {
        throw new Error('指令内容不能为空');
    }
    const finalName = name && name.trim().length > 0 ? name.trim() : null;
    const changes = await QuickCommandsRepository.updateQuickCommand(id, finalName, command.trim());
    return changes;
};

/**
 * 删除快捷指令
 * @param id - 要删除的记录 ID
 * @returns 返回是否成功删除 (删除行数 > 0)
 */
export const deleteQuickCommand = async (id: number): Promise<boolean> => {
    const changes = await QuickCommandsRepository.deleteQuickCommand(id);
    return changes;
};

/**
 * 获取所有快捷指令，并按指定方式排序
 * @param sortBy - 排序字段 ('name' 或 'usage_count')
 * @returns 返回排序后的快捷指令数组
 */
export const getAllQuickCommands = async (sortBy: QuickCommandSortBy = 'name'): Promise<QuickCommand[]> => {
    return QuickCommandsRepository.getAllQuickCommands(sortBy);
};

/**
 * 增加快捷指令的使用次数
 * @param id - 记录 ID
 * @returns 返回是否成功更新 (更新行数 > 0)
 */
export const incrementUsageCount = async (id: number): Promise<boolean> => {
    const changes = await QuickCommandsRepository.incrementUsageCount(id);
    return changes;
};

/**
 * 根据 ID 获取单个快捷指令 (可能用于编辑)
 * @param id - 记录 ID
 * @returns 返回找到的快捷指令，或 undefined
 */
export const getQuickCommandById = async (id: number): Promise<QuickCommand | undefined> => {
    return QuickCommandsRepository.findQuickCommandById(id);
};
