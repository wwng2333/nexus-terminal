import { defineStore } from 'pinia';
import axios from 'axios';
import router from '../router'; // 引入 router 用于重定向

// 扩展的用户信息接口，包含 2FA 状态
interface UserInfo {
    id: number;
    username: string;
    isTwoFactorEnabled?: boolean; // 后端 /status 接口会返回这个
}

// Auth Store State 接口
interface AuthState {
    isAuthenticated: boolean;
    user: UserInfo | null;
    isLoading: boolean;
    error: string | null;
    loginRequires2FA: boolean; // 新增状态：标记登录是否需要 2FA
}

export const useAuthStore = defineStore('auth', {
    state: (): AuthState => ({
        isAuthenticated: false, // 初始为未登录
        user: null,
        isLoading: false,
        error: null,
        loginRequires2FA: false, // 初始为不需要
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
            this.loginRequires2FA = false; // 重置 2FA 状态
            try {
                // 后端可能返回 user 或 requiresTwoFactor
                const response = await axios.post<{ message: string; user?: UserInfo; requiresTwoFactor?: boolean }>('/api/v1/auth/login', credentials);

                if (response.data.requiresTwoFactor) {
                    // 需要 2FA 验证
                    console.log('登录需要 2FA 验证');
                    this.loginRequires2FA = true;
                    // 不设置 isAuthenticated 和 user，等待 2FA 验证
                    return { requiresTwoFactor: true }; // 返回特殊状态给调用者
                } else if (response.data.user) {
                    // 登录成功 (无 2FA)
                    this.isAuthenticated = true;
                    this.user = response.data.user;
                    console.log('登录成功 (无 2FA):', this.user);
                    await router.push({ name: 'Connections' });
                    return { success: true };
                } else {
                    // 不应该发生，但作为防御性编程
                    throw new Error('登录响应无效');
                }
            } catch (err: any) {
                console.error('登录失败:', err);
                this.isAuthenticated = false;
                this.user = null;
                this.loginRequires2FA = false;
                this.error = err.response?.data?.message || err.message || '登录时发生未知错误。';
                return { success: false, error: this.error };
            } finally {
                this.isLoading = false;
            }
        },

        // 登录时的 2FA 验证 Action
        async verifyLogin2FA(token: string) {
            if (!this.loginRequires2FA) {
                throw new Error('当前登录流程不需要 2FA 验证。');
            }
            this.isLoading = true;
            this.error = null;
            try {
                const response = await axios.post<{ message: string; user: UserInfo }>('/api/v1/auth/login/2fa', { token });
                // 2FA 验证成功
                this.isAuthenticated = true;
                this.user = response.data.user;
                this.loginRequires2FA = false; // 重置状态
                console.log('2FA 验证成功，登录完成:', this.user);
                await router.push({ name: 'Connections' });
                return { success: true };
            } catch (err: any) {
                console.error('2FA 验证失败:', err);
                // 不清除 isAuthenticated 或 user，因为用户可能只是输错了验证码
                this.error = err.response?.data?.message || err.message || '2FA 验证时发生未知错误。';
                return { success: false, error: this.error };
            } finally {
                this.isLoading = false;
            }
        },


        // 登出 Action
        async logout() {
            this.isLoading = true;
            this.error = null;
            this.loginRequires2FA = false; // 重置 2FA 状态
            try {
                // TODO: 调用后端的登出 API
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

        // 新增：检查并更新认证状态 Action
        async checkAuthStatus() {
            this.isLoading = true;
            try {
                const response = await axios.get<{ isAuthenticated: boolean; user: UserInfo }>('/api/v1/auth/status');
                if (response.data.isAuthenticated && response.data.user) {
                    this.isAuthenticated = true;
                    this.user = response.data.user; // 更新用户信息，包含 isTwoFactorEnabled
                    this.loginRequires2FA = false; // 确保重置
                    console.log('认证状态已更新:', this.user);
                } else {
                    this.isAuthenticated = false;
                    this.user = null;
                    this.loginRequires2FA = false;
                }
            } catch (error: any) {
                // 如果获取状态失败 (例如 session 过期)，则认为未认证
                console.warn('检查认证状态失败:', error.response?.data?.message || error.message);
                this.isAuthenticated = false;
                this.user = null;
                this.loginRequires2FA = false;
                // 可选：如果不是 401 错误，可以记录更详细的日志
            } finally {
                this.isLoading = false;
            }
        },

        // 修改密码 Action
        async changePassword(currentPassword: string, newPassword: string) {
            if (!this.isAuthenticated) {
                throw new Error('用户未登录，无法修改密码。');
            }
            this.isLoading = true;
            this.error = null;
            try {
                const response = await axios.put<{ message: string }>('/api/v1/auth/password', {
                    currentPassword,
                    newPassword,
                });
                console.log('密码修改成功:', response.data.message);
                // 密码修改成功后，通常不需要更新本地状态，但可以清除错误
                return true;
            } catch (err: any) {
                console.error('修改密码失败:', err);
                this.error = err.response?.data?.message || err.message || '修改密码时发生未知错误。';
                // 抛出错误，以便组件可以捕获并显示 (提供默认消息以防 this.error 为 null)
                throw new Error(this.error ?? '修改密码时发生未知错误。');
            } finally {
                this.isLoading = false;
            }
        },
    },
    persist: true, // 使用默认持久化配置 (localStorage, 持久化所有 state)
});
