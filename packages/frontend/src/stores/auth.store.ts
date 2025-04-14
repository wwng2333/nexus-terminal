import { defineStore } from 'pinia';
import axios from 'axios';
import router from '../router'; // 引入 router 用于重定向

// 用户信息接口 (不含敏感信息)
interface UserInfo {
    id: number;
    username: string;
}

// Auth Store State 接口
interface AuthState {
    isAuthenticated: boolean;
    user: UserInfo | null;
    isLoading: boolean;
    error: string | null;
}

export const useAuthStore = defineStore('auth', {
    state: (): AuthState => ({
        isAuthenticated: false, // 初始为未登录
        user: null,
        isLoading: false,
        error: null,
    }),
    getters: {
        // 可以添加一些 getter，例如获取用户名
        loggedInUser: (state) => state.user?.username,
    },
    actions: {
        // 登录 Action
        async login(credentials: { username: string; password: string }) {
            this.isLoading = true;
            this.error = null;
            try {
                const response = await axios.post<{ message: string; user: UserInfo }>('/api/v1/auth/login', credentials);
                // 登录成功
                this.isAuthenticated = true;
                this.user = response.data.user;
                console.log('登录成功:', this.user);
                // 登录成功后重定向到连接管理页面 (或仪表盘)
                await router.push({ name: 'Connections' }); // 使用 await 确保导航完成
                return true;
            } catch (err: any) {
                console.error('登录失败:', err);
                this.isAuthenticated = false;
                this.user = null;
                this.error = err.response?.data?.message || err.message || '登录时发生未知错误。';
                return false;
            } finally {
                this.isLoading = false;
            }
        },

        // 登出 Action (占位符)
        async logout() {
            this.isLoading = true;
            this.error = null;
            try {
                // TODO: 调用后端的登出 API (如果需要)
                // await axios.post('/api/v1/auth/logout');

                // 清除本地状态
                this.isAuthenticated = false;
                this.user = null;
                console.log('已登出');
                // 登出后重定向到登录页
                await router.push({ name: 'Login' });
            } catch (err: any) {
                console.error('登出失败:', err);
                this.error = err.response?.data?.message || err.message || '登出时发生未知错误。';
            } finally {
                this.isLoading = false;
            }
        },

        // TODO: 添加检查登录状态的 Action (例如应用启动时调用)
        // TODO: 添加检查登录状态的 Action (例如应用启动时调用)
        // async checkAuthStatus() {
        //     const token = localStorage.getItem('authToken'); // 假设 token 存储在 localStorage
        //     if (token) {
        //         try {
        //             // 可选: 向后端发送请求验证 token 有效性
        //             // const response = await axios.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        //             // this.isAuthenticated = true;
        //             // this.user = response.data.user;
        //
        //             // 暂时只基于 localStorage 状态恢复
        //             const storedAuth = localStorage.getItem('auth'); // pinia-plugin-persistedstate 默认 key
        //             if (storedAuth) {
        //                 const parsedAuth = JSON.parse(storedAuth);
        //                 if (parsedAuth.isAuthenticated && parsedAuth.user) {
        //                     this.isAuthenticated = true;
        //                     this.user = parsedAuth.user;
        //                     console.log('Auth status restored from localStorage');
        //                 }
        //             }
        //         } catch (error) {
        //             console.error('Failed to restore auth status:', error);
        //             this.logout(); // 如果验证失败或出错，则登出
        //         }
        //     }
        // }
    },
    persist: true, // 使用默认持久化配置 (localStorage, 持久化所有 state)
});
