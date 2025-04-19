import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../database';
import sqlite3, { RunResult } from 'sqlite3';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { PasskeyService } from '../services/passkey.service'; // 导入 PasskeyService
import { NotificationService } from '../services/notification.service'; // 导入 NotificationService
import { AuditLogService } from '../services/audit.service'; // 导入 AuditLogService
import { ipBlacklistService } from '../services/ip-blacklist.service'; // 导入 IP 黑名单服务

const db = getDb();
const passkeyService = new PasskeyService(); // 实例化 PasskeyService
const notificationService = new NotificationService(); // 实例化 NotificationService
const auditLogService = new AuditLogService(); // 实例化 AuditLogService

// 用户数据结构占位符 (理想情况下应定义在共享的 types 文件中)
interface User {
    id: number;
    username: string;
    hashed_password: string; // 数据库中存储的哈希密码
    two_factor_secret?: string | null; // 2FA 密钥 (数据库中可能为 NULL)
    // 其他可能的字段...
}

// 扩展 SessionData 接口以包含临时的 2FA 密钥
declare module 'express-session' {
    interface SessionData {
        userId?: number;
        username?: string;
        tempTwoFactorSecret?: string;
        requiresTwoFactor?: boolean;
        currentChallenge?: string; // 用于存储 Passkey 操作的挑战
        rememberMe?: boolean; // 新增：临时存储“记住我”选项
    }
}


/**
 * 处理用户登录请求 (POST /api/v1/auth/login)
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    // 从请求体中解构 username, password 和可选的 rememberMe
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: '用户名和密码不能为空。' });
        return;
    }

    try {
        const user = await new Promise<User | undefined>((resolve, reject) => {
            // 查询用户，包含 2FA 密钥
            db.get('SELECT id, username, hashed_password, two_factor_secret FROM users WHERE username = ?', [username], (err, row: User) => {
                if (err) {
                    console.error('查询用户时出错:', err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row);
            });
        });

        if (!user) {
            console.log(`登录尝试失败: 用户未找到 - ${username}`);
            const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
            // 记录失败尝试
            ipBlacklistService.recordFailedAttempt(clientIp);
            // 记录审计日志 (添加 IP)
            auditLogService.logAction('LOGIN_FAILURE', { username, reason: 'User not found', ip: clientIp });
            // 发送登录失败通知
            notificationService.sendNotification('LOGIN_FAILURE', { username, reason: 'User not found', ip: clientIp });
            res.status(401).json({ message: '无效的凭据。' });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.hashed_password);

        if (!isMatch) {
            console.log(`登录尝试失败: 密码错误 - ${username}`);
            const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
            // 记录失败尝试
            ipBlacklistService.recordFailedAttempt(clientIp);
            // 记录审计日志 (添加 IP)
            auditLogService.logAction('LOGIN_FAILURE', { username, reason: 'Invalid password', ip: clientIp });
            // 发送登录失败通知
            notificationService.sendNotification('LOGIN_FAILURE', { username, reason: 'Invalid password', ip: clientIp });
            res.status(401).json({ message: '无效的凭据。' });
            return;
        }

        // 检查是否启用了 2FA
        if (user.two_factor_secret) {
            console.log(`用户 ${username} 已启用 2FA，需要进行二次验证。`);
            // 不设置完整 session，只标记需要 2FA
            req.session.userId = user.id; // 临时存储 userId 以便 2FA 验证
            req.session.requiresTwoFactor = true;
            req.session.rememberMe = rememberMe; // 临时存储 rememberMe 状态
            res.status(200).json({ message: '需要进行两步验证。', requiresTwoFactor: true });
        } else {
            // --- 认证成功 (未启用 2FA) ---
            console.log(`登录成功 (无 2FA): ${username}`);
            const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
            // 重置失败尝试次数
            ipBlacklistService.resetAttempts(clientIp);
            // 记录审计日志 (添加 IP)
            auditLogService.logAction('LOGIN_SUCCESS', { userId: user.id, username, ip: clientIp });
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.requiresTwoFactor = false; // 明确标记不需要 2FA

            // 根据 rememberMe 设置 cookie maxAge
            if (rememberMe) {
                // 如果记住我，使用默认的 maxAge (在 index.ts 中设置，通常是 7 天)
                // 如果需要强制覆盖为 7 天，取消下一行注释
                // req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7;
            } else {
                // 如果不记住我，设置为会话 cookie (浏览器关闭时过期)
                req.session.cookie.maxAge = undefined; // 使用 undefined 表示会话 cookie
            }

            res.status(200).json({
                message: '登录成功。',
                user: { id: user.id, username: user.username }
            });
        }

    } catch (error) {
        console.error('登录时出错:', error);
        res.status(500).json({ message: '登录过程中发生内部服务器错误。' });
    }
};

/**
 * 获取当前用户的认证状态 (GET /api/v1/auth/status)
 */
export const getAuthStatus = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const username = req.session.username;

    if (!userId || !username || req.session.requiresTwoFactor) {
        // 如果 session 无效或 2FA 未完成，视为未认证
        res.status(401).json({ isAuthenticated: false });
        return;
    }

    try {
        // 查询用户的 2FA 状态
        const user = await new Promise<{ two_factor_secret: string | null } | undefined>((resolve, reject) => {
            db.get('SELECT two_factor_secret FROM users WHERE id = ?', [userId], (err, row: { two_factor_secret: string | null }) => {
                if (err) {
                    console.error(`查询用户 ${userId} 2FA 状态时出错:`, err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row);
            });
        });

        // 如果找不到用户（理论上不应发生），也视为未认证
        if (!user) {
             res.status(401).json({ isAuthenticated: false });
             return;
        }

        res.status(200).json({
            isAuthenticated: true,
            user: {
                id: userId,
                username: username,
                isTwoFactorEnabled: !!user.two_factor_secret // 返回 2FA 是否启用
            }
        });

    } catch (error) {
        console.error(`获取用户 ${userId} 状态时发生内部错误:`, error);
        res.status(500).json({ message: '获取认证状态时发生内部服务器错误。' });
    }
};
/**
 * 处理登录时的 2FA 验证 (POST /api/v1/auth/login/2fa)
 */
export const verifyLogin2FA = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body;
    const userId = req.session.userId; // 获取之前临时存储的 userId

    // 检查 session 状态
    if (!userId || !req.session.requiresTwoFactor) {
        res.status(400).json({ message: '无效的请求或会话状态。' });
        return;
    }

    if (!token) {
        res.status(400).json({ message: '验证码不能为空。' });
        return;
    }

    try {
        // 获取用户的 2FA 密钥
        const user = await new Promise<User | undefined>((resolve, reject) => {
            db.get('SELECT id, username, two_factor_secret FROM users WHERE id = ?', [userId], (err, row: User) => {
                if (err) {
                    console.error(`查询用户 ${userId} 的 2FA 密钥时出错:`, err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row);
            });
        });

        if (!user || !user.two_factor_secret) {
            console.error(`2FA 验证错误: 未找到用户 ${userId} 或未设置密钥。`);
            res.status(400).json({ message: '无法验证，请重新登录。' });
            return;
        }

        // 验证 TOTP 令牌
        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1 // 允许前后一个时间窗口 (30秒) 的容错
        });

        if (verified) {
            console.log(`用户 ${user.username} 2FA 验证成功。`);
            const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
            // 重置失败尝试次数
            ipBlacklistService.resetAttempts(clientIp);
            // 记录审计日志 (2FA 成功也算登录成功) (添加 IP)
            auditLogService.logAction('LOGIN_SUCCESS', { userId: user.id, username: user.username, ip: clientIp, twoFactor: true });
            // 验证成功，建立完整会话
            req.session.username = user.username;
            req.session.requiresTwoFactor = false; // 标记 2FA 已完成

            // 根据之前存储在 session 中的 rememberMe 设置 cookie maxAge
            if (req.session.rememberMe) {
                // 如果记住我，使用默认的 maxAge
                // req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7;
            } else {
                // 如果不记住我，设置为会话 cookie
                req.session.cookie.maxAge = undefined;
            }
            // 清除临时的 rememberMe 状态
            delete req.session.rememberMe;

            res.status(200).json({
                message: '登录成功。',
                user: { id: user.id, username: user.username }
            });
        } else {
            console.log(`用户 ${user.username} 2FA 验证失败: 验证码错误。`);
            const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
            // 记录失败尝试
            ipBlacklistService.recordFailedAttempt(clientIp);
            // 记录审计日志 (添加 IP)
            auditLogService.logAction('LOGIN_FAILURE', { userId: user.id, username: user.username, reason: 'Invalid 2FA token', ip: clientIp });
            res.status(401).json({ message: '验证码无效。' });
        }

    } catch (error) {
        console.error(`用户 ${userId} 2FA 验证时发生内部错误:`, error);
        res.status(500).json({ message: '两步验证过程中发生内部服务器错误。' });
    }
};


/**
 * 处理修改密码请求 (PUT /api/v1/auth/password)
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId; // 从会话中获取用户 ID

    // 检查用户是否登录且 2FA 已完成 (如果需要)
    if (!userId || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成，请先登录。' });
        return;
    }

    // 基础输入验证
    if (!currentPassword || !newPassword) {
        res.status(400).json({ message: '当前密码和新密码不能为空。' });
        return;
    }
    if (newPassword.length < 8) {
        res.status(400).json({ message: '新密码长度至少需要 8 位。' });
        return;
    }
    if (currentPassword === newPassword) {
        res.status(400).json({ message: '新密码不能与当前密码相同。' });
        return;
    }

    try {
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
            console.error(`修改密码错误: 未找到 ID 为 ${userId} 的用户。`);
            res.status(404).json({ message: '用户不存在。' });
            return;
        }

        const isMatch = await bcrypt.compare(currentPassword, user.hashed_password);
        if (!isMatch) {
            console.log(`修改密码尝试失败: 当前密码错误 - 用户 ID ${userId}`);
            res.status(400).json({ message: '当前密码不正确。' });
            return;
        }

        const saltRounds = 10;
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);
        const now = Math.floor(Date.now() / 1000);

        await new Promise<void>((resolveUpdate, rejectUpdate) => {
            const stmt = db.prepare(
                'UPDATE users SET hashed_password = ?, updated_at = ? WHERE id = ?'
            );
            stmt.run(newHashedPassword, now, userId, function (this: RunResult, err: Error | null) {
                if (err) {
                    console.error(`更新用户 ${userId} 密码时出错:`, err.message);
                    return rejectUpdate(new Error('更新密码失败'));
                }
                if (this.changes === 0) {
                     console.error(`修改密码错误: 更新影响行数为 0 - 用户 ID ${userId}`);
                 return rejectUpdate(new Error('未找到要更新的用户'));
                }
                console.log(`用户 ${userId} 密码已成功修改。`);
                const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
                // 记录审计日志 (添加 IP)
                auditLogService.logAction('PASSWORD_CHANGED', { userId, ip: clientIp });
                resolveUpdate();
            });
            stmt.finalize();
        });

        res.status(200).json({ message: '密码已成功修改。' });

    } catch (error) {
        console.error(`修改用户 ${userId} 密码时发生内部错误:`, error);
        res.status(500).json({ message: '修改密码过程中发生内部服务器错误。' });
    }
};

/**
 * 开始 2FA 设置流程 (POST /api/v1/auth/2fa/setup)
 * 生成临时密钥和二维码
 */
export const setup2FA = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const username = req.session.username; // 获取用户名用于 OTP URL

    if (!userId || !username || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成。' });
        return;
    }

    try {
        // 检查用户是否已启用 2FA
        const existingSecret = await new Promise<string | null>((resolve, reject) => {
            db.get('SELECT two_factor_secret FROM users WHERE id = ?', [userId], (err, row: { two_factor_secret: string | null }) => {
                if (err) reject(err);
                else resolve(row ? row.two_factor_secret : null);
            });
        });

        if (existingSecret) {
            res.status(400).json({ message: '两步验证已启用。如需重置，请先禁用。' });
            return;
        }

        // 生成新的 2FA 密钥
        const secret = speakeasy.generateSecret({
            length: 20,
            name: `NexusTerminal (${username})` // 应用名称和用户名，显示在 Authenticator 应用中
        });

        // 将临时密钥存储在 session 中，等待验证
        req.session.tempTwoFactorSecret = secret.base32;

        // 生成 OTP Auth URL (用于生成二维码)
        if (!secret.otpauth_url) {
            throw new Error('无法生成 OTP Auth URL');
        }

        // 生成二维码 Data URL
        qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) {
                console.error('生成二维码时出错:', err);
                throw new Error('生成二维码失败');
            }
            // 返回密钥 (base32) 和二维码数据 URL 给前端
            res.json({
                secret: secret.base32, // 供用户手动输入
                qrCodeUrl: data_url    // 用于显示二维码图片
            });
        });

    } catch (error: any) {
        console.error(`用户 ${userId} 设置 2FA 时出错:`, error);
        res.status(500).json({ message: '设置两步验证时发生错误。', error: error.message });
    }
};


// --- 新增 Passkey 相关方法 ---

/**
 * 生成 Passkey 注册选项 (POST /api/v1/auth/passkey/register-options)
 */
export const generatePasskeyRegistrationOptions = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const username = req.session.username; // Passkey 需要用户名

    if (!userId || !username || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成。' });
        return;
    }

    try {
        const options = await passkeyService.generateRegistrationOptions(username);

        // 将 challenge 存储在 session 中，用于后续验证
        req.session.currentChallenge = options.challenge;

        res.json(options);
    } catch (error: any) {
        console.error(`用户 ${userId} 生成 Passkey 注册选项时出错:`, error);
        res.status(500).json({ message: '生成 Passkey 注册选项失败。', error: error.message });
    }
};

/**
 * 验证 Passkey 注册响应 (POST /api/v1/auth/passkey/verify-registration)
 */
export const verifyPasskeyRegistration = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const expectedChallenge = req.session.currentChallenge;
    const { registrationResponse, name } = req.body; // name 是用户给 Passkey 起的名字 (可选)

    if (!userId || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成。' });
        return;
    }

    if (!expectedChallenge) {
        res.status(400).json({ message: '未找到预期的挑战，请重新生成注册选项。' });
        return;
    }

    if (!registrationResponse) {
        res.status(400).json({ message: '缺少注册响应数据。' });
        return;
    }

    // 清除 session 中的 challenge，无论成功与否
    delete req.session.currentChallenge;

    try {
        const verification = await passkeyService.verifyRegistration(
            registrationResponse,
            expectedChallenge,
            name
        );

        // Check if verification was successful and registrationInfo is present
        if (verification.verified && verification.registrationInfo) {
             const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
             // 记录审计日志 (添加 IP)
            // Use type assertion 'as any' to bypass persistent TS error for now
            const regInfo: any = verification.registrationInfo;
            auditLogService.logAction('PASSKEY_REGISTERED', { userId, passkeyId: regInfo.credentialID, name, ip: clientIp });
            res.status(201).json({ message: 'Passkey 注册成功！', verified: true });
        } else {
            console.error(`用户 ${userId} Passkey 注册验证失败:`, verification);
            res.status(400).json({ message: 'Passkey 注册验证失败。', verified: false });
        }
    } catch (error: any) {
        console.error(`用户 ${userId} 验证 Passkey 注册时出错:`, error);
        res.status(500).json({ message: '验证 Passkey 注册失败。', error: error.message });
    }
};

/**
 * 验证并激活 2FA (POST /api/v1/auth/2fa/verify)
 */
export const verifyAndActivate2FA = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body;
    const userId = req.session.userId;
    const tempSecret = req.session.tempTwoFactorSecret; // 获取存储在 session 中的临时密钥

    if (!userId || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成。' });
        return;
    }

    if (!tempSecret) {
        res.status(400).json({ message: '未找到临时密钥，请重新开始设置流程。' });
        return;
    }

    if (!token) {
        res.status(400).json({ message: '验证码不能为空。' });
        return;
    }

    try {
        // 使用临时密钥验证用户提交的令牌
        const verified = speakeasy.totp.verify({
            secret: tempSecret,
            encoding: 'base32',
            token: token,
            window: 1 // 允许一定的时钟漂移
        });

        if (verified) {
            // 验证成功，将密钥永久存储到数据库
            const now = Math.floor(Date.now() / 1000);
            await new Promise<void>((resolveUpdate, rejectUpdate) => {
                const stmt = db.prepare(
                    'UPDATE users SET two_factor_secret = ?, updated_at = ? WHERE id = ?'
                );
                stmt.run(tempSecret, now, userId, function (this: RunResult, err: Error | null) {
                    if (err) {
                        console.error(`更新用户 ${userId} 的 2FA 密钥时出错:`, err.message);
                        return rejectUpdate(new Error('激活两步验证失败'));
                    }
                    if (this.changes === 0) {
                         console.error(`激活 2FA 错误: 更新影响行数为 0 - 用户 ID ${userId}`);
                     return rejectUpdate(new Error('未找到要更新的用户'));
                    }
                    console.log(`用户 ${userId} 已成功激活两步验证。`);
                    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
                    // 记录审计日志 (添加 IP)
                    auditLogService.logAction('2FA_ENABLED', { userId, ip: clientIp });
                    resolveUpdate();
                });
                stmt.finalize();
            });

            // 清除 session 中的临时密钥
            delete req.session.tempTwoFactorSecret;

            res.status(200).json({ message: '两步验证已成功激活！' });
        } else {
            // 验证失败
            console.log(`用户 ${userId} 2FA 激活失败: 验证码错误。`);
            res.status(400).json({ message: '验证码无效。' });
        }

    } catch (error: any) {
        console.error(`用户 ${userId} 验证并激活 2FA 时出错:`, error);
        res.status(500).json({ message: '验证两步验证码时发生错误。', error: error.message });
    }
};

/**
 * 禁用 2FA (DELETE /api/v1/auth/2fa)
 */
export const disable2FA = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const { password } = req.body; // 需要验证当前密码以禁用

    if (!userId || req.session.requiresTwoFactor) {
        res.status(401).json({ message: '用户未认证或认证未完成。' });
        return;
    }

    if (!password) {
        res.status(400).json({ message: '需要提供当前密码才能禁用两步验证。' });
        return;
    }

    try {
        // 1. 验证当前密码
        const user = await new Promise<User | undefined>((resolve, reject) => {
            db.get('SELECT id, hashed_password FROM users WHERE id = ?', [userId], (err, row: User) => {
                if (err) reject(err); else resolve(row);
            });
        });
        if (!user) {
            res.status(404).json({ message: '用户不存在。' }); return;
        }
        const isMatch = await bcrypt.compare(password, user.hashed_password);
        if (!isMatch) {
            res.status(400).json({ message: '当前密码不正确。' }); return;
        }

        // 2. 清除数据库中的 2FA 密钥
        const now = Math.floor(Date.now() / 1000);
        await new Promise<void>((resolveUpdate, rejectUpdate) => {
            const stmt = db.prepare(
                'UPDATE users SET two_factor_secret = NULL, updated_at = ? WHERE id = ?'
            );
            stmt.run(now, userId, function (this: RunResult, err: Error | null) {
                if (err) {
                    console.error(`清除用户 ${userId} 的 2FA 密钥时出错:`, err.message);
                    return rejectUpdate(new Error('禁用两步验证失败'));
                }
                if (this.changes === 0) {
                     console.error(`禁用 2FA 错误: 更新影响行数为 0 - 用户 ID ${userId}`);
                     return rejectUpdate(new Error('未找到要更新的用户'));
                }
                console.log(`用户 ${userId} 已成功禁用两步验证。`);
                const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
                // 记录审计日志 (添加 IP)
                auditLogService.logAction('2FA_DISABLED', { userId, ip: clientIp });
                resolveUpdate();
            });
            stmt.finalize();
        });

        res.status(200).json({ message: '两步验证已成功禁用。' });

    } catch (error: any) {
        console.error(`用户 ${userId} 禁用 2FA 时出错:`, error);
        res.status(500).json({ message: '禁用两步验证时发生错误。', error: error.message });
    }
};

/**
 * 检查是否需要进行初始设置 (GET /api/v1/auth/needs-setup)
 * 如果数据库中没有用户，则需要设置。
 */
export const needsSetup = async (req: Request, res: Response): Promise<void> => {
    try {
        const userCount = await new Promise<number>((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', (err, row: { count: number }) => {
                if (err) {
                    console.error('检查 users 表时出错:', err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row ? row.count : 0); // 如果表为空，row 可能为 undefined
            });
        });

        res.status(200).json({ needsSetup: userCount === 0 });

    } catch (error) {
        console.error('检查设置状态时发生内部错误:', error);
        // 如果检查失败，保守起见返回 false，避免用户卡在设置页面
        res.status(500).json({ message: '检查设置状态时发生错误。', needsSetup: false });
    }
};

/**
 * 处理初始管理员账号设置请求 (POST /api/v1/auth/setup)
 */
export const setupAdmin = async (req: Request, res: Response): Promise<void> => {
    const { username, password, confirmPassword } = req.body;

    // 1. 基本输入验证
    if (!username || !password || !confirmPassword) {
        res.status(400).json({ message: '用户名、密码和确认密码不能为空。' });
        return;
    }
    if (password !== confirmPassword) {
        res.status(400).json({ message: '两次输入的密码不匹配。' });
        return;
    }
     if (password.length < 8) {
        res.status(400).json({ message: '密码长度至少需要 8 位。' });
        return;
    }


    try {
        // 2. 检查数据库中是否已存在用户 (关键安全检查)
        const userCount = await new Promise<number>((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', (err, row: { count: number }) => {
                if (err) {
                    console.error('检查 users 表时出错 (setupAdmin):', err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row ? row.count : 0);
            });
        });

        if (userCount > 0) {
            console.warn('尝试在已有用户的情况下执行初始设置。');
            res.status(403).json({ message: '设置已完成，无法重复执行。' });
            return;
        }

        // 3. 哈希密码
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const now = Math.floor(Date.now() / 1000);

        // 4. 插入新用户
        const newUser = await new Promise<{ id: number }>((resolveInsert, rejectInsert) => {
            const stmt = db.prepare(
                `INSERT INTO users (username, hashed_password, created_at, updated_at)
                 VALUES (?, ?, ?, ?)`
            );
            // 使用 function(this: RunResult) 来获取 lastID
            stmt.run(username, hashedPassword, now, now, function (this: RunResult, err: Error | null) {
                if (err) {
                    console.error('创建初始管理员时出错:', err.message);
                    // 检查是否是唯一约束错误
                    if (err.message.includes('UNIQUE constraint failed: users.username')) {
                         return rejectInsert(new Error('用户名已存在。')); // 虽然理论上不应发生，但以防万一
                    }
                    return rejectInsert(new Error('创建初始管理员失败'));
                }
                 // 获取新插入用户的 ID
                resolveInsert({ id: this.lastID });
            });
            stmt.finalize((finalizeErr) => {
                 if (finalizeErr) {
                     console.error('Finalizing statement failed:', finalizeErr.message);
                     // 如果 finalize 失败，可能插入已完成，但最好还是通知错误
                     rejectInsert(new Error('创建初始管理员时发生错误 (finalize)'));
                 }
             });
        });


        console.log(`初始管理员账号 '${username}' (ID: ${newUser.id}) 已成功创建。`);
        const clientIp = req.ip || req.socket?.remoteAddress || 'unknown'; // 获取客户端 IP
        // 记录审计日志 (添加 IP)
        auditLogService.logAction('ADMIN_SETUP_COMPLETE', { userId: newUser.id, username, ip: clientIp });

        res.status(201).json({ message: '初始管理员账号创建成功！' });

    } catch (error: any) {
        console.error('初始设置过程中发生内部错误:', error);
        res.status(500).json({ message: error.message || '初始设置过程中发生内部服务器错误。' });
    }
};

/**
 * 处理用户登出请求 (POST /api/v1/auth/logout)
 */
export const logout = (req: Request, res: Response): void => {
    const userId = req.session.userId; // 获取用户 ID 用于日志记录
    const username = req.session.username;

    req.session.destroy((err) => {
        if (err) {
            console.error(`销毁用户 ${userId} (${username}) 的会话时出错:`, err);
            // 即使销毁失败，也尝试让前端认为已登出
            res.status(500).json({ message: '登出时发生服务器内部错误。' });
        } else {
            console.log(`用户 ${userId} (${username}) 已成功登出。`);
            // 清除客户端的 session cookie (通常 connect-sqlite3 会处理，但显式设置更保险)
            res.clearCookie('connect.sid'); // 'connect.sid' 是 express-session 的默认 cookie 名称
            // 记录审计日志
            if (userId) { // 仅在能获取到 userId 时记录
                 const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
                 auditLogService.logAction('LOGOUT', { userId, username, ip: clientIp });
            }
            res.status(200).json({ message: '已成功登出。' });
        }
    });
};
