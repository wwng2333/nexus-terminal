import { defineStore } from 'pinia';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { ref, computed } from 'vue';
import { useUiNotificationsStore } from './uiNotifications.store'; // 用于显示通知

// 后端返回的原始历史记录条目接口
interface CommandHistoryEntryBE {
    id: number;
    command: string;
    timestamp: number; // Unix 时间戳 (秒)
}

// 前端使用的历史记录条目接口 (可能需要添加其他字段)
export interface CommandHistoryEntryFE extends CommandHistoryEntryBE {
    // 可以根据需要添加前端特定的字段
}

export const useCommandHistoryStore = defineStore('commandHistory', () => {
    const historyList = ref<CommandHistoryEntryFE[]>([]);
    const searchTerm = ref('');
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const uiNotificationsStore = useUiNotificationsStore();

    // --- Getters ---

    // 计算属性：根据搜索词过滤历史记录
    const filteredHistory = computed(() => {
        const term = searchTerm.value.toLowerCase().trim();
        if (!term) {
            return historyList.value; // 没有搜索词则返回全部
        }
        return historyList.value.filter(entry =>
            entry.command.toLowerCase().includes(term)
        );
    });

    // --- Actions ---

    // 从后端获取历史记录
    const fetchHistory = async () => {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await apiClient.get<CommandHistoryEntryBE[]>('/command-history'); // 使用 apiClient
            // 后端返回的是按时间戳升序 (旧->新)
            // 前端需要按时间戳降序 (新->旧)，所以反转数组
            historyList.value = response.data.reverse();
        } catch (err: any) {
            console.error('获取命令历史记录失败:', err);
            error.value = err.response?.data?.message || '获取历史记录时发生错误';
            // 确保传递给 showError 的是字符串
            uiNotificationsStore.showError(error.value ?? '未知错误'); // 显示错误通知
        } finally {
            isLoading.value = false;
        }
    };

    // 添加命令到历史记录 (由 CommandInputBar 调用)
    const addCommand = async (command: string) => {
        if (!command || command.trim().length === 0) {
            return; // 不添加空命令
        }
        try {
            const response = await apiClient.post<{ id: number }>('/command-history', { command: command.trim() }); // 使用 apiClient
            // 添加成功后，重新获取列表以保证顺序和 ID 正确
            // 或者，可以在本地模拟添加，但为了简单和一致性，重新获取更好
            await fetchHistory();
        } catch (err: any) {
            console.error('添加命令历史记录失败:', err);
            const message = err.response?.data?.message || '添加历史记录时发生错误';
            uiNotificationsStore.showError(message);
        }
    };


    // 删除单条历史记录
    const deleteCommand = async (id: number) => {
        try {
            await apiClient.delete(`/command-history/${id}`); // 使用 apiClient
            // 从本地列表中移除
            const index = historyList.value.findIndex(entry => entry.id === id);
            if (index !== -1) {
                historyList.value.splice(index, 1);
            }
            uiNotificationsStore.showSuccess('历史记录已删除');
        } catch (err: any) {
            console.error('删除命令历史记录失败:', err);
            const message = err.response?.data?.message || '删除历史记录时发生错误';
            uiNotificationsStore.showError(message);
        }
    };

    // 清空所有历史记录
    const clearAllHistory = async () => {
        // 可以在调用前添加确认逻辑 (例如在组件层)
        try {
            await apiClient.delete('/command-history'); // 使用 apiClient
            historyList.value = []; // 清空本地列表
            uiNotificationsStore.showSuccess('所有历史记录已清空');
        } catch (err: any) {
            console.error('清空命令历史记录失败:', err);
            const message = err.response?.data?.message || '清空历史记录时发生错误';
            uiNotificationsStore.showError(message);
        }
    };

    // 设置搜索词
    const setSearchTerm = (term: string) => {
        searchTerm.value = term;
    };

    return {
        historyList,
        searchTerm,
        isLoading,
        error,
        filteredHistory,
        fetchHistory,
        addCommand, // 导出 addCommand
        deleteCommand,
        clearAllHistory,
        setSearchTerm,
    };
});
