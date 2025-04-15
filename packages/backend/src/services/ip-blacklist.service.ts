import { getDb } from '../database';
import { settingsService } from './settings.service'; // 用于获取配置
import * as sqlite3 from 'sqlite3'; // 导入 sqlite3 类型

const db = getDb();

// 黑名单相关设置的 Key
const MAX_LOGIN_ATTEMPTS_KEY = 'maxLoginAttempts';
const LOGIN_BAN_DURATION_KEY = 'loginBanDuration'; // 单位：秒

// 与 ipWhitelist.middleware.ts 保持一致
const LOCAL_IPS = [
    '127.0.0.1',    // IPv4 本地回环
    '::1',          // IPv6 本地回环
    'localhost'     // 本地主机名 (虽然通常解析为上面两者，但也包含以防万一)
];

// 黑名单条目接口
interface IpBlacklistEntry {
    ip: string;
    attempts: number;
    last_attempt_at: number;
    blocked_until: number | null;
}

export class IpBlacklistService {

    /**
     * 获取指定 IP 的黑名单记录
     * @param ip IP 地址
     * @returns 黑名单记录或 undefined
     */
    private async getEntry(ip: string): Promise<IpBlacklistEntry | undefined> {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM ip_blacklist WHERE ip = ?', [ip], (err, row: IpBlacklistEntry) => {
                if (err) {
                    console.error(`[IP Blacklist] 查询 IP ${ip} 时出错:`, err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(row);
            });
        });
    }

    /**
     * 检查 IP 是否当前被封禁
     * @param ip IP 地址
     * @returns 如果被封禁则返回 true，否则返回 false
     */
    async isBlocked(ip: string): Promise<boolean> {
        try {
            const entry = await this.getEntry(ip);
            if (!entry) {
                return false; // 不在黑名单中
            }
            // 检查封禁时间是否已过
            if (entry.blocked_until && entry.blocked_until > Math.floor(Date.now() / 1000)) {
                console.log(`[IP Blacklist] IP ${ip} 当前被封禁，直到 ${new Date(entry.blocked_until * 1000).toISOString()}`);
                return true; // 仍在封禁期内
            }
            // 如果封禁时间已过或为 null，则不再封禁
            return false;
        } catch (error) {
            console.error(`[IP Blacklist] 检查 IP ${ip} 封禁状态时出错:`, error);
            return false; // 出错时默认不封禁，避免锁死用户
        }
    }

    /**
     * 记录一次登录失败尝试
     * 如果达到阈值，则封禁该 IP
     * @param ip IP 地址
     */
    async recordFailedAttempt(ip: string): Promise<void> {
        // 如果是本地 IP，则不记录失败尝试，直接返回
        if (LOCAL_IPS.includes(ip)) {
            console.log(`[IP Blacklist] 检测到本地 IP ${ip} 登录失败，跳过黑名单处理。`);
            return;
        }

        const now = Math.floor(Date.now() / 1000);
        try {
            // 获取设置，并提供默认值处理
            const maxAttemptsStr = await settingsService.getSetting(MAX_LOGIN_ATTEMPTS_KEY);
            const banDurationStr = await settingsService.getSetting(LOGIN_BAN_DURATION_KEY);

            // 解析设置值，如果无效或未设置，则使用默认值
            const maxAttempts = parseInt(maxAttemptsStr || '5', 10) || 5;
            const banDuration = parseInt(banDurationStr || '300', 10) || 300;

            const entry = await this.getEntry(ip);

            if (entry) {
                // 更新现有记录
                const newAttempts = entry.attempts + 1;
                let blockedUntil = entry.blocked_until;

                // 检查是否达到封禁阈值
                if (newAttempts >= maxAttempts) {
                    blockedUntil = now + banDuration;
                    console.warn(`[IP Blacklist] IP ${ip} 登录失败次数达到 ${newAttempts} 次 (阈值 ${maxAttempts})，将被封禁 ${banDuration} 秒。`);
                }

                await new Promise<void>((resolve, reject) => {
                    db.run(
                        'UPDATE ip_blacklist SET attempts = ?, last_attempt_at = ?, blocked_until = ? WHERE ip = ?',
                        [newAttempts, now, blockedUntil, ip],
                        (err) => {
                            if (err) {
                                console.error(`[IP Blacklist] 更新 IP ${ip} 失败尝试次数时出错:`, err.message);
                                return reject(err);
                            }
                            resolve();
                        }
                    );
                });
            } else {
                // 插入新记录
                let blockedUntil: number | null = null;
                if (1 >= maxAttempts) { // 首次尝试就达到阈值 (虽然不常见)
                    blockedUntil = now + banDuration;
                     console.warn(`[IP Blacklist] IP ${ip} 首次登录失败即达到阈值 ${maxAttempts}，将被封禁 ${banDuration} 秒。`);
                }
                await new Promise<void>((resolve, reject) => {
                    db.run(
                        'INSERT INTO ip_blacklist (ip, attempts, last_attempt_at, blocked_until) VALUES (?, 1, ?, ?)',
                        [ip, now, blockedUntil],
                        (err) => {
                            if (err) {
                                console.error(`[IP Blacklist] 插入新 IP ${ip} 失败记录时出错:`, err.message);
                                return reject(err);
                            }
                            resolve();
                        }
                    );
                });
            }
        } catch (error) {
            console.error(`[IP Blacklist] 记录 IP ${ip} 失败尝试时出错:`, error);
        }
    }

    /**
     * 重置指定 IP 的失败尝试次数和封禁状态 (例如登录成功后调用)
     * @param ip IP 地址
     */
    async resetAttempts(ip: string): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                // 直接删除记录，或者将 attempts 重置为 0 并清除 blocked_until
                db.run('DELETE FROM ip_blacklist WHERE ip = ?', [ip], (err) => {
                    if (err) {
                        console.error(`[IP Blacklist] 重置 IP ${ip} 尝试次数时出错:`, err.message);
                        return reject(err);
                    }
                    console.log(`[IP Blacklist] 已重置 IP ${ip} 的失败尝试记录。`);
                    resolve();
                });
            });
        } catch (error) {
            console.error(`[IP Blacklist] 重置 IP ${ip} 尝试次数时出错:`, error);
        }
    }

    /**
     * 获取所有黑名单记录 (用于管理界面)
     * @param limit 每页数量
     * @param offset 偏移量
     */
    async getBlacklist(limit: number = 50, offset: number = 0): Promise<{ entries: IpBlacklistEntry[], total: number }> {
        const entries = await new Promise<IpBlacklistEntry[]>((resolve, reject) => {
            db.all('SELECT * FROM ip_blacklist ORDER BY last_attempt_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows: IpBlacklistEntry[]) => {
                if (err) {
                    console.error('[IP Blacklist] 获取黑名单列表时出错:', err.message);
                    return reject(new Error('数据库查询失败'));
                }
                resolve(rows);
            });
        });

        const total = await new Promise<number>((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM ip_blacklist', (err, row: { count: number }) => {
                if (err) {
                    console.error('[IP Blacklist] 获取黑名单总数时出错:', err.message);
                    return reject(0); // 出错时返回 0
                }
                resolve(row.count);
            });
        });

        return { entries, total };
    }

    /**
     * 从黑名单中删除一个 IP (解除封禁)
     * @param ip IP 地址
     */
    async removeFromBlacklist(ip: string): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                // 将 this 类型改回 RunResult 以访问 changes 属性
                db.run('DELETE FROM ip_blacklist WHERE ip = ?', [ip], function(this: sqlite3.RunResult, err: Error | null) {
                    if (err) {
                        console.error(`[IP Blacklist] 从黑名单删除 IP ${ip} 时出错:`, err.message);
                        return reject(err);
                    }
                    if (this.changes === 0) {
                        console.warn(`[IP Blacklist] 尝试删除 IP ${ip}，但该 IP 不在黑名单中。`);
                    } else {
                        console.log(`[IP Blacklist] 已从黑名单中删除 IP ${ip}。`);
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error(`[IP Blacklist] 从黑名单删除 IP ${ip} 时出错:`, error);
            throw error; // 重新抛出错误，以便上层处理
        }
    }
}

// 导出单例
export const ipBlacklistService = new IpBlacklistService();
