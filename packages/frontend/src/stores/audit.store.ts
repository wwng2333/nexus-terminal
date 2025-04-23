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

    // Updated fetchLogs to accept searchTerm and actionType directly
    const fetchLogs = async (
        page: number = 1,
        searchTerm?: string,
        actionType?: AuditLogActionType | '' // Allow empty string from select
    ) => {
        isLoading.value = true;
        error.value = null;
        currentPage.value = page;
        const offset = (page - 1) * logsPerPage.value;

        try {
            const params: Record<string, any> = {
                limit: logsPerPage.value,
                offset: offset,
                // Add new filter parameters if they have values
                ...(searchTerm && { search: searchTerm }),
                ...(actionType && { action_type: actionType }),
            };
            // No need to remove undefined keys here as we conditionally add them

            const response = await apiClient.get<AuditLogApiResponse>('/audit-logs', { params }); // 使用 apiClient
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
        fetchLogs(1); // Reset to first page when size changes
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
