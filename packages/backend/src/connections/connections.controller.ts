import { Request, Response } from 'express';
// Removed duplicate import
import * as ConnectionService from '../services/connection.service';
import * as SshService from '../services/ssh.service'; // 引入 SshService
import * as ImportExportService from '../services/import-export.service'; // 引入 ImportExportService
import { AuditLogService } from '../services/audit.service'; // 引入 AuditLogService

const auditLogService = new AuditLogService(); // 实例化 AuditLogService

// --- 移除所有不再需要的导入和变量 ---
// import { Statement } from 'sqlite3';
// import { getDb } from '../database';
// const db = getDb();
// --- 清理结束 ---


/**
 * 创建新连接 (POST /api/v1/connections)
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        // 基本输入验证（更复杂的验证可以在服务层或使用中间件）
        const { name, host, username, auth_method, password, private_key } = req.body;
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

        // 将请求体传递给服务层处理
        const newConnection = await ConnectionService.createConnection(req.body);
        // 记录审计日志
        auditLogService.logAction('CONNECTION_CREATED', { connectionId: newConnection.id, name: newConnection.name, host: newConnection.host });
        res.status(201).json({ message: '连接创建成功。', connection: newConnection });

    } catch (error: any) {
        console.error('Controller: 创建连接时发生错误:', error);
        // 根据错误类型返回不同的状态码，例如验证错误返回 400
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

        // 基本验证（可选，服务层也会验证）
        const { auth_method, password, private_key } = req.body;
        if (auth_method && auth_method !== 'password' && auth_method !== 'key') {
             res.status(400).json({ message: '无效的认证方式 (auth_method)，必须是 "password" 或 "key"。' });
             return;
        }
        // 注意：服务层会处理更复杂的验证，比如切换认证方式时凭证是否提供

        const updatedConnection = await ConnectionService.updateConnection(connectionId, req.body);

        if (!updatedConnection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            // 记录审计日志
            auditLogService.logAction('CONNECTION_UPDATED', { connectionId, updatedFields: Object.keys(req.body) });
            res.status(200).json({ message: '连接更新成功。', connection: updatedConnection });
        }
    } catch (error: any) {
        console.error(`Controller: 更新连接 ${req.params.id} 时发生错误:`, error);
         // 根据错误类型返回不同的状态码
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
            // 记录审计日志
            auditLogService.logAction('CONNECTION_DELETED', { connectionId });
            res.status(200).json({ message: '连接删除成功。' }); // 或使用 204 No Content
        }
    } catch (error: any) {
        console.error(`Controller: 删除连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除连接时发生内部服务器错误。' });
    }
};

// --- TODO: 将以下逻辑迁移到 SshService ---
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

        // 调用 SshService 进行连接测试
        await SshService.testConnection(connectionId);

        // 如果 SshService.testConnection 没有抛出错误，则表示成功
        // 记录审计日志 (可选，看是否需要记录测试操作)
        // auditLogService.logAction('CONNECTION_TESTED', { connectionId, success: true });
        res.status(200).json({ success: true, message: '连接测试成功。' });

    } catch (error: any) {
        // 记录审计日志 (可选)
        // auditLogService.logAction('CONNECTION_TESTED', { connectionId, success: false, error: error.message });
        console.error(`Controller: 测试连接 ${req.params.id} 时发生错误:`, error);
        // SshService 会抛出包含具体原因的 Error
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};

// --- TODO: 将以下逻辑迁移到 ImportExportService ---
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
        // 记录审计日志 - 使用数组长度
        auditLogService.logAction('CONNECTIONS_EXPORTED', { count: exportedData.length });
        res.status(200).json(exportedData);

    } catch (error: any) {
        console.error('Controller: 导出连接时发生错误:', error);
        res.status(500).json({ message: error.message || '导出连接时发生内部服务器错误。' });
    }
};

// --- TODO: 将以下逻辑迁移到 ImportExportService (和 ProxyService) ---
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
            // Partial success or complete failure
             res.status(400).json({ // Use 400 for partial success with errors
                 message: `导入完成，但存在 ${result.failureCount} 个错误。成功导入 ${result.successCount} 条。`,
                 successCount: result.successCount,
                 failureCount: result.failureCount,
                 errors: result.errors
             });
        } else {
            // Complete success
            // 记录审计日志
            auditLogService.logAction('CONNECTIONS_IMPORTED', { successCount: result.successCount, failureCount: result.failureCount });
            res.status(200).json({
                message: `导入成功完成。共导入 ${result.successCount} 条连接。`,
                successCount: result.successCount,
                failureCount: 0
            });
        }
    } catch (error: any) {
        console.error('Controller: 导入连接时发生错误:', error);
        // Handle specific errors like JSON parsing error from service
        if (error.message.includes('解析 JSON 文件失败')) {
             res.status(400).json({ message: error.message });
        } else {
             res.status(500).json({ message: error.message || '导入连接时发生内部服务器错误。' });
        }
    }
    // No finally block needed here as db statements are handled in service/repo now
};
