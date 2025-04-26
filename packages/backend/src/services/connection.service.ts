import * as ConnectionRepository from '../repositories/connection.repository';
import { encrypt, decrypt } from '../utils/crypto';
import { AuditLogService } from '../services/audit.service';
import {
    ConnectionBase,
    ConnectionWithTags,
    CreateConnectionInput,
    UpdateConnectionInput,
    FullConnectionData
} from '../types/connection.types'; // 从集中类型文件导入

export type { ConnectionBase, ConnectionWithTags, CreateConnectionInput, UpdateConnectionInput };


const auditLogService = new AuditLogService(); // 实例化 AuditLogService

/**
 * 获取所有连接（包含标签）
 */
export const getAllConnections = async (): Promise<ConnectionWithTags[]> => {
    return ConnectionRepository.findAllConnectionsWithTags();
};

/**
 * 根据 ID 获取单个连接（包含标签）
 */
export const getConnectionById = async (id: number): Promise<ConnectionWithTags | null> => {
    return ConnectionRepository.findConnectionByIdWithTags(id);
};

/**
 * 创建新连接
 */
export const createConnection = async (input: CreateConnectionInput): Promise<ConnectionWithTags> => {
    // 1. 验证输入
    if (!input.host || !input.username || !input.auth_method) {
        throw new Error('缺少必要的连接信息 (host, username, auth_method)。');
    }
    if (input.auth_method === 'password' && !input.password) {
        throw new Error('密码认证方式需要提供 password。');
    }
    if (input.auth_method === 'key' && !input.private_key) {
        throw new Error('密钥认证方式需要提供 private_key。');
    }

    // 2. 加密凭证
    let encryptedPassword = null;
    let encryptedPrivateKey = null;
    let encryptedPassphrase = null;

    if (input.auth_method === 'password') {
        encryptedPassword = encrypt(input.password!);
    } else if (input.auth_method === 'key') {
        encryptedPrivateKey = encrypt(input.private_key!);
        if (input.passphrase) {
            encryptedPassphrase = encrypt(input.passphrase);
        }
    }

    // 3. 准备仓库数据
    const connectionData = {
        name: input.name || '', // 如果 name 为空或 undefined，则使用空字符串 ''
        host: input.host,
        port: input.port ?? 22, // 默认端口
        username: input.username,
        auth_method: input.auth_method,
        encrypted_password: encryptedPassword,
        encrypted_private_key: encryptedPrivateKey,
        encrypted_passphrase: encryptedPassphrase,
        proxy_id: input.proxy_id ?? null,
    };

    // 4. 在仓库中创建连接记录
    const newConnectionId = await ConnectionRepository.createConnection(connectionData);

    // 5. 处理标签
    const tagIds = input.tag_ids?.filter(id => typeof id === 'number' && id > 0) ?? [];
    if (tagIds.length > 0) {
        await ConnectionRepository.updateConnectionTags(newConnectionId, tagIds);
    }

    // 6. 记录审计操作
    const newConnection = await getConnectionById(newConnectionId);
    if (!newConnection) {
        // 如果创建成功，这理论上不应该发生
        console.error(`[Audit Log Error] Failed to retrieve connection ${newConnectionId} after creation.`);
        throw new Error('创建连接后无法检索到该连接。');
    }
    auditLogService.logAction('CONNECTION_CREATED', { connectionId: newConnection.id, name: newConnection.name, host: newConnection.host });

    // 7. 返回新创建的带标签的连接
    return newConnection;
};

/**
 * 更新连接信息
 */
export const updateConnection = async (id: number, input: UpdateConnectionInput): Promise<ConnectionWithTags | null> => {
    // 1. 获取当前连接数据（包括加密字段）以进行比较
    const currentFullConnection = await ConnectionRepository.findFullConnectionById(id);
    if (!currentFullConnection) {
        return null; // 未找到连接
    }

    // 2. 准备更新数据
    const dataToUpdate: Partial<ConnectionRepository.FullConnectionData> = {};
    let needsCredentialUpdate = false;
    let newAuthMethod = input.auth_method || currentFullConnection.auth_method;

    // 更新非凭证字段
    if (input.name !== undefined) dataToUpdate.name = input.name || ''; // 如果 name 是空字符串或 null/undefined，则使用空字符串 ''
    if (input.host !== undefined) dataToUpdate.host = input.host;
    if (input.port !== undefined) dataToUpdate.port = input.port;
    if (input.username !== undefined) dataToUpdate.username = input.username;
    if (input.proxy_id !== undefined) dataToUpdate.proxy_id = input.proxy_id; // 允许设置为 null

    // 处理认证方法更改或凭证更新
    if (input.auth_method && input.auth_method !== currentFullConnection.auth_method) {
        // 认证方法已更改
        dataToUpdate.auth_method = input.auth_method;
        needsCredentialUpdate = true;
        if (input.auth_method === 'password') {
            if (!input.password) throw new Error('切换到密码认证时需要提供 password。');
            dataToUpdate.encrypted_password = encrypt(input.password);
            dataToUpdate.encrypted_private_key = null;
            dataToUpdate.encrypted_passphrase = null;
        } else { // 密钥
            if (!input.private_key) throw new Error('切换到密钥认证时需要提供 private_key。');
            dataToUpdate.encrypted_private_key = encrypt(input.private_key);
            // 仅当密码短语为非空字符串时才加密
            dataToUpdate.encrypted_passphrase = (input.passphrase && input.passphrase.trim() !== '') ? encrypt(input.passphrase) : null;
            dataToUpdate.encrypted_password = null;
        }
    } else {
        // 认证方法未更改，检查是否提供了当前方法的凭证
        // 仅当提供了非空字符串时才加密和更新
        if (newAuthMethod === 'password' && input.password && input.password.trim() !== '') {
            dataToUpdate.encrypted_password = encrypt(input.password);
            needsCredentialUpdate = true;
        } else if (newAuthMethod === 'key') {
            let passphraseChanged = false;
            if (input.private_key && input.private_key.trim() !== '') {
                dataToUpdate.encrypted_private_key = encrypt(input.private_key);
                // 如果私钥更新，则必须更新（或清除）密码短语
                // 仅当非空时加密，否则设置为 null
                dataToUpdate.encrypted_passphrase = (input.passphrase && input.passphrase.trim() !== '') ? encrypt(input.passphrase) : null;
                needsCredentialUpdate = true;
                passphraseChanged = true; // 如果密钥更改，则将密码短语标记为已处理
            }
            // 处理仅更改密码短语（且密钥未更改）的情况
            // 检查 input.passphrase 是否已定义（可能是空字符串以清除）
            if (!passphraseChanged && input.passphrase !== undefined) {
                 // 仅当非空时加密，否则设置为 null
                dataToUpdate.encrypted_passphrase = (input.passphrase && input.passphrase.trim() !== '') ? encrypt(input.passphrase) : null;
                needsCredentialUpdate = true; // 将此视为凭证更新
            }
        }
    }

    // 3. 如果有更改，则更新连接记录
    const hasNonTagChanges = Object.keys(dataToUpdate).length > 0;
    let updatedFieldsForAudit: string[] = []; // 跟踪审计日志的字段
    if (hasNonTagChanges) {
        updatedFieldsForAudit = Object.keys(dataToUpdate); // 在更新调用之前获取字段
        const updated = await ConnectionRepository.updateConnection(id, dataToUpdate);
        if (!updated) {
            // 如果 findFullConnectionById 成功，则不应发生这种情况，但这是良好的实践
            throw new Error('更新连接记录失败。');
        }
    }

    // 4. 如果提供了 tag_ids，则处理标签更新
    if (input.tag_ids !== undefined) {
        const validTagIds = input.tag_ids.filter(tagId => typeof tagId === 'number' && tagId > 0);
        await ConnectionRepository.updateConnectionTags(id, validTagIds);
    }
    // 如果 tag_ids 已更新，则将其添加到审计日志
    if (input.tag_ids !== undefined) {
        updatedFieldsForAudit.push('tag_ids');
    }


    // 5. 如果进行了任何更改，则记录审计操作
    if (hasNonTagChanges || input.tag_ids !== undefined) {
         auditLogService.logAction('CONNECTION_UPDATED', { connectionId: id, updatedFields: updatedFieldsForAudit });
    }

    // 6. 获取并返回更新后的连接
    return getConnectionById(id);
};


/**
 * 删除连接
 */
export const deleteConnection = async (id: number): Promise<boolean> => {
    const deleted = await ConnectionRepository.deleteConnection(id);
    if (deleted) {
        // 删除成功后记录审计操作
        auditLogService.logAction('CONNECTION_DELETED', { connectionId: id });
    }
    return deleted;
};

// 注意：testConnection、importConnections、exportConnections 逻辑
// 将分别移至 SshService 和 ImportExportService。
