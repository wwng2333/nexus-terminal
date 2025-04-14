import { Request, Response } from 'express';
import path from 'path'; // 需要 path 用于处理文件名
import { activeSshConnections } from '../websocket'; // 导入共享的连接 Map

/**
 * 处理文件下载请求 (GET /api/v1/sftp/download)
 */
export const downloadFile = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const connectionId = req.query.connectionId as string; // 从查询参数获取
    const remotePath = req.query.remotePath as string;   // 从查询参数获取

    // 参数验证
    if (!userId) {
        res.status(401).json({ message: '未授权：需要登录。' });
        return;
    }
    if (!connectionId || !remotePath) {
        res.status(400).json({ message: '缺少必要的查询参数 (connectionId, remotePath)。' });
        return;
    }

    console.log(`SFTP 下载请求：用户 ${userId}, 连接 ${connectionId}, 路径 ${remotePath}`);

    // 查找与当前用户会话关联的活动 WebSocket 连接和 SFTP 会话
    let userSftpSession = null;
    // 注意：这种查找方式效率不高，实际应用中可能需要更优化的结构来按 userId 查找连接
    for (const [ws, connData] of activeSshConnections.entries()) {
        // 假设 AuthenticatedWebSocket 上存储了 userId
        if ((ws as any).userId === userId && connData.sftp) {
            // 这里简单地取第一个找到的匹配连接，没有处理 connectionId 的匹配
            // TODO: 需要一种方式将 HTTP 请求与特定的 WebSocket/SSH/SFTP 会话关联起来
            // 临时方案：假设一个用户只有一个活动的 SSH/SFTP 会话
            userSftpSession = connData.sftp;
            console.log(`找到用户 ${userId} 的活动 SFTP 会话。`);
            break;
        }
    }

    if (!userSftpSession) {
        console.warn(`SFTP 下载失败：未找到用户 ${userId} 的活动 SFTP 会话。`);
        res.status(404).json({ message: '未找到活动的 SFTP 会话。请确保您已通过 WebSocket 连接到目标服务器。' });
        return;
    }

    try {
        // 获取文件状态以确定文件大小（可选，但有助于设置 Content-Length）
        const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
            userSftpSession!.lstat(remotePath, (err, stats) => {
                if (err) return reject(err);
                resolve(stats);
            });
        });

        if (!stats.isFile()) {
            res.status(400).json({ message: '指定的路径不是一个文件。' });
            return;
        }

        // 设置响应头
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(remotePath)}"`); // 建议浏览器下载的文件名
        res.setHeader('Content-Type', 'application/octet-stream'); // 通用二进制类型
        if (stats.size) {
            res.setHeader('Content-Length', stats.size.toString());
        }

        // 创建可读流并 pipe 到响应对象
        const readStream = userSftpSession.createReadStream(remotePath);

        readStream.on('error', (err: Error) => { // 添加 Error 类型注解
            console.error(`SFTP 读取流错误 (用户 ${userId}, 路径 ${remotePath}):`, err);
            // 如果响应头还没发送，可以发送错误状态码
            if (!res.headersSent) {
                res.status(500).json({ message: `读取远程文件失败: ${err.message}` });
            } else {
                // 如果头已发送，只能尝试结束响应
                res.end();
            }
        });

        readStream.pipe(res); // 将文件流直接传输给客户端

        // 监听响应对象的 close 事件，确保流被正确关闭 (虽然 pipe 通常会处理)
        res.on('close', () => {
            console.log(`SFTP 下载流关闭 (用户 ${userId}, 路径 ${remotePath})`);
            // readStream.destroy(); // 可选：显式销毁流
        });

        console.log(`SFTP 开始下载 (用户 ${userId}, 路径 ${remotePath})`);

    } catch (error: any) {
        console.error(`SFTP 下载处理失败 (用户 ${userId}, 路径 ${remotePath}):`, error);
        if (!res.headersSent) {
            if (error.message?.includes('No such file')) {
                 res.status(404).json({ message: '远程文件未找到。' });
            } else {
                 res.status(500).json({ message: `处理下载请求时出错: ${error.message}` });
            }
        }
    }
};

// 其他 SFTP 控制器函数 (例如上传)
// export const uploadFile = ...
