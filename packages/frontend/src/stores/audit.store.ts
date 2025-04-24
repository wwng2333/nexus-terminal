import { defineStore } from 'pinia';
import { ref } from 'vue';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { AuditLogEntry, AuditLogApiResponse, AuditLogActionType } from '../types/server.types';

export const useAuditLogStore = defineStore('auditLog', () => {
    const logs = ref<AuditLogEntry[]>([]);
    const totalLogs = ref(0);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const currentPage = ref(1);
    const logsPerPage = ref(50); // Default page size

    // fetchLogs 现在接受一个选项对象作为参数
    const fetchLogs = async (options: {
        page?: number;
        limit?: number; // 新增 limit 参数
        searchTerm?: string;
        actionType?: AuditLogActionType | '';
        sortOrder?: 'asc' | 'desc'; // 新增 sortOrder 参数
    } = {}) => {
        const {
            page = 1,
            limit = logsPerPage.value, // 优先使用传入的 limit，否则使用 store 的默认值
            searchTerm,
            actionType,
            sortOrder
        } = options;

        isLoading.value = true;
        error.value = null;
        currentPage.value = page; // 仍然更新当前页码状态
        const offset = (page - 1) * limit; // offset 计算基于实际使用的 limit

        try {
            const params: Record<string, any> = {
                limit: limit, // 使用实际的 limit
                offset: offset,
                // 条件性添加其他参数
                ...(searchTerm && { search: searchTerm }),
                ...(actionType && { action_type: actionType }),
                ...(sortOrder && { sort_order: sortOrder }), // 添加 sort_order 参数
            };

            const response = await apiClient.get<AuditLogApiResponse>('/audit-logs', { params }); // 使用 apiClient
            // 注意：如果 fetchLogs 被用于分页，这里直接赋值 logs.value 可能不是最佳实践
            // 但对于仪表盘只获取少量最新日志的场景是可行的。
            // 如果需要支持加载更多，需要修改这里的逻辑为追加或替换。
            logs.value = response.data.logs;
            totalLogs.value = response.data.total;
        } catch (err: any) {
            console.error('Error fetching audit logs:', err);
            error.value = err.response?.data?.message || '获取审计日志失败';
            logs.value = [];
            totalLogs.value = 0;
        } finally {
            isLoading.value = false;
        }
    };

    // Function to change page size and refetch
    const setLogsPerPage = (size: number) => {
        logsPerPage.value = size;
        fetchLogs({ page: 1 }); // 重置到第一页，使用默认 limit
    };

    return {
        logs,
        totalLogs,
        isLoading,
        error,
        currentPage,
        logsPerPage,
        fetchLogs,
        setLogsPerPage,
    };
});
