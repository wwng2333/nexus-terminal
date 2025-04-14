import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../database';

const db = getDb(); // 获取数据库实例

// 用户数据结构占位符 (理想情况下应定义在共享的 types 文件中)
interface User {
    id: number;
    username: string;
    hashed_password: string; // 数据库中存储的哈希密码
    // 其他可能的字段...
}

/**
 * 处理用户登录请求 (POST /api/v1/auth/login)
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body; // 从请求体获取用户名和密码

    // 基础输入验证
    if (!username || !password) {
        res.status(400).json({ message: '用户名和密码不能为空。' });
        return;
    }

    try {
        // 根据用户名查询用户
        const user = await new Promise<User | undefined>((resolve, reject) => {
            // 从 users 表中选择需要的字段
            db.get('SELECT id, username, hashed_password FROM users WHERE username = ?', [username], (err, row: User) => {
                if (err) {
                    console.error('查询用户时出错:', err.message);
                    // 返回通用错误信息，避免泄露数据库细节
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row); // 如果找到用户，则 resolve 用户对象；否则 resolve undefined
            });
        });

        // 如果未找到用户
        if (!user) {
            console.log(`登录尝试失败: 用户未找到 - ${username}`);
            // 返回 401 未授权状态码和通用错误信息
            res.status(401).json({ message: '无效的凭据。' });
            return;
        }

        // 比较用户提交的密码和数据库中存储的哈希密码
        const isMatch = await bcrypt.compare(password, user.hashed_password);

        // 如果密码不匹配
        if (!isMatch) {
            console.log(`登录尝试失败: 密码错误 - ${username}`);
            // 返回 401 未授权状态码和通用错误信息
            res.status(401).json({ message: '无效的凭据。' });
            return;
        }

        // --- 认证成功 ---
        console.log(`登录成功: ${username}`);

        // 在 session 中存储用户信息
        req.session.userId = user.id;
        req.session.username = user.username;

        // 返回成功响应 (可以包含一些非敏感的用户信息)
        res.status(200).json({
            message: '登录成功。',
            user: { id: user.id, username: user.username } // 不返回密码哈希
        });

    } catch (error) {
        // 捕获数据库查询或其他异步操作中的错误
        console.error('登录时出错:', error);
        res.status(500).json({ message: '登录过程中发生内部服务器错误。' });
    }
};

// 其他认证相关函数的占位符 (登出, 管理员设置等)
// export const logout = ...
// export const setupAdmin = ...
