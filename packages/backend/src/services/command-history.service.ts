import * as CommandHistoryRepository from '../repositories/command-history.repository';
import { CommandHistoryEntry } from '../repositories/command-history.repository';

/**
 * 添加一条命令历史记录
 * @param command - 要添加的命令
 * @returns 返回添加记录的 ID
 */
export const addCommandHistory = async (command: string): Promise<number> => {
    // 可以在这里添加额外的业务逻辑，例如校验命令格式、长度限制等
    if (!command || command.trim().length === 0) {
        throw new Error('命令不能为空');
    }
    // 可以在此添加去重逻辑，如果不想记录重复的命令
    // const existing = await CommandHistoryRepository.findCommand(command); // 如果需要更复杂的去重逻辑
    // if (existing) { ... }

    // 调用 upsertCommand 来处理插入或更新时间戳
    return CommandHistoryRepository.upsertCommand(command.trim());
};

/**
 * 获取所有命令历史记录
 * @returns 返回所有历史记录条目数组，按时间戳升序
 */
export const getAllCommandHistory = async (): Promise<CommandHistoryEntry[]> => {
    return CommandHistoryRepository.getAllCommands();
};

/**
 * 根据 ID 删除一条命令历史记录
 * @param id - 要删除的记录 ID
 * @returns 返回是否成功删除 (删除行数 > 0)
 */
export const deleteCommandHistoryById = async (id: number): Promise<boolean> => {
    const changes = await CommandHistoryRepository.deleteCommandById(id);
    return changes > 0;
};

/**
 * 清空所有命令历史记录
 * @returns 返回删除的记录条数
 */
export const clearAllCommandHistory = async (): Promise<number> => {
    return CommandHistoryRepository.clearAllCommands();
};
