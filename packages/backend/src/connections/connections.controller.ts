import { Request, Response } from 'express';
import { Statement } from 'sqlite3'; // 引入 Statement 类型
import { getDb } from '../database';
import { encrypt } from '../utils/crypto'; // 引入加密函数

const db = getDb();

// 连接数据结构 (仅用于类型提示，不包含敏感信息)
interface ConnectionInfo {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password'; // MVP 仅支持密码
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

/**
 * 创建新连接 (POST /api/v1/connections)
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
    const { name, host, port = 22, username, password } = req.body;
    const auth_method = 'password'; // MVP 强制为 password
    const userId = req.session.userId; // 从会话获取用户 ID

    // 输入验证 (基础)
    if (!name || !host || !username || !password) {
        res.status(400).json({ message: '缺少必要的连接信息 (name, host, username, password)。' });
        return;
    }
    if (typeof port !== 'number' || port <= 0 || port > 65535) {
        res.status(400).json({ message: '端口号无效。' });
        return;
    }

    try {
        // 加密密码
        const encryptedPassword = encrypt(password);
        const now = Math.floor(Date.now() / 1000); // 当前 Unix 时间戳 (秒)

        // 插入数据库
        const result = await new Promise<{ lastID: number }>((resolve, reject) => {
            const stmt = db.prepare(
                `INSERT INTO connections (name, host, port, username, auth_method, encrypted_password, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            );
            // 注意：这里没有存储 userId，因为 MVP 只有一个用户。如果未来支持多用户，需要添加 user_id 字段。
            // 使用 function 关键字以保留正确的 this 上下文，并为 err 和 this 添加类型注解
            stmt.run(name, host, port, username, auth_method, encryptedPassword, now, now, function (this: Statement, err: Error | null) {
                if (err) {
                    console.error('插入连接时出错:', err.message);
                    return reject(new Error('创建连接失败'));
                }
                // this.lastID 包含新插入行的 ID
                // 使用类型断言 (as any) 来解决 TS 类型检查问题
                resolve({ lastID: (this as any).lastID });
            });
            stmt.finalize(); // 完成语句执行
        });

        // 返回成功响应
        res.status(201).json({
            message: '连接创建成功。',
            connection: {
                id: result.lastID,
                name, host, port, username, auth_method,
                created_at: now, updated_at: now, last_connected_at: null
            }
        });

    } catch (error) {
        console.error('创建连接时发生错误:', error);
        res.status(500).json({ message: '创建连接时发生内部服务器错误。' });
    }
};

/**
 * 获取连接列表 (GET /api/v1/connections)
 */
export const getConnections = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId; // 虽然 MVP 只有一个用户，但保留以备将来使用

    try {
        // 查询数据库，排除敏感字段 encrypted_password
        // 注意：如果未来支持多用户，需要添加 WHERE user_id = ? 条件
        const connections = await new Promise<ConnectionInfo[]>((resolve, reject) => {
            db.all(
                `SELECT id, name, host, port, username, auth_method, created_at, updated_at, last_connected_at
                 FROM connections
                 ORDER BY name ASC`, // 按名称排序
                (err, rows: ConnectionInfo[]) => {
                    if (err) {
                        console.error('查询连接列表时出错:', err.message);
                        return reject(new Error('获取连接列表失败'));
                    }
                    resolve(rows);
                }
            );
        });

        res.status(200).json(connections);

    } catch (error) {
        console.error('获取连接列表时发生错误:', error);
        res.status(500).json({ message: '获取连接列表时发生内部服务器错误。' });
    }
};

// 其他控制器函数的占位符
// export const getConnectionById = ...
// export const updateConnection = ...
// export const deleteConnection = ...
// export const testConnection = ...
