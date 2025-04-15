import { Database, Statement } from 'sqlite3';
import { getDb } from '../database';

const db = getDb();

// 定义 Proxy 类型 (可以共享到 types 文件)
export interface ProxyData {
    id: number;
    name: string;
    type: 'SOCKS5' | 'HTTP';
    host: string;
    port: number;
    username?: string | null;
    auth_method: 'none' | 'password' | 'key';
    encrypted_password?: string | null;
    encrypted_private_key?: string | null;
    encrypted_passphrase?: string | null;
    created_at: number;
    updated_at: number;
}

/**
 * 根据名称、类型、主机和端口查找代理
 */
export const findProxyByNameTypeHostPort = async (name: string, type: string, host: string, port: number): Promise<{ id: number } | undefined> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id FROM proxies WHERE name = ? AND type = ? AND host = ? AND port = ?`,
            [name, type, host, port],
            (err: Error | null, row: { id: number } | undefined) => {
                if (err) {
                    console.error(`Repository: 查找代理时出错 (name=${name}, type=${type}, host=${host}, port=${port}):`, err.message);
                    return reject(new Error(`查找代理时出错: ${err.message}`));
                }
                resolve(row);
            }
        );
    });
};

/**
 * 创建新代理
 */
export const createProxy = async (data: Omit<ProxyData, 'id' | 'created_at' | 'updated_at'>): Promise<number> => {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(
            `INSERT INTO proxies (name, type, host, port, username, auth_method, encrypted_password, encrypted_private_key, encrypted_passphrase, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run(
            data.name, data.type, data.host, data.port,
            data.username || null,
            data.auth_method || 'none',
            data.encrypted_password || null,
            data.encrypted_private_key || null,
            data.encrypted_passphrase || null,
            now, now,
            function (this: Statement, err: Error | null) {
                stmt.finalize();
                if (err) {
                    console.error('Repository: 创建代理时出错:', err.message);
                    return reject(new Error(`创建代理时出错: ${err.message}`));
                }
                resolve((this as any).lastID);
            }
        );
    });
};

/**
 * 获取所有代理
 */
export const findAllProxies = async (): Promise<ProxyData[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM proxies ORDER BY name ASC`, (err, rows: ProxyData[]) => {
            if (err) {
                console.error('Repository: 查询代理列表时出错:', err.message);
                return reject(new Error('获取代理列表失败'));
            }
            resolve(rows);
        });
    });
};

/**
 * 根据 ID 获取单个代理
 */
export const findProxyById = async (id: number): Promise<ProxyData | null> => {
     return new Promise((resolve, reject) => {
         db.get(`SELECT * FROM proxies WHERE id = ?`, [id], (err, row: ProxyData) => {
             if (err) {
                 console.error(`Repository: 查询代理 ${id} 时出错:`, err.message);
                 return reject(new Error('获取代理信息失败'));
             }
             resolve(row || null);
         });
     });
 };


/**
 * 更新代理信息
 */
export const updateProxy = async (id: number, data: Partial<Omit<ProxyData, 'id' | 'created_at'>>): Promise<boolean> => {
    const fieldsToUpdate: { [key: string]: any } = { ...data };
    const params: any[] = [];

    delete fieldsToUpdate.id;
    delete fieldsToUpdate.created_at;

    fieldsToUpdate.updated_at = Math.floor(Date.now() / 1000);

    const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    Object.values(fieldsToUpdate).forEach(value => params.push(value ?? null));

    if (!setClauses) {
        return false;
    }

    params.push(id);

    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`UPDATE proxies SET ${setClauses} WHERE id = ?`);
        stmt.run(...params, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                console.error(`Repository: 更新代理 ${id} 时出错:`, err.message);
                return reject(new Error('更新代理记录失败'));
            }
            resolve((this as any).changes > 0);
        });
    });
};

/**
 * 删除代理
 */
export const deleteProxy = async (id: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        // 注意：connections 表中的 proxy_id 外键设置了 ON DELETE SET NULL，
        // 所以删除代理时，关联的连接会自动将 proxy_id 设为 NULL。
        const stmt = db.prepare(`DELETE FROM proxies WHERE id = ?`);
        stmt.run(id, function (this: Statement, err: Error | null) {
            stmt.finalize();
            if (err) {
                console.error(`Repository: 删除代理 ${id} 时出错:`, err.message);
                return reject(new Error('删除代理记录失败'));
            }
            resolve((this as any).changes > 0);
        });
    });
};
