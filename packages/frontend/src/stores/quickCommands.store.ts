import { defineStore } from 'pinia';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { ref, computed } from 'vue';
import { useUiNotificationsStore } from './uiNotifications.store';
import type { QuickCommand } from '../../../backend/src/repositories/quick-commands.repository'; // 复用后端类型定义

// 定义前端使用的快捷指令接口 (可以与后端一致)
export type QuickCommandFE = QuickCommand;

// 定义排序类型
export type QuickCommandSortByType = 'name' | 'usage_count';

export const useQuickCommandsStore = defineStore('quickCommands', () => {
    const quickCommandsList = ref<QuickCommandFE[]>([]);
    const searchTerm = ref('');
    const sortBy = ref<QuickCommandSortByType>('name'); // 默认按名称排序
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const uiNotificationsStore = useUiNotificationsStore();

    // --- Getters ---

    // 计算属性：根据搜索词过滤和排序指令
    const filteredAndSortedCommands = computed(() => {
        const term = searchTerm.value.toLowerCase().trim();
        let filtered = quickCommandsList.value;

        if (term) {
            filtered = filtered.filter(cmd =>
                (cmd.name && cmd.name.toLowerCase().includes(term)) ||
                cmd.command.toLowerCase().includes(term)
            );
        }

        // Pinia store getter 中直接排序可能不是最佳实践，但这里为了简单起见先这样实现
        // 更好的方式可能是在 fetch 时就按需排序，或者在组件层排序
        // 注意：这里直接修改 ref 数组的顺序，如果需要在多处使用不同排序，需要创建副本
        // return [...filtered].sort((a, b) => {
        //     if (sortBy.value === 'usage_count') {
        //         // 按使用次数降序，次数相同按名称升序
        //         if (b.usage_count !== a.usage_count) {
        //             return b.usage_count - a.usage_count;
        //         }
        //     }
        //     // 默认或次数相同时按名称升序 (null 名称排在前面)
        //     const nameA = a.name ?? '';
        //     const nameB = b.name ?? '';
        //     return nameA.localeCompare(nameB);
        // });
        // **修正：Getter 不应修改原始数组，返回过滤后的即可，排序由 fetch 控制**
         return filtered;
    });

    // --- Actions ---

    // 从后端获取快捷指令 (带排序)
    const fetchQuickCommands = async () => {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await apiClient.get<QuickCommandFE[]>('/quick-commands', { // 使用 apiClient
                params: { sortBy: sortBy.value } // 将排序参数传递给后端
            });
            quickCommandsList.value = response.data;
        } catch (err: any) {
            console.error('获取快捷指令失败:', err);
            error.value = err.response?.data?.message || '获取快捷指令时发生错误';
            uiNotificationsStore.showError(error.value ?? '未知错误');
        } finally {
            isLoading.value = false;
        }
    };

    // 添加快捷指令
    const addQuickCommand = async (name: string | null, command: string): Promise<boolean> => {
        try {
            await apiClient.post('/quick-commands', { name, command }); // 使用 apiClient
            await fetchQuickCommands(); // 添加成功后刷新列表
            uiNotificationsStore.showSuccess('快捷指令已添加');
            return true;
        } catch (err: any) {
            console.error('添加快捷指令失败:', err);
            const message = err.response?.data?.message || '添加快捷指令时发生错误';
            uiNotificationsStore.showError(message);
            return false;
        }
    };

    // 更新快捷指令
    const updateQuickCommand = async (id: number, name: string | null, command: string): Promise<boolean> => {
         try {
            await apiClient.put(`/quick-commands/${id}`, { name, command }); // 使用 apiClient
            await fetchQuickCommands(); // 更新成功后刷新列表
            uiNotificationsStore.showSuccess('快捷指令已更新');
            return true;
        } catch (err: any) {
            console.error('更新快捷指令失败:', err);
            const message = err.response?.data?.message || '更新快捷指令时发生错误';
            uiNotificationsStore.showError(message);
            return false;
        }
    };

    // 删除快捷指令
    const deleteQuickCommand = async (id: number) => {
        try {
            await apiClient.delete(`/quick-commands/${id}`); // 使用 apiClient
            // 从本地列表中移除，避免重新请求
            const index = quickCommandsList.value.findIndex(cmd => cmd.id === id);
            if (index !== -1) {
                quickCommandsList.value.splice(index, 1);
            }
            uiNotificationsStore.showSuccess('快捷指令已删除');
        } catch (err: any) {
            console.error('删除快捷指令失败:', err);
            const message = err.response?.data?.message || '删除快捷指令时发生错误';
            uiNotificationsStore.showError(message);
        }
    };

    // 增加使用次数 (调用 API，然后更新本地数据)
    const incrementUsage = async (id: number) => {
         try {
            await apiClient.post(`/quick-commands/${id}/increment-usage`); // 使用 apiClient
            // 更新本地计数，避免重新请求整个列表
            const command = quickCommandsList.value.find(cmd => cmd.id === id);
            if (command) {
                command.usage_count += 1;
                // 如果当前是按使用次数排序，可能需要重新排序或刷新列表
                if (sortBy.value === 'usage_count') {
                    // 简单起见，重新获取并排序
                    await fetchQuickCommands();
                }
            }
        } catch (err: any) {
            console.error('增加使用次数失败:', err);
            // 这里可以选择不提示用户错误，因为这是一个后台操作
        }
    };

    // 设置搜索词
    const setSearchTerm = (term: string) => {
        searchTerm.value = term;
    };

    // 设置排序方式并重新获取数据
    const setSortBy = async (newSortBy: QuickCommandSortByType) => {
        if (sortBy.value !== newSortBy) {
            sortBy.value = newSortBy;
            await fetchQuickCommands(); // 排序方式改变，重新获取数据
        }
    };

    return {
        quickCommandsList,
        searchTerm,
        sortBy,
        isLoading,
        error,
        filteredAndSortedCommands, // 使用计算属性
        fetchQuickCommands,
        addQuickCommand,
        updateQuickCommand,
        deleteQuickCommand,
        incrementUsage,
        setSearchTerm,
        setSortBy,
    };
});
