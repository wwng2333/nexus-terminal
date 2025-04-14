import { defineStore } from 'pinia';
import axios from 'axios'; // 引入 axios

// 定义连接信息接口 (与后端对应，不含敏感信息)
export interface ConnectionInfo {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password';
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

// 定义 Store State 的接口
interface ConnectionsState {
    connections: ConnectionInfo[];
    isLoading: boolean;
    error: string | null;
}

// 定义 Pinia Store
export const useConnectionsStore = defineStore('connections', {
    state: (): ConnectionsState => ({
        connections: [],
        isLoading: false,
        error: null,
    }),
    actions: {
        // 获取连接列表 Action
        async fetchConnections() {
            this.isLoading = true;
            this.error = null;
            try {
                // 注意：axios 默认会携带 cookie，因此如果用户已登录，会话 cookie 会被发送
                const response = await axios.get<ConnectionInfo[]>('/api/v1/connections');
                this.connections = response.data;
            } catch (err: any) {
                console.error('获取连接列表失败:', err);
                this.error = err.response?.data?.message || err.message || '获取连接列表时发生未知错误。';
                // 如果是 401 未授权，可能需要触发重新登录逻辑
                if (err.response?.status === 401) {
                    // TODO: 处理未授权情况，例如跳转到登录页
                    console.warn('未授权，需要登录才能获取连接列表。');
                }
            } finally {
                this.isLoading = false;
            }
        },

        // 添加新连接 Action
        async addConnection(newConnectionData: { name: string; host: string; port: number; username: string; password: string }) {
            this.isLoading = true; // 可以为添加操作单独设置加载状态，或共用 isLoading
            this.error = null;
            try {
                const response = await axios.post<{ message: string; connection: ConnectionInfo }>('/api/v1/connections', newConnectionData);
                // 添加成功后，将新连接添加到列表前面 (或重新获取整个列表)
                this.connections.unshift(response.data.connection);
                return true; // 表示成功
            } catch (err: any) {
                console.error('添加连接失败:', err);
                this.error = err.response?.data?.message || err.message || '添加连接时发生未知错误。';
                 if (err.response?.status === 401) {
                    console.warn('未授权，需要登录才能添加连接。');
                }
                return false; // 表示失败
            } finally {
                this.isLoading = false;
            }
        },
    },
});
