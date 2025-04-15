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
    // 新增 proxy_id 和 tag_ids
    const { name, host, port = 22, username, auth_method, password, private_key, passphrase, proxy_id, tag_ids } = req.body;
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
                `INSERT INTO connections (name, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, proxy_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` // 添加 proxy_id
            );
            // 注意：这里没有存储 userId，因为 MVP 只有一个用户。如果未来支持多用户，需要添加 user_id 字段。
            stmt.run(
                name, host, port, username, auth_method,
                encryptedPassword, encryptedPrivateKey, encryptedPassphrase,
                proxy_id ?? null, // 如果未提供则设为 null
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

        const newConnectionId = result.lastID;

        // 处理标签关联
        if (Array.isArray(tag_ids) && tag_ids.length > 0) {
            const insertTagStmt = db.prepare(`INSERT INTO connection_tags (connection_id, tag_id) VALUES (?, ?)`);
            // 使用事务确保原子性
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                try {
                    tag_ids.forEach((tagId: any) => {
                        if (typeof tagId === 'number' && tagId > 0) {
                            insertTagStmt.run(newConnectionId, tagId);
                        } else {
                            console.warn(`创建连接 ${newConnectionId} 时，提供的 tag_id 无效: ${tagId}`);
                        }
                    });
                    db.run('COMMIT');
                } catch (tagError: any) {
                    console.error(`为连接 ${newConnectionId} 添加标签时出错:`, tagError);
                    db.run('ROLLBACK'); // 出错时回滚
                    // 可以选择抛出错误或仅记录警告
                    // throw new Error('处理标签关联失败');
                } finally {
                     insertTagStmt.finalize();
                }
            });
        }

        // 返回成功响应 (包含 proxy_id 和 tag_ids)
        res.status(201).json({
            message: '连接创建成功。',
            connection: {
                id: newConnectionId,
                name, host, port, username, auth_method,
                proxy_id: proxy_id ?? null,
                tag_ids: Array.isArray(tag_ids) ? tag_ids.filter(id => typeof id === 'number' && id > 0) : [], // 返回有效的 tag_ids
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
        // 更新查询以包含关联的标签 ID (使用 GROUP_CONCAT)
        const connections = await new Promise<(ConnectionInfoBase & { proxy_id: number | null, tag_ids: number[] })[]>((resolve, reject) => {
            db.all(
                `SELECT
                    c.id, c.name, c.host, c.port, c.username, c.auth_method, c.proxy_id,
                    c.created_at, c.updated_at, c.last_connected_at,
                    GROUP_CONCAT(ct.tag_id) as tag_ids_str
                 FROM connections c
                 LEFT JOIN connection_tags ct ON c.id = ct.connection_id
                 GROUP BY c.id
                 ORDER BY c.name ASC`,
                (err, rows: any[]) => { // 使用 any[] 因为 tag_ids_str 是字符串
                    if (err) {
                        console.error('查询连接列表时出错:', err.message);
                        return reject(new Error('获取连接列表失败'));
                    }
                    // 处理 tag_ids_str，将其转换为数字数组
                    const processedRows = rows.map(row => ({
                        ...row,
                        tag_ids: row.tag_ids_str ? row.tag_ids_str.split(',').map(Number) : []
                    }));
                    resolve(processedRows);
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
        // 更新查询以包含关联的标签 ID (使用 GROUP_CONCAT)
        const connection = await new Promise<(ConnectionInfoBase & { proxy_id: number | null, tag_ids: number[] }) | null>((resolve, reject) => {
            db.get(
                `SELECT
                    c.id, c.name, c.host, c.port, c.username, c.auth_method, c.proxy_id,
                    c.created_at, c.updated_at, c.last_connected_at,
                    GROUP_CONCAT(ct.tag_id) as tag_ids_str
                 FROM connections c
                 LEFT JOIN connection_tags ct ON c.id = ct.connection_id
                 WHERE c.id = ?
                 GROUP BY c.id`, // GROUP BY 仍然需要，即使只有一行
                [connectionId],
                (err, row: any) => { // 使用 any[] 因为 tag_ids_str 是字符串
                    if (err) {
                        console.error(`查询连接 ${connectionId} 时出错:`, err.message);
                        return reject(new Error('获取连接信息失败'));
                    }
                     if (row) {
                        // 处理 tag_ids_str
                        row.tag_ids = row.tag_ids_str ? row.tag_ids_str.split(',').map(Number) : [];
                        delete row.tag_ids_str; // 移除临时字段
                    }
                    resolve(row || null);
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
    // 新增 proxy_id 和 tag_ids
    const { name, host, port, username, auth_method, password, private_key, passphrase, proxy_id, tag_ids } = req.body;
    const userId = req.session.userId;

    if (isNaN(connectionId)) {
        res.status(400).json({ message: '无效的连接 ID。' });
        return;
    }

    // 输入验证 (与创建类似，但允许部分更新)
    // 更新验证逻辑以包含 proxy_id
    if (!name && !host && port === undefined && !username && !auth_method && !password && !private_key && passphrase === undefined && proxy_id === undefined) {
        res.status(400).json({ message: '没有提供要更新的字段。' });
        return;
    }
    if (auth_method && auth_method !== 'password' && auth_method !== 'key') {
        res.status(400).json({ message: '无效的认证方式 (auth_method)，必须是 "password" 或 "key"。' });
        return;
    }
    // 如果提供了 auth_method，需要确保对应的凭证也提供了或已存在
    // (更复杂的验证逻辑可能需要先查询现有记录) - 现在实现它

    try {
        // 1. 先查询当前的连接信息
        const currentConnection = await new Promise<(ConnectionInfoBase & { encrypted_password?: string | null, encrypted_private_key?: string | null, encrypted_passphrase?: string | null, proxy_id?: number | null }) | null>((resolve, reject) => {
             // 注意：需要查询加密字段以进行比较和保留
             db.get(
                 `SELECT id, name, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, proxy_id
                  FROM connections
                  WHERE id = ?`,
                 [connectionId],
                 (err, row: any) => { // 使用 any 避免类型冲突，或定义更完整的接口
                     if (err) {
                         console.error(`查询连接 ${connectionId} 时出错:`, err.message);
                         return reject(new Error('获取连接信息失败'));
                     }
                     resolve(row || null);
                 }
             );
         });

        if (!currentConnection) {
            res.status(404).json({ message: '连接未找到。' });
            return;
        }

        const fieldsToUpdate: { [key: string]: any } = {};
        const params: any[] = [];
        let newAuthMethod = auth_method || currentConnection.auth_method; // 确定最终的认证方式

        // 构建要更新的非敏感字段和参数
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
        // 新增：处理 proxy_id 更新 (允许设为 null)
        if (proxy_id !== undefined) { fieldsToUpdate.proxy_id = proxy_id; params.push(proxy_id ?? null); }

        // --- 处理认证方式和凭证更新 (重构逻辑) ---
        if (auth_method && auth_method !== currentConnection.auth_method) {
            // --- Case 1: 认证方式已改变 ---
            fieldsToUpdate.auth_method = auth_method;
            params.push(auth_method);

            if (auth_method === 'password') {
                // 切换到密码认证
                if (!password) {
                    // 必须提供密码才能切换
                    res.status(400).json({ message: '切换到密码认证时需要提供 password。' });
                    return;
                }
                fieldsToUpdate.encrypted_password = encrypt(password);
                params.push(fieldsToUpdate.encrypted_password);
                // 清除旧的密钥信息
                fieldsToUpdate.encrypted_private_key = null;
                params.push(null);
                fieldsToUpdate.encrypted_passphrase = null;
                params.push(null);
            } else { // auth_method === 'key'
                // 切换到密钥认证
                if (!private_key) {
                    // 必须提供私钥才能切换
                    res.status(400).json({ message: '切换到密钥认证时需要提供 private_key。' });
                    return;
                }
                fieldsToUpdate.encrypted_private_key = encrypt(private_key);
                params.push(fieldsToUpdate.encrypted_private_key);
                // 密码短语是可选的
                fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                params.push(fieldsToUpdate.encrypted_passphrase);
                // 清除旧的密码信息
                fieldsToUpdate.encrypted_password = null;
                params.push(null);
            }
        } else {
            // --- Case 2: 认证方式未改变 (或请求中未指定 auth_method) ---
            // 仅当提供了新的凭证时才更新
            if (currentConnection.auth_method === 'password') {
                if (password) { // 如果提供了新密码
                    fieldsToUpdate.encrypted_password = encrypt(password);
                    params.push(fieldsToUpdate.encrypted_password);
                }
                // 如果没提供新密码，则不更新密码字段，保留旧密码
            } else if (currentConnection.auth_method === 'key') {
                if (private_key) { // 如果提供了新私钥
                    fieldsToUpdate.encrypted_private_key = encrypt(private_key);
                    params.push(fieldsToUpdate.encrypted_private_key);
                    // 如果提供了新私钥，则密码短语也必须一起更新（即使是清空）
                    fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                    params.push(fieldsToUpdate.encrypted_passphrase);
                } else if (passphrase !== undefined) { // 如果只提供了密码短语 (允许清空)
                    fieldsToUpdate.encrypted_passphrase = passphrase ? encrypt(passphrase) : null;
                    params.push(fieldsToUpdate.encrypted_passphrase);
                }
                // 如果私钥和密码短语都未提供，则不更新这两个字段，保留旧值
            }
        }
        // --- 凭证处理结束 ---

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
                    // 新增：包含 proxy_id
                    `SELECT id, name, host, port, username, auth_method, proxy_id, created_at, updated_at, last_connected_at
                     FROM connections WHERE id = ?`,
                    [connectionId],
                    (err, row: ConnectionInfoBase & { proxy_id: number | null }) => err ? reject(err) : resolve(row || null)
                );
            });

            // 处理标签关联更新
            if (tag_ids !== undefined && Array.isArray(tag_ids)) { // 仅当提供了 tag_ids 时才处理
                const deleteStmt = db.prepare(`DELETE FROM connection_tags WHERE connection_id = ?`);
                const insertStmt = db.prepare(`INSERT INTO connection_tags (connection_id, tag_id) VALUES (?, ?)`);

                await new Promise<void>((resolve, reject) => {
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        try {
                            // 1. 删除旧关联
                            deleteStmt.run(connectionId, (err: Error | null) => { // 添加 err 类型
                                if (err) throw err; // 抛出错误以触发 rollback
                            });
                            deleteStmt.finalize(); // finalize delete statement

                            // 2. 插入新关联 (如果 tag_ids 不为空)
                            if (tag_ids.length > 0) {
                                tag_ids.forEach((tagId: any) => {
                                    if (typeof tagId === 'number' && tagId > 0) {
                                        insertStmt.run(connectionId, tagId, (err: Error | null) => { // 添加 err 类型
                                             if (err) throw err; // 抛出错误以触发 rollback
                                        });
                                    } else {
                                         console.warn(`更新连接 ${connectionId} 时，提供的 tag_id 无效: ${tagId}`);
                                    }
                                });
                            }
                            insertStmt.finalize(); // finalize insert statement
                            db.run('COMMIT', (commitErr: Error | null) => { // 添加 commitErr 类型
                                if (commitErr) throw commitErr;
                                resolve(); // 事务成功
                            });
                        } catch (tagError: any) {
                            console.error(`更新连接 ${connectionId} 的标签关联时出错:`, tagError);
                            db.run('ROLLBACK');
                            // 将标签处理错误附加到主错误或单独处理
                            reject(new Error('处理标签关联失败'));
                        }
                    });
                });
            } // 结束标签处理

            // 在返回的 updatedConnection 中添加 tag_ids
            if (updatedConnection) {
                 // 查询最新的 tag_ids
                  const currentTagIds = await new Promise<number[]>((resolve, reject) => {
                     db.all('SELECT tag_id FROM connection_tags WHERE connection_id = ?', [connectionId], (err: Error | null, rows: { tag_id: number }[]) => { // 添加 err 类型
                         if (err) return reject(err);
                         resolve(rows.map(r => r.tag_id));
                     });
                });
                (updatedConnection as any).tag_ids = currentTagIds; // 添加 tag_ids 字段
            }

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

 // --- 新增：测试连接功能 ---
 import { Client } from 'ssh2'; // 引入 ssh2 Client
 import { SocksClient } from 'socks'; // 引入 SOCKS 客户端
 // import { HttpsProxyAgent } from 'https-proxy-agent'; // 不再直接使用 HttpsProxyAgent
 import http from 'http'; // 引入 http 用于手动 CONNECT
 import net from 'net'; // 引入 net 用于 Socket 类型

// 辅助接口：包含解密后的凭证和代理信息
interface FullConnectionInfo extends ConnectionInfoBase {
    password?: string;
    privateKey?: string;
    passphrase?: string;
    proxy?: {
        id: number;
        name: string;
        type: 'SOCKS5' | 'HTTP';
        host: string;
        port: number;
        username?: string;
        password?: string;
    } | null;
}

/**
 * 测试连接 (POST /api/v1/connections/:id/test)
 */
export const testConnection = async (req: Request, res: Response): Promise<void> => {
    const connectionId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    const TEST_TIMEOUT = 15000; // 测试连接超时时间 (毫秒)

    if (isNaN(connectionId)) {
        res.status(400).json({ message: '无效的连接 ID。' });
        return;
    }

    try {
        // 1. 获取完整的连接信息 (包括加密凭证和代理信息)
        const connInfo = await new Promise<any | null>((resolve, reject) => {
             // 查询连接信息，并 LEFT JOIN 代理信息
             db.get(
                 `SELECT
                     c.*,
                     p.id as proxy_db_id, p.name as proxy_name, p.type as proxy_type,
                     p.host as proxy_host, p.port as proxy_port, p.username as proxy_username,
                     p.encrypted_password as proxy_encrypted_password
                  FROM connections c
                  LEFT JOIN proxies p ON c.proxy_id = p.id
                  WHERE c.id = ?`,
                 [connectionId],
                 (err, row: any) => {
                     if (err) {
                         console.error(`查询连接 ${connectionId} 详细信息时出错:`, err.message);
                         return reject(new Error('获取连接信息失败'));
                     }
                     resolve(row || null);
                 }
             );
         });

        if (!connInfo) {
            res.status(404).json({ message: '连接配置未找到。' });
            return;
        }

        // 2. 构建包含解密凭证和代理对象的 FullConnectionInfo
        const fullConnInfo: FullConnectionInfo = {
            ...connInfo, // 包含 id, name, host, port, username, auth_method, created_at, updated_at, last_connected_at
            proxy: null, // 初始化 proxy
        };

        try {
            if (connInfo.auth_method === 'password' && connInfo.encrypted_password) {
                fullConnInfo.password = decrypt(connInfo.encrypted_password);
            } else if (connInfo.auth_method === 'key' && connInfo.encrypted_private_key) {
                fullConnInfo.privateKey = decrypt(connInfo.encrypted_private_key);
                if (connInfo.encrypted_passphrase) {
                    fullConnInfo.passphrase = decrypt(connInfo.encrypted_passphrase);
                }
            }
            // 如果凭证解密失败，这里会抛出错误

            // 处理代理信息
            if (connInfo.proxy_db_id) {
                fullConnInfo.proxy = {
                    id: connInfo.proxy_db_id,
                    name: connInfo.proxy_name,
                    type: connInfo.proxy_type,
                    host: connInfo.proxy_host,
                    port: connInfo.proxy_port,
                    username: connInfo.proxy_username || undefined,
                    password: connInfo.proxy_encrypted_password ? decrypt(connInfo.proxy_encrypted_password) : undefined,
                };
            }
        } catch (decryptError: any) {
             console.error(`处理连接 ${connectionId} 凭证或代理凭证失败:`, decryptError);
             res.status(500).json({ success: false, message: `处理凭证失败: ${decryptError.message}` });
             return;
        }


        // 3. 构建 ssh2 连接配置
        let connectConfig: any = {
            host: fullConnInfo.host,
            port: fullConnInfo.port,
            username: fullConnInfo.username,
            password: fullConnInfo.password,
            privateKey: fullConnInfo.privateKey,
            passphrase: fullConnInfo.passphrase,
            readyTimeout: TEST_TIMEOUT, // 使用测试超时
            keepaliveInterval: 0, // 测试连接不需要 keepalive
        };

        // 4. 应用代理配置 (复用 websocket.ts 的逻辑，但更健壮)
        const sshClient = new Client();
        let connectionPromise: Promise<void>;

        if (fullConnInfo.proxy) {
            const proxy = fullConnInfo.proxy;
            console.log(`测试连接 ${connectionId}: 应用代理 ${proxy.name} (${proxy.type})`);
            if (proxy.type === 'SOCKS5') {
                const socksOptions = {
                    proxy: {
                        host: proxy.host,
                        port: proxy.port,
                        type: 5 as 5,
                        userId: proxy.username,
                        password: proxy.password,
                    },
                    command: 'connect' as 'connect',
                    destination: {
                        host: fullConnInfo.host,
                        port: fullConnInfo.port,
                    },
                    timeout: TEST_TIMEOUT,
                };
                // SOCKS 连接本身就是一个 Promise
                connectionPromise = SocksClient.createConnection(socksOptions)
                    .then(({ socket }) => {
                        console.log(`测试连接 ${connectionId}: SOCKS5 代理连接成功`);
                        connectConfig.sock = socket;
                        // SSH 连接在 SOCKS 成功后进行
                        return new Promise<void>((resolve, reject) => { // 指定 Promise 类型为 void
                             // 使用 once 可能更符合类型定义
                             sshClient.once('ready', resolve).once('error', reject).connect(connectConfig);
                        });
                    })
                    .catch(socksError => {
                         console.error(`测试连接 ${connectionId}: SOCKS5 代理失败:`, socksError);
                         throw new Error(`SOCKS5 代理连接失败: ${socksError.message}`); // 抛出错误以便捕获
                     });
 
             } else if (proxy.type === 'HTTP') {
                 console.log(`测试连接 ${connectionId}: 尝试通过 HTTP 代理 ${proxy.host}:${proxy.port} 建立隧道...`);
                 // 手动发起 CONNECT 请求
                 connectionPromise = new Promise<void>((resolveConnect, rejectConnect) => {
                     const reqOptions: http.RequestOptions = {
                         method: 'CONNECT',
                         host: proxy.host,
                         port: proxy.port,
                         path: `${fullConnInfo.host}:${fullConnInfo.port}`, // 目标 SSH 服务器地址和端口
                         timeout: TEST_TIMEOUT,
                         agent: false, // 不使用全局 agent
                     };
                     // 添加代理认证头部 (如果需要)
                     if (proxy.username) {
                         const auth = 'Basic ' + Buffer.from(proxy.username + ':' + (proxy.password || '')).toString('base64');
                         reqOptions.headers = {
                             ...reqOptions.headers,
                             'Proxy-Authorization': auth,
                             'Proxy-Connection': 'Keep-Alive', // 某些代理需要
                             'Host': `${fullConnInfo.host}:${fullConnInfo.port}` // CONNECT 请求的目标
                         };
                     }

                     const req = http.request(reqOptions);
                     req.on('connect', (res, socket, head) => {
                         if (res.statusCode === 200) {
                             console.log(`测试连接 ${connectionId}: HTTP 代理隧道建立成功`);
                             connectConfig.sock = socket; // 使用建立的隧道 socket
                             // 在隧道建立后尝试 SSH 连接
                             new Promise<void>((resolveSSH, rejectSSH) => {
                                 sshClient.once('ready', resolveSSH).once('error', rejectSSH).connect(connectConfig);
                             })
                             .then(resolveConnect) // SSH 成功则 resolve 外层 Promise
                             .catch(rejectConnect); // SSH 失败则 reject 外层 Promise
                         } else {
                             console.error(`测试连接 ${connectionId}: HTTP 代理 CONNECT 请求失败, 状态码: ${res.statusCode}`);
                             socket.destroy();
                             rejectConnect(new Error(`HTTP 代理连接失败 (状态码: ${res.statusCode})`));
                         }
                     });
                     req.on('error', (err) => {
                         console.error(`测试连接 ${connectionId}: HTTP 代理请求错误:`, err);
                         rejectConnect(new Error(`HTTP 代理连接错误: ${err.message}`));
                     });
                     req.on('timeout', () => {
                         console.error(`测试连接 ${connectionId}: HTTP 代理请求超时`);
                         req.destroy(); // 销毁请求
                         rejectConnect(new Error('HTTP 代理连接超时'));
                     });
                     req.end(); // 发送请求
                 });
             } else {
                 // 未知代理类型
                 res.status(400).json({ success: false, message: `不支持的代理类型: ${proxy.type}` });
                 return;
            }
        } else {
             // 无代理，直接连接
             connectionPromise = new Promise<void>((resolve, reject) => { // 指定 Promise 类型为 void
                 // 使用 once 可能更符合类型定义
                 sshClient.once('ready', resolve).once('error', reject).connect(connectConfig);
             });
         }

        // 5. 执行连接测试并处理结果
        try {
            await connectionPromise;
            console.log(`测试连接 ${connectionId}: SSH 连接成功`);
            res.status(200).json({ success: true, message: '连接测试成功。' });
        } catch (sshError: any) {
            console.error(`测试连接 ${connectionId}: SSH 连接失败:`, sshError);
            // 尝试提供更具体的错误信息
            let errorMessage = sshError.message || '未知 SSH 错误';
            if (sshError.level === 'client-authentication') {
                errorMessage = '认证失败 (用户名、密码或密钥错误)';
            } else if (sshError.code === 'ENOTFOUND' || sshError.code === 'ECONNREFUSED') {
                errorMessage = '无法连接到主机或端口';
            } else if (sshError.message.includes('Timed out')) {
                 errorMessage = `连接超时 (${TEST_TIMEOUT / 1000}秒)`;
            }
            res.status(500).json({ success: false, message: `连接测试失败: ${errorMessage}` });
        } finally {
             // 无论成功失败，都关闭 SSH 客户端
             sshClient.end();
        }

    } catch (error: any) {
        console.error(`测试连接 ${connectionId} 时发生内部错误:`, error);
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};
