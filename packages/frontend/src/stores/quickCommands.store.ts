import { defineStore } from 'pinia';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { ref, computed } from 'vue';
import { useUiNotificationsStore } from './uiNotifications.store';
import type { QuickCommand } from '../types/quick-commands.types'; // 引入本地 QuickCommand 类型

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
    const selectedIndex = ref<number>(-1); // NEW: Index of the selected command in the filtered list

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

    // NEW: Action to select the next command in the filtered list
    const selectNextCommand = () => {
        const commands = filteredAndSortedCommands.value;
        if (commands.length === 0) {
            selectedIndex.value = -1;
            return;
        }
        selectedIndex.value = (selectedIndex.value + 1) % commands.length;
    };

    // NEW: Action to select the previous command in the filtered list
    const selectPreviousCommand = () => {
        const commands = filteredAndSortedCommands.value;
        if (commands.length === 0) {
            selectedIndex.value = -1;
            return;
        }
        selectedIndex.value = (selectedIndex.value - 1 + commands.length) % commands.length;
    };

    // 从后端获取快捷指令 (带缓存和排序)
    const fetchQuickCommands = async () => {
        const cacheKey = 'quickCommandsCache';
        // 将排序方式加入缓存键，确保不同排序有不同缓存
        const cacheKeyWithSort = `${cacheKey}_${sortBy.value}`;
        error.value = null; // 重置错误

        // 1. 尝试从 localStorage 加载缓存
        try {
            const cachedData = localStorage.getItem(cacheKeyWithSort);
            if (cachedData) {
                console.log(`[QuickCmdStore] Loading commands from cache (sort: ${sortBy.value}).`);
                quickCommandsList.value = JSON.parse(cachedData);
                isLoading.value = false; // 先显示缓存
            } else {
                isLoading.value = true; // 无缓存，初始加载
            }
        } catch (e) {
            console.error('[QuickCmdStore] Failed to load or parse commands cache:', e);
            localStorage.removeItem(cacheKeyWithSort); // 解析失败则移除缓存
            isLoading.value = true; // 缓存无效，需要加载
        }

        // 2. 后台获取最新数据
        isLoading.value = true; // 标记正在后台获取
        try {
            console.log(`[QuickCmdStore] Fetching latest commands from server (sort: ${sortBy.value})...`);
            const response = await apiClient.get<QuickCommandFE[]>('/quick-commands', {
                params: { sortBy: sortBy.value }
            });
            const freshData = response.data;
            const freshDataString = JSON.stringify(freshData);

            // 3. 对比并更新
            const currentDataString = JSON.stringify(quickCommandsList.value);
            if (currentDataString !== freshDataString) {
                console.log('[QuickCmdStore] Commands data changed, updating state and cache.');
                quickCommandsList.value = freshData;
                localStorage.setItem(cacheKeyWithSort, freshDataString); // 更新对应排序的缓存
            } else {
                console.log('[QuickCmdStore] Commands data is up-to-date.');
            }
            error.value = null; // 清除错误
        } catch (err: any) {
            console.error('[QuickCmdStore] 获取快捷指令失败:', err);
            error.value = err.response?.data?.message || '获取快捷指令时发生错误';
            // 保留缓存数据，仅设置错误状态
            uiNotificationsStore.showError(error.value ?? '未知错误');
        } finally {
            isLoading.value = false; // 加载完成
        }
    };

    // 清除所有排序的快捷指令缓存
    const clearQuickCommandsCache = () => {
        const cacheKeyBase = 'quickCommandsCache';
        // 移除两种排序的缓存
        localStorage.removeItem(`${cacheKeyBase}_name`);
        localStorage.removeItem(`${cacheKeyBase}_usage_count`);
        console.log('[QuickCmdStore] Cleared all quick commands caches.');
    };


    // 添加快捷指令 (添加后清除缓存)
    const addQuickCommand = async (name: string | null, command: string): Promise<boolean> => {
        try {
            await apiClient.post('/quick-commands', { name, command });
            clearQuickCommandsCache(); // 清除所有排序缓存
            await fetchQuickCommands(); // 刷新当前排序的列表和缓存
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
            await apiClient.put(`/quick-commands/${id}`, { name, command });
            clearQuickCommandsCache(); // 清除所有排序缓存
            await fetchQuickCommands(); // 刷新当前排序的列表和缓存
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
            await apiClient.delete(`/quick-commands/${id}`);
            clearQuickCommandsCache(); // 清除所有排序缓存
            // 从本地列表中移除
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
                    // 清除所有排序缓存并重新获取当前排序
                    clearQuickCommandsCache();
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
        selectedIndex.value = -1; // Reset selection when search term changes
    };

    // 设置排序方式并重新获取数据
    const setSortBy = async (newSortBy: QuickCommandSortByType) => {
        if (sortBy.value !== newSortBy) {
            sortBy.value = newSortBy;
            // 排序方式改变，不需要清除缓存，fetchQuickCommands 会读取对应排序的缓存或重新获取
            await fetchQuickCommands();
        }
    };

    // NEW: Action to reset the selection
    const resetSelection = () => {
        selectedIndex.value = -1;
    };

    // Removed duplicate resetSelection definition

    return {
        quickCommandsList,
        searchTerm,
        sortBy,
        isLoading,
        error,
        filteredAndSortedCommands, // 使用计算属性
        selectedIndex, // NEW: Expose selected index
        fetchQuickCommands,
        addQuickCommand,
        updateQuickCommand,
        deleteQuickCommand,
        incrementUsage,
        setSearchTerm,
        setSortBy,
        selectNextCommand, // NEW: Expose action
        selectPreviousCommand, // NEW: Expose action
        resetSelection, // Ensure resetSelection is exported
    };
});
