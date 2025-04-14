import { Request, Response } from 'express';
import { Statement } from 'sqlite3'; // 引入 Statement 类型
import { getDb } from '../database';
import { encrypt, decrypt } from '../utils/crypto'; // 引入加解密函数

const db = getDb();

// 连接数据结构 (用于类型提示，不包含敏感信息)
interface ConnectionInfoBase {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key'; // 支持密码或密钥
    // proxy_id: number | null; // 待添加代理支持
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

/**
 * 创建新连接 (POST /api/v1/connections)
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
    const { name, host, port = 22, username, auth_method, password, private_key, passphrase } = req.body;
    const userId = req.session.userId; // 从会话获取用户 ID

    // 输入验证 (基础)
    if (!name || !host || !username || !auth_method) {
        res.status(400).json({ message: '缺少必要的连接信息 (name, host, username, auth_method)。' });
        return;
    }
    if (auth_method === 'password' && !password) {
        res.status(400).json({ message: '密码认证方式需要提供 password。' });
        return;
    }
    if (auth_method === 'key' && !private_key) {
        res.status(400).json({ message: '密钥认证方式需要提供 private_key。' });
        return;
    }
    if (auth_method !== 'password' && auth_method !== 'key') {
        res.status(400).json({ message: '无效的认证方式 (auth_method)，必须是 "password" 或 "key"。' });
        return;
    }
    if (typeof port !== 'number' || port <= 0 || port > 65535) {
        res.status(400).json({ message: '端口号无效。' });
        return;
    }

    try {
        let encryptedPassword = null;
        let encryptedPrivateKey = null;
        let encryptedPassphrase = null;

        if (auth_method === 'password') {
            encryptedPassword = encrypt(password);
        } else if (auth_method === 'key') {
            encryptedPrivateKey = encrypt(private_key);
            if (passphrase) {
                encryptedPassphrase = encrypt(passphrase);
            }
        }

        const now = Math.floor(Date.now() / 1000); // 当前 Unix 时间戳 (秒)

        // 插入数据库
        const result = await new Promise<{ lastID: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `INSERT INTO connections (name, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            // 注意：这里没有存储 userId，因为 MVP 只有一个用户。如果未来支持多用户，需要添加 user_id 字段。
            stmt.run(
                name, host, port, username, auth_method,
                encryptedPassword, encryptedPrivateKey, encryptedPassphrase,
                now, now,
                function (this: Statement, err: Error | null) {
                    if (err) {
                        console.error('插入连接时出错:', err.message);
                        return reject(new Error('创建连接失败'));
                    }
                    resolve({ lastID: (this as any).lastID });
                }
            );
            stmt.finalize(); // 完成语句执行
        });

        // 返回成功响应 (不包含敏感信息)
        res.status(201).json({
            message: '连接创建成功。',
            connection: {
                id: result.lastID,
                name, host, port, username, auth_method,
                created_at: now, updated_at: now, last_connected_at: null
            }
        });

    } catch (error: any) {
        console.error('创建连接时发生错误:', error);
        res.status(500).json({ message: error.message || '创建连接时发生内部服务器错误。' });
    }
};

/**
 * 获取连接列表 (GET /api/v1/connections)
 */
export const getConnections = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId; // 虽然 MVP 只有一个用户，但保留以备将来使用

    try {
        // 查询数据库，排除敏感字段 encrypted_password, encrypted_private_key, encrypted_passphrase
        // 注意：如果未来支持多用户，需要添加 WHERE user_id = ? 条件
        const connections = await new Promise<ConnectionInfoBase[]>((resolve, reject) => {
            db.all(
                `SELECT id, name, host, port, username, auth_method, created_at, updated_at, last_connected_at
                 FROM connections
                 ORDER BY name ASC`, // 按名称排序
                (err, rows: ConnectionInfoBase[]) => { // 使用更新后的接口
                    if (err) {
                        console.error('查询连接列表时出错:', err.message);
                        return reject(new Error('获取连接列表失败'));
                    }
                    resolve(rows);
                }
            );
        });

        res.status(200).json(connections);

    } catch (error: any) {
        console.error('获取连接列表时发生错误:', error);
        res.status(500).json({ message: error.message || '获取连接列表时发生内部服务器错误。' });
    }
};

/**
 * 获取单个连接信息 (GET /api/v1/connections/:id)
 */
export const getConnectionById = async (req: Request, res: Response): Promise<void> => {
    const connectionId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    if (isNaN(connectionId)) {
        res.status(400).json({ message: '无效的连接 ID。' });
        return;
    }

    try {
        // 查询数据库，排除敏感字段
        // 注意：如果未来支持多用户，需要添加 AND user_id = ? 条件
        const connection = await new Promise<ConnectionInfoBase | null>((resolve, reject) => {
            db.get(
                `SELECT id, name, host, port, username, auth_method, created_at, updated_at, last_connected_at
                 FROM connections
                 WHERE id = ?`,
                [connectionId],
                (err, row: ConnectionInfoBase) => { // 使用更新后的接口
                    if (err) {
                        console.error(`查询连接 ${connectionId} 时出错:`, err.message);
                        return reject(new Error('获取连接信息失败'));
                    }
                    resolve(row || null); // 如果找不到则返回 null
                }
            );
        });

        if (!connection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json(connection);
        }

    } catch (error: any) {
        console.error(`获取连接 ${connectionId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '获取连接信息时发生内部服务器错误。' });
    }
};

/**
 * 更新连接信息 (PUT /api/v1/connections/:id)
 */
export const updateConnection = async (req: Request, res: Response): Promise<void> => {
    const connectionId = parseInt(req.params.id, 10);
    const { name, host, port, username, auth_method, password, private_key, passphrase } = req.body;
    const userId = req.session.userId;

    if (isNaN(connectionId)) {
        res.status(400).json({ message: '无效的连接 ID。' });
        return;
    }

    // 输入验证 (与创建类似，但允许部分更新)
    if (!name && !host && port === undefined && !username && !auth_method && !password && !private_key && passphrase === undefined) {
        res.status(400).json({ message: '没有提供要更新的字段。' });
        return;
    }
    if (auth_method && auth_method !== 'password' && auth_method !== 'key') {
        res.status(400).json({ message: '无效的认证方式 (auth_method)，必须是 "password" 或 "key"。' });
        return;
    }
    // 如果提供了 auth_method，需要确保对应的凭证也提供了或已存在
    // (更复杂的验证逻辑可能需要先查询现有记录)

    try {
        const fieldsToUpdate: { [key: string]: any } = {};
        const params: any[] = [];

        // 构建要更新的字段和参数
        if (name !== undefined) { fieldsToUpdate.name = name; params.push(name); }
        if (host !== undefined) { fieldsToUpdate.host = host; params.push(host); }
        if (port !== undefined) {
            if (typeof port !== 'number' || port <= 0 || port > 65535) {
                res.status(400).json({ message: '端口号无效。' });
                return;
            }
            fieldsToUpdate.port = port; params.push(port);
        }
        if (username !== undefined) { fieldsToUpdate.username = username; params.push(username); }

        // 处理认证方式和凭证更新
        if (auth_method) {
            fieldsToUpdate.auth_method = auth_method;
            params.push(auth_method);
            if (auth_method === 'password') {
                if (!password) {
                    res.status(400).json({ message: '更新为密码认证时需要提供 password。' });
                    return;
                }
                fieldsToUpdate.encrypted_password = encrypt(password);
                params.push(fieldsToUpdate.encrypted_password);
                fieldsToUpdate.encrypted_private_key = null; // 清除旧密钥
                params.push(null);
                fieldsToUpdate.encrypted_passphrase = null; // 清除旧密码
                params.push(null);
            } else if (auth_method === 'key') {
                if (!private_key) {
                    res.status(400).json({ message: '更新为密钥认证时需要提供 private_key。' });
                    return;
                }
                fieldsToUpdate.encrypted_private_key = encrypt(private_key);
                params.push(fieldsToUpdate.encrypted_private_key);
                fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                params.push(fieldsToUpdate.encrypted_passphrase);
                fieldsToUpdate.encrypted_password = null; // 清除旧密码
                params.push(null);
            }
        } else {
            // 如果只更新凭证而不改变 auth_method (需要先查询当前 auth_method)
            // 为了简化，这里假设如果提供了 password/private_key，则 auth_method 也被提供了
            // 或者，可以先查询记录再决定如何更新
            if (password) {
                 // 假设当前是 password 方式或要切换到 password
                 fieldsToUpdate.encrypted_password = encrypt(password);
                 params.push(fieldsToUpdate.encrypted_password);
            }
             if (private_key) {
                 // 假设当前是 key 方式或要切换到 key
                 fieldsToUpdate.encrypted_private_key = encrypt(private_key);
                 params.push(fieldsToUpdate.encrypted_private_key);
                 fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                 params.push(fieldsToUpdate.encrypted_passphrase);
            } else if (passphrase !== undefined && auth_method === 'key') { // 仅更新 passphrase
                 fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                 params.push(fieldsToUpdate.encrypted_passphrase);
            }
        }


        const now = Math.floor(Date.now() / 1000);
        fieldsToUpdate.updated_at = now;
        params.push(now);

        const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');

        if (!setClauses) {
             res.status(400).json({ message: '没有有效的字段进行更新。' });
             return;
        }

        params.push(connectionId); // 添加 WHERE id = ? 的参数

        // 更新数据库
        // 注意：如果未来支持多用户，需要添加 AND user_id = ? 条件
        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `UPDATE connections SET ${setClauses} WHERE id = ?`
            );
            stmt.run(...params, function (this: Statement, err: Error | null) {
                if (err) {
                    console.error(`更新连接 ${connectionId} 时出错:`, err.message);
                    return reject(new Error('更新连接失败'));
                }
                // this.changes 包含受影响的行数
                // 使用类型断言 (as any) 来解决 TS 类型检查问题
                resolve({ changes: (this as any).changes });
            });
            stmt.finalize();
        });

        if (result.changes === 0) {
            res.status(404).json({ message: '连接未找到或未作更改。' });
        } else {
            // 获取更新后的信息（不含敏感数据）并返回
            const updatedConnection = await new Promise<ConnectionInfoBase | null>((resolve, reject) => {
                db.get(
                    `SELECT id, name, host, port, username, auth_method, created_at, updated_at, last_connected_at
                     FROM connections WHERE id = ?`,
                    [connectionId],
                    (err, row: ConnectionInfoBase) => err ? reject(err) : resolve(row || null)
                );
            });
             res.status(200).json({ message: '连接更新成功。', connection: updatedConnection });
        }

    } catch (error: any) {
        console.error(`更新连接 ${connectionId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '更新连接时发生内部服务器错误。' });
    }
};

/**
 * 删除连接 (DELETE /api/v1/connections/:id)
 */
export const deleteConnection = async (req: Request, res: Response): Promise<void> => {
    const connectionId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    if (isNaN(connectionId)) {
        res.status(400).json({ message: '无效的连接 ID。' });
        return;
    }

    try {
        // 删除数据库中的记录
        // 注意：如果未来支持多用户，需要添加 AND user_id = ? 条件
        const result = await new Promise<{ changes: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `DELETE FROM connections WHERE id = ?`
            );
            stmt.run(connectionId, function (this: Statement, err: Error | null) {
                if (err) {
                    console.error(`删除连接 ${connectionId} 时出错:`, err.message);
                    return reject(new Error('删除连接失败'));
                }
                // this.changes 包含受影响的行数
                resolve({ changes: (this as any).changes });
            });
            stmt.finalize();
        });

        if (result.changes === 0) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json({ message: '连接删除成功。' }); // 也可以使用 204 No Content
        }

    } catch (error: any) {
        console.error(`删除连接 ${connectionId} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除连接时发生内部服务器错误。' });
    }
};

// TODO: 实现 testConnection
// export const testConnection = ...
