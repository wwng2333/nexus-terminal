import * as TagRepository from '../repositories/tag.repository';

// Re-export or define types
export interface TagData extends TagRepository.TagData {}

/**
 * 获取所有标签
 */
export const getAllTags = async (): Promise<TagData[]> => {
    return TagRepository.findAllTags();
};

/**
 * 根据 ID 获取单个标签
 */
export const getTagById = async (id: number): Promise<TagData | null> => {
    return TagRepository.findTagById(id);
};

/**
 * 创建新标签
 */
export const createTag = async (name: string): Promise<TagData> => {
    // 1. Validate input
    if (!name || name.trim().length === 0) {
        throw new Error('标签名称不能为空。');
    }
    const trimmedName = name.trim();

    // 2. Create tag record
    try {
        const newTagId = await TagRepository.createTag(trimmedName);
        // 3. Fetch and return the newly created tag
        const newTag = await getTagById(newTagId);
        if (!newTag) {
            throw new Error('创建标签后无法检索到该标签。');
        }
        return newTag;
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed')) {
            throw new Error(`创建标签失败：标签名称 "${trimmedName}" 已存在。`);
        }
        throw error; // Re-throw other errors
    }
};

/**
 * 更新标签名称
 */
export const updateTag = async (id: number, name: string): Promise<TagData | null> => {
    // 1. Validate input
    if (!name || name.trim().length === 0) {
        throw new Error('标签名称不能为空。');
    }
     const trimmedName = name.trim();

    // 2. Update tag record
    try {
        const updated = await TagRepository.updateTag(id, trimmedName);
        if (!updated) {
            return null; // Tag not found or not updated
        }
        // 3. Fetch and return the updated tag
        return getTagById(id);
    } catch (error: any) {
         if (error.message.includes('UNIQUE constraint failed')) {
            throw new Error(`更新标签失败：标签名称 "${trimmedName}" 已存在。`);
        }
        throw error; // Re-throw other errors
    }
};

/**
 * 删除标签
 */
export const deleteTag = async (id: number): Promise<boolean> => {
    // Repository handles cascading deletes in connection_tags
    return TagRepository.deleteTag(id);
};
