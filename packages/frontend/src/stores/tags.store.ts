import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios'; // 假设使用 axios 发送请求

// 定义标签信息接口
export interface TagInfo {
    id: number;
    name: string;
    created_at: number;
    updated_at: number;
}

export const useTagsStore = defineStore('tags', () => {
    const tags = ref<TagInfo[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // 获取标签列表
    async function fetchTags() {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await axios.get<TagInfo[]>('/api/v1/tags');
            tags.value = response.data;
            return true;
        } catch (err: any) {
            console.error('Failed to fetch tags:', err);
            error.value = err.response?.data?.message || err.message || '获取标签列表失败';
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    // 添加新标签
    async function addTag(name: string): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await axios.post<{ message: string, tag: TagInfo }>('/api/v1/tags', { name });
            // 添加成功后，重新获取列表以保证数据同步 (或者直接将新标签添加到 ref)
            await fetchTags(); // 简单起见，重新获取
            // tags.value.push(response.data.tag); // 另一种方式
            // tags.value.sort((a, b) => a.name.localeCompare(b.name)); // 保持排序
            return true;
        } catch (err: any) {
            console.error('Failed to add tag:', err);
            error.value = err.response?.data?.message || err.message || '添加标签失败';
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    // 更新标签
    async function updateTag(id: number, name: string): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            await axios.put(`/api/v1/tags/${id}`, { name });
            // 更新成功后，重新获取列表
            await fetchTags();
            return true;
        } catch (err: any) {
            console.error('Failed to update tag:', err);
            error.value = err.response?.data?.message || err.message || '更新标签失败';
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    // 删除标签
    async function deleteTag(id: number): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            await axios.delete(`/api/v1/tags/${id}`);
            // 删除成功后，重新获取列表
            await fetchTags();
            return true;
        } catch (err: any) {
            console.error('Failed to delete tag:', err);
            error.value = err.response?.data?.message || err.message || '删除标签失败';
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    return {
        tags,
        isLoading,
        error,
        fetchTags,
        addTag,
        updateTag,
        deleteTag,
    };
});
