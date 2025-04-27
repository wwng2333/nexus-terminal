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
    // Repository now returns ConnectionWithTags including 'type'
    // Explicit type assertion to ensure compatibility
    return ConnectionRepository.findAllConnectionsWithTags() as Promise<ConnectionWithTags[]>;
};

/**
 * 根据 ID 获取单个连接（包含标签）
 */
export const getConnectionById = async (id: number): Promise<ConnectionWithTags | null> => {
    // Repository now returns ConnectionWithTags including 'type'
    // Explicit type assertion to ensure compatibility
    return ConnectionRepository.findConnectionByIdWithTags(id) as Promise<ConnectionWithTags | null>;
};

/**
 * 创建新连接
 */
export const createConnection = async (input: CreateConnectionInput): Promise<ConnectionWithTags> => {
    console.log('[Service:createConnection] Received input:', JSON.stringify(input, null, 2)); // Log input
    // 1. 验证输入 (包含 type)
    // Convert type to uppercase for validation and consistency
    const connectionType = input.type?.toUpperCase() as 'SSH' | 'RDP' | undefined; // Ensure type safety
    if (!connectionType || !['SSH', 'RDP'].includes(connectionType)) {
        throw new Error('必须提供有效的连接类型 (SSH 或 RDP)。');
    }
    if (!input.host || !input.username) {
        throw new Error('缺少必要的连接信息 (host, username)。');
    }
    // Type-specific validation using the uppercase version
    if (connectionType === 'SSH') {
        if (!input.auth_method || !['password', 'key'].includes(input.auth_method)) {
             throw new Error('SSH 连接必须提供有效的认证方式 (password 或 key)。');
        }
        if (input.auth_method === 'password' && !input.password) {
            throw new Error('SSH 密码认证方式需要提供 password。');
        }
        if (input.auth_method === 'key' && !input.private_key) {
            throw new Error('SSH 密钥认证方式需要提供 private_key。');
        }
    } else if (connectionType === 'RDP') {
        if (!input.password) {
             throw new Error('RDP 连接需要提供 password。');
        }
        // For RDP, we'll ignore auth_method, private_key, passphrase from input if provided
    }

    // 2. 加密凭证 (根据 type)
    let encryptedPassword = null;
    let encryptedPrivateKey = null;
    let encryptedPassphrase = null;
    // Default to 'password' for DB compatibility, especially for RDP
    let authMethodForDb: 'password' | 'key' = 'password';

    if (connectionType === 'SSH') {
        authMethodForDb = input.auth_method!; // Already validated above
        if (input.auth_method === 'password') {
            encryptedPassword = encrypt(input.password!);
        } else { // key
            encryptedPrivateKey = encrypt(input.private_key!);
            if (input.passphrase) {
                encryptedPassphrase = encrypt(input.passphrase);
            }
        }
    } else { // RDP (connectionType is 'RDP')
        encryptedPassword = encrypt(input.password!);
        // authMethodForDb remains 'password' for RDP to satisfy DB constraint
        // Ensure SSH specific fields are null for RDP
        encryptedPrivateKey = null;
        encryptedPassphrase = null;
    }

    // 3. 准备仓库数据
    const defaultPort = input.type === 'RDP' ? 3389 : 22;
    // Explicitly type the object being passed to the repository
    const connectionData: Omit<ConnectionRepository.FullConnectionData, 'id' | 'created_at' | 'updated_at' | 'last_connected_at' | 'tag_ids'> = {
        name: input.name || '',
        type: connectionType, // Use the validated uppercase type
        host: input.host,
        port: input.port ?? defaultPort, // Use type-specific default port
        username: input.username,
        auth_method: authMethodForDb, // Use determined auth method
        encrypted_password: encryptedPassword,
        encrypted_private_key: encryptedPrivateKey, // Will be null for RDP
        encrypted_passphrase: encryptedPassphrase, // Will be null for RDP
        proxy_id: input.proxy_id ?? null,
    };
    console.log('[Service:createConnection] Data to be saved:', JSON.stringify(connectionData, null, 2)); // Log data before saving

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
    auditLogService.logAction('CONNECTION_CREATED', { connectionId: newConnection.id, type: newConnection.type, name: newConnection.name, host: newConnection.host }); // Add type to audit log

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
    // Explicitly type dataToUpdate to match the repository's expected input
    const dataToUpdate: Partial<Omit<ConnectionRepository.FullConnectionData, 'id' | 'created_at' | 'last_connected_at' | 'tag_ids'>> = {};
    let needsCredentialUpdate = false;
    // Determine the final type, converting input type to uppercase if provided
    const targetType = input.type?.toUpperCase() as 'SSH' | 'RDP' | undefined || currentFullConnection.type;

    // 更新非凭证字段
    if (input.name !== undefined) dataToUpdate.name = input.name || '';
    // Update type if changed, using the uppercase version
    if (input.type !== undefined && targetType !== currentFullConnection.type) dataToUpdate.type = targetType;
    if (input.host !== undefined) dataToUpdate.host = input.host;
    if (input.port !== undefined) dataToUpdate.port = input.port;
    if (input.username !== undefined) dataToUpdate.username = input.username;
    if (input.proxy_id !== undefined) dataToUpdate.proxy_id = input.proxy_id;

    // 处理认证方法更改或凭证更新 (根据 targetType)
    // Use the validated targetType for logic
    if (targetType === 'SSH') {
        const currentAuthMethod = currentFullConnection.auth_method;
        const inputAuthMethod = input.auth_method;

        // Determine the final auth method for SSH
        const finalAuthMethod = inputAuthMethod || currentAuthMethod;
        if (finalAuthMethod !== currentAuthMethod) {
             dataToUpdate.auth_method = finalAuthMethod; // Update auth_method if it changed
        }

        if (finalAuthMethod === 'password') {
            // If switching to password or updating password
            if (input.password !== undefined) { // Check if password was provided in input
                 if (!input.password && finalAuthMethod !== currentAuthMethod) {
                     // Switching to password requires a password
                     throw new Error('切换到密码认证时需要提供 password。');
                 }
                 // Encrypt if password is not empty, otherwise set to null (to clear)
                 dataToUpdate.encrypted_password = input.password ? encrypt(input.password) : null;
                 needsCredentialUpdate = true;
            }
            // When switching to password, clear key fields
            if (finalAuthMethod !== currentAuthMethod) {
                dataToUpdate.encrypted_private_key = null;
                dataToUpdate.encrypted_passphrase = null;
            }
        } else { // finalAuthMethod is 'key'
            let keyUpdated = false;
            // If switching to key or updating key
            if (input.private_key !== undefined) {
                 if (!input.private_key && finalAuthMethod !== currentAuthMethod) {
                     // Switching to key requires a private key
                     throw new Error('切换到密钥认证时需要提供 private_key。');
                 }
                 // Encrypt if key is not empty, otherwise set to null (to clear)
                 dataToUpdate.encrypted_private_key = input.private_key ? encrypt(input.private_key) : null;
                 needsCredentialUpdate = true;
                 keyUpdated = true;
            }
            // Update passphrase only if key was updated OR passphrase itself was provided
            if (keyUpdated || input.passphrase !== undefined) {
                 // Encrypt if passphrase is not empty, otherwise set to null (to clear)
                 dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
                 needsCredentialUpdate = true; // Consider passphrase change a credential update
            }
             // When switching to key, clear password field
            if (finalAuthMethod !== currentAuthMethod) {
                dataToUpdate.encrypted_password = null;
            }
        }
    } else { // targetType is 'RDP'
        // RDP only uses password
        if (input.password !== undefined) { // Check if password was provided
             // Encrypt if password is not empty, otherwise set to null (to clear)
             dataToUpdate.encrypted_password = input.password ? encrypt(input.password) : null;
             needsCredentialUpdate = true;
        }
        // Ensure SSH specific fields are nullified if switching to RDP or updating RDP
        if (targetType !== currentFullConnection.type || needsCredentialUpdate) {
            dataToUpdate.auth_method = 'password'; // RDP uses password auth method in DB
            dataToUpdate.encrypted_private_key = null;
            dataToUpdate.encrypted_passphrase = null;
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
         // Add type to audit log if it was updated
         const auditDetails: any = { connectionId: id, updatedFields: updatedFieldsForAudit };
         if (dataToUpdate.type) {
             auditDetails.newType = dataToUpdate.type;
         }
         auditLogService.logAction('CONNECTION_UPDATED', auditDetails);
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
