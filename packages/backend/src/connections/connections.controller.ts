import { Request, Response } from 'express';
import * as ConnectionService from '../services/connection.service';
import * as SshService from '../services/ssh.service';
import * as ImportExportService from '../services/import-export.service';
import * as ConnectionRepository from '../repositories/connection.repository'; // +++ 导入 ConnectionRepository +++



/**
 * 创建新连接 (POST /api/v1/connections)
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const newConnection = await ConnectionService.createConnection(req.body);
        res.status(201).json({ message: '连接创建成功。', connection: newConnection });

    } catch (error: any) {
        console.error('Controller: 创建连接时发生错误:', error);
        if (error.message.includes('缺少') || error.message.includes('需要提供')) {
             res.status(400).json({ message: error.message });
        } else {
             res.status(500).json({ message: error.message || '创建连接时发生内部服务器错误。' });
        }
    }
};

/**
 * 获取连接列表 (GET /api/v1/connections)
 */
export const getConnections = async (req: Request, res: Response): Promise<void> => {
    try {
        const connections = await ConnectionService.getAllConnections();
        res.status(200).json(connections);
    } catch (error: any) {
        console.error('Controller: 获取连接列表时发生错误:', error);
        res.status(500).json({ message: error.message || '获取连接列表时发生内部服务器错误。' });
    }
};

/**
 * 获取单个连接信息 (GET /api/v1/connections/:id)
 */
export const getConnectionById = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        const connection = await ConnectionService.getConnectionById(connectionId);

        if (!connection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json(connection);
        }
    } catch (error: any) {
        console.error(`Controller: 获取连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '获取连接信息时发生内部服务器错误。' });
    }
};

/**
 * 更新连接信息 (PUT /api/v1/connections/:id)
 */
export const updateConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }


        const updatedConnection = await ConnectionService.updateConnection(connectionId, req.body);

        if (!updatedConnection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json({ message: '连接更新成功。', connection: updatedConnection });
        }
    } catch (error: any) {
        console.error(`Controller: 更新连接 ${req.params.id} 时发生错误:`, error);
         if (error.message.includes('需要提供')) {
              res.status(400).json({ message: error.message });
         } else {
              res.status(500).json({ message: error.message || '更新连接时发生内部服务器错误。' });
         }
    }
};

/**
 * 删除连接 (DELETE /api/v1/connections/:id)
 */
export const deleteConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        const deleted = await ConnectionService.deleteConnection(connectionId);

        if (!deleted) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json({ message: '连接删除成功。' });
        }
    } catch (error: any) {
        console.error(`Controller: 删除连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除连接时发生内部服务器错误。' });
    }
};


/**
 * 测试连接 (POST /api/v1/connections/:id/test)
 */
export const testConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        // 调用 SshService 进行连接测试，现在它会返回延迟
        const { latency } = await SshService.testConnection(connectionId);

        res.status(200).json({ success: true, message: '连接测试成功。', latency }); // 返回延迟

    } catch (error: any) {
        console.error(`Controller: 测试连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};


/**
 * 测试未保存的连接信息 (POST /api/v1/connections/test-unsaved)
 */
export const testUnsavedConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        // 从请求体中提取连接信息 (添加 ssh_key_id)
        const { host, port, username, auth_method, password, private_key, passphrase, proxy_id, ssh_key_id } = req.body;

        // 基本验证
        if (!host || !port || !username || !auth_method) {
            res.status(400).json({ success: false, message: '缺少必要的连接信息 (host, port, username, auth_method)。' });
            return;
        }
        // 密码认证时，password 字段必须存在，但可以为空字符串
        if (auth_method === 'password' && password === undefined) {
            res.status(400).json({ success: false, message: '密码认证方式需要提供 password 字段 (可以为空字符串)。' });
            return;
        }
        // 密钥认证时，必须提供 ssh_key_id 或 private_key
        if (auth_method === 'key' && !ssh_key_id && !private_key) {
            res.status(400).json({ success: false, message: '密钥认证方式需要提供 ssh_key_id 或 private_key。' });
            return;
        }
        // 如果同时提供了 ssh_key_id 和 private_key，优先使用 ssh_key_id (或者可以报错，这里选择优先)
        if (auth_method === 'key' && ssh_key_id && private_key) {
             console.warn('[testUnsavedConnection] 同时提供了 ssh_key_id 和 private_key，将优先使用 ssh_key_id。');
             // 不需要额外操作，后续逻辑会处理
        }

        // 构建传递给服务层的连接配置对象
        // 注意：这里传递的是未经验证和加密处理的原始数据
        const connectionConfig = {
            host,
            port: parseInt(port, 10), // 确保 port 是数字
            username,
            auth_method,
            password, // 传递原始密码
            private_key: ssh_key_id ? undefined : private_key, // 如果有 ssh_key_id，则不传递 private_key
            passphrase: ssh_key_id ? undefined : passphrase,   // 如果有 ssh_key_id，则不传递 passphrase
            ssh_key_id: ssh_key_id ? parseInt(ssh_key_id, 10) : null, // 传递 ssh_key_id (确保是数字或 null)
            proxy_id: proxy_id ? parseInt(proxy_id, 10) : null // 确保 proxy_id 是数字或 null
        };

        // 验证 port 和 proxy_id 是否为有效数字
        if (isNaN(connectionConfig.port)) {
             res.status(400).json({ success: false, message: '端口号必须是有效的数字。' });
             return;
        }
        if (proxy_id && isNaN(connectionConfig.proxy_id as number)) {
             res.status(400).json({ success: false, message: '代理 ID 必须是有效的数字。' });
             return;
        }
        // 验证 ssh_key_id (如果提供了)
        if (ssh_key_id && isNaN(connectionConfig.ssh_key_id as number)) {
             res.status(400).json({ success: false, message: 'SSH 密钥 ID 必须是有效的数字。' });
             return;
        }


        // 调用 SshService 进行连接测试，现在它会返回延迟
        // 注意：SshService.testUnsavedConnection 需要处理原始凭证
        const { latency } = await SshService.testUnsavedConnection(connectionConfig);

        // 如果 SshService.testUnsavedConnection 没有抛出错误，则表示成功
        res.status(200).json({ success: true, message: '连接测试成功。', latency });

    } catch (error: any) {
        console.error(`Controller: 测试未保存连接时发生错误:`, error);
        // SshService 会抛出包含具体原因的 Error
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};



/**
 * 导出所有连接配置 (GET /api/v1/connections/export)
 */
export const exportConnections = async (req: Request, res: Response): Promise<void> => {
    try {
        const exportedData = await ImportExportService.exportConnections();

        // 设置响应头，提示浏览器下载文件
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `nexus-terminal-connections-${timestamp}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(exportedData);

    } catch (error: any) {
        console.error('Controller: 导出连接时发生错误:', error);
        res.status(500).json({ message: error.message || '导出连接时发生内部服务器错误。' });
    }
};

/**
 * 导入连接配置 (POST /api/v1/connections/import)
 */
export const importConnections = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
        res.status(400).json({ message: '未找到上传的文件 (需要名为 "connectionsFile" 的文件)。' });
        return;
    }

    try {
        const result = await ImportExportService.importConnections(req.file.buffer);

        if (result.failureCount > 0) {
             res.status(400).json({ 
                 message: `导入完成，但存在 ${result.failureCount} 个错误。成功导入 ${result.successCount} 条。`,
                 successCount: result.successCount,
                 failureCount: result.failureCount,
                 errors: result.errors
             });
        } else {

            res.status(200).json({
                message: `导入成功完成。共导入 ${result.successCount} 条连接。`,
                successCount: result.successCount,
                failureCount: 0
            });
        }
    } catch (error: any) {
        console.error('Controller: 导入连接时发生错误:', error);
        if (error.message.includes('解析 JSON 文件失败')) {
             res.status(400).json({ message: error.message });
        } else {
             res.status(500).json({ message: error.message || '导入连接时发生内部服务器错误。' });
        }
    }
};
import axios from 'axios'; // +++ Import axios +++

// TODO: Make RDP backend URL configurable
const RDP_BACKEND_API_BASE = process.env.RDP_BACKEND_API_BASE || 'http://localhost:9090';

/**
 * 获取 RDP 会话的 Guacamole 令牌 (通过调用 RDP 后端)
 * GET /api/v1/connections/:id/rdp-session
 */
export const getRdpSessionToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        // 1. 获取连接信息和解密后的凭证
        const connectionData = await ConnectionService.getConnectionWithDecryptedCredentials(connectionId);

        if (!connectionData) {
            res.status(404).json({ message: '连接未找到。' });
            return;
        }

        const { connection, decryptedPassword } = connectionData;

        // 2. 验证连接类型是否为 RDP
        if (connection.type !== 'RDP') {
            res.status(400).json({ message: '此连接类型不是 RDP。' });
            return;
        }

        // +++ 在确认是 RDP 连接后，立即更新 last_connected_at +++
        try {
            const currentTimeSeconds = Math.floor(Date.now() / 1000);
            await ConnectionRepository.updateLastConnected(connectionId, currentTimeSeconds);
            console.log(`[Controller:getRdpSessionToken] 已更新 RDP 连接 ${connectionId} 的 last_connected_at 为 ${currentTimeSeconds}`);
        } catch (updateError) {
            // 记录更新时间戳的错误，但不阻止获取令牌的流程
            console.error(`[Controller:getRdpSessionToken] 更新 RDP 连接 ${connectionId} 的 last_connected_at 时出错:`, updateError);
        }
        // +++++++++++++++++++++++++++++++++++++++++++++++++++++++

        // 3. 验证 RDP 连接是否使用密码认证
        if (connection.auth_method !== 'password' || !decryptedPassword) {
             console.warn(`[Controller:getRdpSessionToken] RDP connection ${connectionId} does not use password auth or password decryption failed.`);
             res.status(400).json({ message: 'RDP 连接需要使用密码认证，或密码解密失败。' });
             return;
        }

        // 4. 准备调用 RDP 后端的参数
        const rdpApiParams = new URLSearchParams({
            hostname: connection.host,
            port: connection.port.toString(),
            username: connection.username,
            password: decryptedPassword, // 使用解密后的密码
            // Add other RDP parameters from connection object if needed by rdp backend
            security: (connection as any).rdp_security || 'any',
            ignoreCert: String((connection as any).rdp_ignore_cert ?? true),
        });
        const rdpTokenUrl = `${RDP_BACKEND_API_BASE}/api/get-token?${rdpApiParams.toString()}`;

        console.log(`[Controller:getRdpSessionToken] Calling RDP backend API: ${RDP_BACKEND_API_BASE}/api/get-token?...`);

        // 5. 调用 RDP 后端 API 获取 Guacamole 令牌
        const rdpResponse = await axios.get<{ token: string }>(rdpTokenUrl, {
             timeout: 10000 // 设置 10 秒超时
        });

        if (rdpResponse.status !== 200 || !rdpResponse.data?.token) {
             console.error(`[Controller:getRdpSessionToken] RDP backend API call failed or returned invalid data. Status: ${rdpResponse.status}`, rdpResponse.data);
             throw new Error('从 RDP 后端获取令牌失败。');
        }

        const guacamoleToken = rdpResponse.data.token;
        console.log(`[Controller:getRdpSessionToken] Received Guacamole token from RDP backend for connection ${connectionId}`);

        // 6. 将 Guacamole 令牌返回给前端
        res.status(200).json({ token: guacamoleToken });

    } catch (error: any) {
        console.error(`Controller: 获取 RDP 会话令牌时发生错误 (ID: ${req.params.id}):`, error);

        let statusCode = 500;
        let message = '获取 RDP 会话令牌时发生内部服务器错误。';

        if (axios.isAxiosError(error)) {
            message = '调用 RDP 后端服务时出错。';
            if (error.response) {
                // RDP 后端返回了错误响应
                console.error('[Controller:getRdpSessionToken] RDP backend error response:', error.response.data);
                message += ` (状态: ${error.response.status})`;
                statusCode = error.response.status >= 500 ? 502 : 400; // Bad Gateway or Bad Request
            } else if (error.request) {
                // 请求已发出但没有收到响应 (网络问题、超时)
                 console.error('[Controller:getRdpSessionToken] No response from RDP backend.');
                 message += ' (无法连接或超时)';
                 statusCode = 504; // Gateway Timeout
            } else {
                // 设置请求时发生错误
                console.error('[Controller:getRdpSessionToken] Axios request setup error:', error.message);
            }
        } else if (error.message.includes('解密失败')) {
             message = '获取 RDP 会话令牌时发生内部错误（凭证处理失败）。';
        }

        res.status(statusCode).json({ message });
    }
};
