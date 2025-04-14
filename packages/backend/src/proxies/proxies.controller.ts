import { Request, Response } from 'express';
import { getDb } from '../database';
import { encrypt, decrypt } from '../utils/crypto'; // 引入加解密工具

// 定义代理信息接口 (用于类型提示)
interface ProxyData {
    name: string;
    type: 'SOCKS5' | 'HTTP';
    host: string;
    port: number;
    username?: string | null;
    password?: string | null; // 接收原始密码
}

// 获取所有代理配置 (不含密码)
export const getAllProxies = async (req: Request, res: Response) => {
    const db = getDb();
    try {
        // 查询所有代理，排除 encrypted_password 字段
        const sql = `SELECT id, name, type, host, port, username, created_at, updated_at FROM proxies`;
        const proxies = await new Promise<any[]>((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });
        res.status(200).json(proxies);
    } catch (error: any) {
        res.status(500).json({ message: '获取代理列表失败', error: error.message });
    }
};

// 获取单个代理配置 (不含密码)
export const getProxyById = async (req: Request, res: Response) => {
    const db = getDb();
    const { id } = req.params;
    try {
        // 查询单个代理，排除 encrypted_password 字段
        const sql = `SELECT id, name, type, host, port, username, created_at, updated_at FROM proxies WHERE id = ?`;
        const proxy = await new Promise<any>((resolve, reject) => {
            db.get(sql, [id], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row); // 如果找不到，row 会是 undefined
            });
        });

        if (proxy) {
            res.status(200).json(proxy);
        } else {
            res.status(404).json({ message: `未找到 ID 为 ${id} 的代理` });
        }
    } catch (error: any) {
        res.status(500).json({ message: `获取代理 ${id} 失败`, error: error.message });
    }
};

// 创建新的代理配置
export const createProxy = async (req: Request, res: Response) => {
    const db = getDb();
    const { name, type, host, port, username, password }: ProxyData = req.body;
    const now = Math.floor(Date.now() / 1000); // 当前时间戳 (秒)

    // 基本验证
    if (!name || !type || !host || !port) {
        return res.status(400).json({ message: '缺少必要的代理信息 (name, type, host, port)' });
    }
    if (type !== 'SOCKS5' && type !== 'HTTP') {
        return res.status(400).json({ message: '无效的代理类型，仅支持 SOCKS5 或 HTTP' });
    }

    try {
        let encryptedPassword: string | null = null;
        if (password) {
            encryptedPassword = encrypt(password); // 加密密码
        }

        const sql = `INSERT INTO proxies (name, type, host, port, username, encrypted_password, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [name, type, host, port, username ?? null, encryptedPassword, now, now];

        // 使用 Promise 包装 db.run 以便使用 async/await
        const result = await new Promise<{ id: number } | null>((resolve, reject) => {
            db.run(sql, params, function (err) { // 使用 function 获取 this.lastID
                if (err) {
                    return reject(err);
                }
                // this.lastID 包含新插入行的 ID
                resolve({ id: this.lastID });
            });
        });

        if (result) {
            // 返回成功消息和新创建的代理信息 (不含密码)
            res.status(201).json({
                message: '代理创建成功',
                proxy: {
                    id: result.id,
                    name,
                    type,
                    host,
                    port,
                    username: username ?? null,
                    created_at: now,
                    updated_at: now
                }
            });
        } else {
             // 这理论上不应该发生，除非 db.run 内部逻辑问题
             throw new Error('未能获取新创建代理的 ID');
        }

    } catch (error: any) {
         if (error.message.includes('UNIQUE constraint failed')) {
             // 可以添加更具体的唯一约束错误处理，例如判断是哪个字段冲突
             return res.status(409).json({ message: '创建代理失败：可能存在同名字段冲突', error: error.message });
         }
        res.status(500).json({ message: '创建代理失败', error: error.message });
    }
};

// 更新代理配置
export const updateProxy = async (req: Request, res: Response) => {
    const db = getDb();
    const { id } = req.params;
    const { name, type, host, port, username, password }: Partial<ProxyData> = req.body;
    const now = Math.floor(Date.now() / 1000);

    // 验证至少有一个字段被更新
     if (!name && !type && !host && port === undefined && username === undefined && password === undefined) {
        return res.status(400).json({ message: '没有提供任何要更新的字段' });
    }
     if (type && type !== 'SOCKS5' && type !== 'HTTP') {
        return res.status(400).json({ message: '无效的代理类型，仅支持 SOCKS5 或 HTTP' });
    }

    try {
        let encryptedPasswordToUpdate: string | null | undefined = undefined; // undefined 表示不更新密码
        if (password !== undefined) { // 检查 password 字段是否存在于请求体中
            encryptedPasswordToUpdate = password ? encrypt(password) : null; // 如果提供了新密码则加密，如果提供空字符串或 null 则设为 null
        }

        // 构建动态 SQL 更新语句
        const fieldsToUpdate: string[] = [];
        const params: any[] = [];

        if (name !== undefined) { fieldsToUpdate.push('name = ?'); params.push(name); }
        if (type !== undefined) { fieldsToUpdate.push('type = ?'); params.push(type); }
        if (host !== undefined) { fieldsToUpdate.push('host = ?'); params.push(host); }
        if (port !== undefined) { fieldsToUpdate.push('port = ?'); params.push(port); }
        // username 可以设为 null
        if (username !== undefined) { fieldsToUpdate.push('username = ?'); params.push(username ?? null); }
        // 只有当 password 在请求体中明确提供了 (包括空字符串或 null)，才更新密码字段
        if (encryptedPasswordToUpdate !== undefined) {
            fieldsToUpdate.push('encrypted_password = ?');
            params.push(encryptedPasswordToUpdate);
        }

        // 总是更新 updated_at 时间戳
        fieldsToUpdate.push('updated_at = ?');
        params.push(now);

        // 添加 WHERE 条件的参数
        params.push(id);

        const sql = `UPDATE proxies SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            db.run(sql, params, function (err) { // 使用 function 获取 this.changes
                if (err) {
                    return reject(err);
                }
                // this.changes 包含受影响的行数
                resolve({ changes: this.changes });
            });
        });

        if (result.changes > 0) {
            // 更新成功后，获取更新后的代理信息 (不含密码) 并返回
            const updatedProxy = await new Promise<any>((resolve, reject) => {
                db.get(`SELECT id, name, type, host, port, username, created_at, updated_at FROM proxies WHERE id = ?`, [id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
             if (updatedProxy) {
                res.status(200).json({ message: '代理更新成功', proxy: updatedProxy });
            } else {
                 // 理论上更新成功后应该能找到，除非并发删除了
                 res.status(404).json({ message: `更新成功，但未能找到 ID 为 ${id} 的代理` });
            }
        } else {
            // 如果 changes 为 0，说明没有找到对应 ID 的代理
            res.status(404).json({ message: `未找到 ID 为 ${id} 的代理进行更新` });
        }

    } catch (error: any) {
         if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: '更新代理失败：可能存在同名字段冲突', error: error.message });
         }
        res.status(500).json({ message: `更新代理 ${id} 失败`, error: error.message });
    }
};

// 删除代理配置
export const deleteProxy = async (req: Request, res: Response) => {
    const db = getDb();
    const { id } = req.params;
    try {
        const sql = `DELETE FROM proxies WHERE id = ?`;
        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            db.run(sql, [id], function (err) { // 使用 function 获取 this.changes
                if (err) {
                    return reject(err);
                }
                resolve({ changes: this.changes });
            });
        });

        if (result.changes > 0) {
            res.status(200).json({ message: `代理 ${id} 删除成功` });
        } else {
            // 如果 changes 为 0，说明没有找到对应 ID 的代理
            res.status(404).json({ message: `未找到 ID 为 ${id} 的代理进行删除` });
        }
    } catch (error: any) {
        res.status(500).json({ message: `删除代理 ${id} 失败`, error: error.message });
    }
};
