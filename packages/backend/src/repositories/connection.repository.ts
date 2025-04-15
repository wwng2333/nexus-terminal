import { Database, Statement } from 'sqlite3';
import { getDb } from '../database';

const db = getDb();

// 定义 Connection 类型 (可以从 controller 或 types 文件导入，暂时在此定义)
// 注意：这里不包含加密字段，因为 Repository 不应处理解密
interface ConnectionBase {
    id: number;
    name: string | null; // 允许 name 为 null
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    proxy_id: number | null;
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

interface ConnectionWithTags extends ConnectionBase {
    tag_ids: number[];
}

// 包含加密字段的完整类型，用于插入/更新
export interface FullConnectionData extends ConnectionBase { // <-- Added export
    encrypted_password?: string | null;
    encrypted_private_key?: string | null;
    encrypted_passphrase?: string | null;
}


/**
 * 获取所有连接及其标签
 */
export const findAllConnectionsWithTags = async (): Promise<ConnectionWithTags[]> => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT
                c.id, c.name, c.host, c.port, c.username, c.auth_method, c.proxy_id,
                c.created_at, c.updated_at, c.last_connected_at,
                GROUP_CONCAT(ct.tag_id) as tag_ids_str
             FROM connections c
             LEFT JOIN connection_tags ct ON c.id = ct.connection_id
             GROUP BY c.id
             ORDER BY c.name ASC`,
            (err, rows: any[]) => {
                if (err) {
                    console.error('Repository: 查询连接列表时出错:', err.message);
                    return reject(new Error('获取连接列表失败'));
                }
                const processedRows = rows.map(row => ({
                    ...row,
                    tag_ids: row.tag_ids_str ? row.tag_ids_str.split(',').map(Number) : []
                }));
                resolve(processedRows);
            }
        );
    });
};

/**
 * 根据 ID 获取单个连接及其标签
 */
export const findConnectionByIdWithTags = async (id: number): Promise<ConnectionWithTags | null> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT
                c.id, c.name, c.host, c.port, c.username, c.auth_method, c.proxy_id,
                c.created_at, c.updated_at, c.last_connected_at,
                GROUP_CONCAT(ct.tag_id) as tag_ids_str
             FROM connections c
             LEFT JOIN connection_tags ct ON c.id = ct.connection_id
             WHERE c.id = ?
             GROUP BY c.id`,
            [id],
            (err, row: any) => {
                if (err) {
                    console.error(`Repository: 查询连接 ${id} 时出错:`, err.message);
                    return reject(new Error('获取连接信息失败'));
                }
                if (row) {
                    row.tag_ids = row.tag_ids_str ? row.tag_ids_str.split(',').map(Number) : [];
                    delete row.tag_ids_str;
                    resolve(row);
                } else {
                    resolve(null);
                }
            }
        );
    });
};

/**
 * 根据 ID 获取单个连接的完整信息 (包括加密字段)
 * 用于更新或测试连接等需要完整信息的场景
 */
export const findFullConnectionById = async (id: number): Promise<any | null> => {
     return new Promise((resolve, reject) => {
         // 查询连接信息，并 LEFT JOIN 代理信息 (因为测试连接需要)
         // 注意：这里返回的结构比较复杂，服务层需要处理
         db.get(
             `SELECT
                 c.*, -- 选择 connections 表所有列
                 p.id as proxy_db_id, p.name as proxy_name, p.type as proxy_type,
                 p.host as proxy_host, p.port as proxy_port, p.username as proxy_username,
                 p.encrypted_password as proxy_encrypted_password,
                 p.encrypted_private_key as proxy_encrypted_private_key, -- 包含代理的 key
                 p.encrypted_passphrase as proxy_encrypted_passphrase -- 包含代理的 passphrase
              FROM connections c
              LEFT JOIN proxies p ON c.proxy_id = p.id
              WHERE c.id = ?`,
             [id],
             (err, row: any) => {
                 if (err) {
                     console.error(`Repository: 查询连接 ${id} 详细信息时出错:`, err.message);
                     return reject(new Error('获取连接详细信息失败'));
                 }
                 resolve(row || null);
             }
         );
     });
 };


/**
 * 创建新连接
 */
// Update function signature to accept name as string | null
export const createConnection = async (data: Omit<FullConnectionData, 'id' | 'created_at' | 'updated_at' | 'last_connected_at'> & { name: string | null }): Promise<number> => {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(
            `INSERT INTO connections (name, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, proxy_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run(
            data.name ?? null, // Ensure null is passed if name is null/undefined
            data.host, data.port, data.username, data.auth_method,
            data.encrypted_password ?? null, data.encrypted_private_key ?? null, data.encrypted_passphrase ?? null,
            data.proxy_id ?? null,
            now, now,
            function (this: Statement, err: Error | null) {
                stmt.finalize(); // 确保 finalize 被调用
                if (err) {
                    console.error('Repository: 插入连接时出错:', err.message);
                    return reject(new Error('创建连接记录失败'));
                }
                resolve((this as any).lastID);
            }
        );
    });
};

/**
 * 更新连接信息
 */
// Update function signature to accept name as string | null | undefined
export const updateConnection = async (id: number, data: Partial<Omit<FullConnectionData, 'id' | 'created_at' | 'last_connected_at'> & { name?: string | null }>): Promise<boolean> => {
    const fieldsToUpdate: { [key: string]: any } = { ...data };
    const params: any[] = [];

    // 移除 id, created_at, last_connected_at (不应通过此方法更新)
    delete fieldsToUpdate.id;
    delete fieldsToUpdate.created_at;
    delete fieldsToUpdate.last_connected_at;

    // 设置 updated_at
    fieldsToUpdate.updated_at = Math.floor(Date.now() / 1000);

    const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    Object.values(fieldsToUpdate).forEach(value => params.push(value ?? null)); // 处理 undefined 为 null

    if (!setClauses) {
        return false; // 没有要更新的字段
    }

    params.push(id); // 添加 WHERE id = ? 的参数

    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `UPDATE connections SET ${setClauses} WHERE id = ?`
        );
        stmt.run(...params, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                console.error(`Repository: 更新连接 ${id} 时出错:`, err.message);
                return reject(new Error('更新连接记录失败'));
            }
            resolve((this as any).changes > 0);
        });
    });
};


/**
 * 删除连接
 */
export const deleteConnection = async (id: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `DELETE FROM connections WHERE id = ?`
        );
        stmt.run(id, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                console.error(`Repository: 删除连接 ${id} 时出错:`, err.message);
                return reject(new Error('删除连接记录失败'));
            }
            resolve((this as any).changes > 0);
        });
    });
};

/**
 * 更新连接的标签关联
 * @param connectionId 连接 ID
 * @param tagIds 新的标签 ID 数组 (空数组表示清除所有标签)
 */
export const updateConnectionTags = async (connectionId: number, tagIds: number[]): Promise<void> => {
    const deleteStmt = db.prepare(`DELETE FROM connection_tags WHERE connection_id = ?`);
    const insertStmt = db.prepare(`INSERT INTO connection_tags (connection_id, tag_id) VALUES (?, ?)`);

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            try {
                // 1. 删除旧关联
                deleteStmt.run(connectionId, (err: Error | null) => {
                    if (err) throw err;
                });
                deleteStmt.finalize();

                // 2. 插入新关联 (如果 tagIds 不为空)
                if (tagIds.length > 0) {
                    tagIds.forEach((tagId: any) => {
                        if (typeof tagId === 'number' && tagId > 0) {
                            insertStmt.run(connectionId, tagId, (err: Error | null) => {
                                 if (err) throw err;
                            });
                        } else {
                             console.warn(`Repository: 更新连接 ${connectionId} 标签时，提供的 tag_id 无效: ${tagId}`);
                        }
                    });
                }
                insertStmt.finalize();
                db.run('COMMIT', (commitErr: Error | null) => {
                    if (commitErr) throw commitErr;
                    resolve(); // 事务成功
                });
            } catch (tagError: any) {
                console.error(`Repository: 更新连接 ${connectionId} 的标签关联时出错:`, tagError);
                db.run('ROLLBACK');
                reject(new Error('处理标签关联失败'));
            }
        });
    });
};

/**
 * 批量插入连接（用于导入）
 * 注意：此函数应在事务中调用
 */
export const bulkInsertConnections = async (connections: Omit<FullConnectionData, 'id' | 'created_at' | 'updated_at' | 'last_connected_at'>[]): Promise<{ connectionId: number, originalData: any }[]> => {
    const insertConnStmt = db.prepare(`INSERT INTO connections (name, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, proxy_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertTagStmt = db.prepare(`INSERT INTO connection_tags (connection_id, tag_id) VALUES (?, ?)`);
    const results: { connectionId: number, originalData: any }[] = [];
    const now = Math.floor(Date.now() / 1000);

    try {
        for (const connData of connections) {
            const connResult = await new Promise<{ lastID: number }>((resolve, reject) => {
                insertConnStmt.run(
                    connData.name, connData.host, connData.port, connData.username, connData.auth_method,
                    connData.encrypted_password || null,
                    connData.encrypted_private_key || null,
                    connData.encrypted_passphrase || null,
                    connData.proxy_id || null,
                    now, now,
                    function (this: Statement, err: Error | null) {
                        if (err) return reject(new Error(`插入连接 "${connData.name}" 时出错: ${err.message}`));
                        resolve({ lastID: (this as any).lastID });
                    }
                );
            });
            const newConnectionId = connResult.lastID;
            results.push({ connectionId: newConnectionId, originalData: connData }); // Store ID and original data for tag association

            // 处理标签关联 (在同一个事务中)
            if (Array.isArray((connData as any).tag_ids) && (connData as any).tag_ids.length > 0) {
                for (const tagId of (connData as any).tag_ids) {
                    if (typeof tagId === 'number' && tagId > 0) {
                        await new Promise<void>((resolve, reject) => {
                            insertTagStmt.run(newConnectionId, tagId, (err: Error | null) => {
                                if (err) {
                                    // 警告但不中断整个导入
                                    console.warn(`Repository: 导入连接 ${connData.name}: 关联标签 ID ${tagId} 失败: ${err.message}`);
                                }
                                resolve();
                            });
                        });
                    }
                }
            }
        }
        return results;
    } finally {
        // Finalize statements after the loop
        insertConnStmt.finalize();
        insertTagStmt.finalize();
    }
};
