import { defineStore } from 'pinia';
import axios from 'axios'; // 引入 axios

// 定义连接信息接口 (与后端对应，不含敏感信息)
export interface ConnectionInfo {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    proxy_id?: number | null; // 新增：关联的代理 ID (可选)
    tag_ids?: number[]; // 新增：关联的标签 ID 数组 (可选)
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
        // 更新参数类型以接受新的认证字段
        async addConnection(newConnectionData: {
            name: string;
            host: string;
            port: number;
            username: string;
            auth_method: 'password' | 'key';
            password?: string;
            private_key?: string;
            passphrase?: string;
            proxy_id?: number | null;
            tag_ids?: number[]; // 新增：允许传入 tag_ids
        }) {
            this.isLoading = true;
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

        // 更新连接 Action
        // 更新参数类型以包含 proxy_id 和 tag_ids
        async updateConnection(connectionId: number, updatedData: Partial<Omit<ConnectionInfo, 'id' | 'created_at' | 'updated_at' | 'last_connected_at'> & { password?: string; private_key?: string; passphrase?: string; proxy_id?: number | null; tag_ids?: number[] }>) {
            this.isLoading = true;
            this.error = null;
            try {
                // 发送 PUT 请求到 /api/v1/connections/:id
                // 注意：后端 API 需要支持接收这些字段并进行更新
                const response = await axios.put<{ message: string; connection: ConnectionInfo }>(`/api/v1/connections/${connectionId}`, updatedData);

                // 更新成功后，在列表中找到并更新对应的连接信息
                const index = this.connections.findIndex(conn => conn.id === connectionId);
                if (index !== -1) {
                    // 使用更新后的完整信息替换旧信息
                    // 注意：后端返回的 connection 可能不包含敏感信息，但应包含更新后的非敏感字段
                    this.connections[index] = { ...this.connections[index], ...response.data.connection };
                } else {
                    // 如果本地找不到，可能需要重新获取列表
                    await this.fetchConnections();
                }
                return true; // 表示成功
            } catch (err: any) {
                console.error(`更新连接 ${connectionId} 失败:`, err);
                this.error = err.response?.data?.message || err.message || `更新连接时发生未知错误。`;
                if (err.response?.status === 401) {
                    console.warn('未授权，需要登录才能更新连接。');
                }
                return false; // 表示失败
            } finally {
                this.isLoading = false;
            }
        },

        // 删除连接 Action
        async deleteConnection(connectionId: number) {
            this.isLoading = true; // 可以为删除操作单独设置加载状态
            this.error = null;
            try {
                // 发送 DELETE 请求到 /api/v1/connections/:id
                await axios.delete(`/api/v1/connections/${connectionId}`);

                // 删除成功后，从本地列表中移除该连接
                this.connections = this.connections.filter(conn => conn.id !== connectionId);
                return true; // 表示成功
            } catch (err: any) {
                console.error(`删除连接 ${connectionId} 失败:`, err);
                this.error = err.response?.data?.message || err.message || `删除连接时发生未知错误。`;
                if (err.response?.status === 401) {
                    console.warn('未授权，需要登录才能删除连接。');
                }
                // 即使删除失败，也可能需要通知用户
                return false; // 表示失败
            } finally {
                this.isLoading = false;
            }
        },
    },
});
