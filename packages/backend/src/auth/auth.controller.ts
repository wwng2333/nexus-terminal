import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../database';
import sqlite3, { RunResult } from 'sqlite3'; // 导入 RunResult 类型

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

/**
 * 处理修改密码请求 (PUT /api/v1/auth/password)
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId; // 从会话中获取用户 ID

    // 检查用户是否登录
    if (!userId) {
        res.status(401).json({ message: '用户未认证，请先登录。' });
        return;
    }

    // 基础输入验证
    if (!currentPassword || !newPassword) {
        res.status(400).json({ message: '当前密码和新密码不能为空。' });
        return;
    }

    // 可选：添加新密码复杂度要求
    if (newPassword.length < 8) {
        res.status(400).json({ message: '新密码长度至少需要 8 位。' });
        return;
    }
    if (currentPassword === newPassword) {
        res.status(400).json({ message: '新密码不能与当前密码相同。' });
        return;
    }


    try {
        // 1. 获取当前用户的哈希密码
        const user = await new Promise<User | undefined>((resolve, reject) => {
            db.get('SELECT id, hashed_password FROM users WHERE id = ?', [userId], (err, row: User) => {
                if (err) {
                    console.error(`查询用户 ${userId} 时出错:`, err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row);
            });
        });

        if (!user) {
            // 理论上不应该发生，因为 userId 来自 session
            console.error(`修改密码错误: 未找到 ID 为 ${userId} 的用户。`);
            res.status(404).json({ message: '用户不存在。' });
            return;
        }

        // 2. 验证当前密码
        const isMatch = await bcrypt.compare(currentPassword, user.hashed_password);
        if (!isMatch) {
            console.log(`修改密码尝试失败: 当前密码错误 - 用户 ID ${userId}`);
            res.status(400).json({ message: '当前密码不正确。' });
            return;
        }

        // 3. 哈希新密码
        const saltRounds = 10;
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);
        const now = Math.floor(Date.now() / 1000);

        // 4. 更新数据库中的密码
        await new Promise<void>((resolveUpdate, rejectUpdate) => {
            const stmt = db.prepare(
                'UPDATE users SET hashed_password = ?, updated_at = ? WHERE id = ?'
            );
            // 在回调函数中明确 this 的类型为 RunResult
            stmt.run(newHashedPassword, now, userId, function (this: RunResult, err: Error | null) {
                if (err) {
                    console.error(`更新用户 ${userId} 密码时出错:`, err.message);
                    return rejectUpdate(new Error('更新密码失败'));
                }
                if (this.changes === 0) {
                    // 理论上不应该发生
                     console.error(`修改密码错误: 更新影响行数为 0 - 用户 ID ${userId}`);
                     return rejectUpdate(new Error('未找到要更新的用户'));
                }
                console.log(`用户 ${userId} 密码已成功修改。`);
                resolveUpdate();
            });
            stmt.finalize();
        });

        // 5. 返回成功响应
        res.status(200).json({ message: '密码已成功修改。' });

    } catch (error) {
        console.error(`修改用户 ${userId} 密码时发生内部错误:`, error);
        res.status(500).json({ message: '修改密码过程中发生内部服务器错误。' });
    }
};
