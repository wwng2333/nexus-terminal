import * as ConnectionRepository from '../repositories/connection.repository';
import { encrypt, decrypt } from '../utils/crypto';

// Re-export or define types needed by the controller/service
// Ideally, these would be in a shared types file, e.g., packages/backend/src/types/connection.types.ts
// For now, let's reuse the interfaces from the repository (adjust as needed)
export interface ConnectionBase {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    proxy_id: number | null;
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

export interface ConnectionWithTags extends ConnectionBase {
    tag_ids: number[];
}

// Input type for creating a connection (from controller)
export interface CreateConnectionInput {
    name: string;
    host: string;
    port?: number; // Optional, defaults in service/repo
    username: string;
    auth_method: 'password' | 'key';
    password?: string; // Optional depending on auth_method
    private_key?: string; // Optional depending on auth_method
    passphrase?: string; // Optional for key auth
    proxy_id?: number | null;
    tag_ids?: number[];
}

// Input type for updating a connection (from controller)
// All fields are optional except potentially auth_method related ones
export interface UpdateConnectionInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_method?: 'password' | 'key';
    password?: string;
    private_key?: string;
    passphrase?: string; // Use undefined to signal no change, null/empty string to clear
    proxy_id?: number | null;
    tag_ids?: number[];
}


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
    // 1. Validate input (basic validation, more complex validation can be added)
    if (!input.name || !input.host || !input.username || !input.auth_method) {
        throw new Error('缺少必要的连接信息 (name, host, username, auth_method)。');
    }
    if (input.auth_method === 'password' && !input.password) {
        throw new Error('密码认证方式需要提供 password。');
    }
    if (input.auth_method === 'key' && !input.private_key) {
        throw new Error('密钥认证方式需要提供 private_key。');
    }
    // Add more validation as needed (port range, proxy existence etc.)

    // 2. Encrypt credentials
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

    // 3. Prepare data for repository
    const connectionData = {
        name: input.name,
        host: input.host,
        port: input.port ?? 22, // Default port
        username: input.username,
        auth_method: input.auth_method,
        encrypted_password: encryptedPassword,
        encrypted_private_key: encryptedPrivateKey,
        encrypted_passphrase: encryptedPassphrase,
        proxy_id: input.proxy_id ?? null,
    };

    // 4. Create connection record in repository
    const newConnectionId = await ConnectionRepository.createConnection(connectionData);

    // 5. Handle tags
    const tagIds = input.tag_ids?.filter(id => typeof id === 'number' && id > 0) ?? [];
    if (tagIds.length > 0) {
        await ConnectionRepository.updateConnectionTags(newConnectionId, tagIds);
    }

    // 6. Fetch and return the newly created connection with tags
    const newConnection = await getConnectionById(newConnectionId);
    if (!newConnection) {
        // This should ideally not happen if creation was successful
        throw new Error('创建连接后无法检索到该连接。');
    }
    return newConnection;
};

/**
 * 更新连接信息
 */
export const updateConnection = async (id: number, input: UpdateConnectionInput): Promise<ConnectionWithTags | null> => {
    // 1. Fetch current connection data (including encrypted fields) to compare
    const currentFullConnection = await ConnectionRepository.findFullConnectionById(id);
    if (!currentFullConnection) {
        return null; // Connection not found
    }

    // 2. Prepare data for update
    const dataToUpdate: Partial<ConnectionRepository.FullConnectionData> = {};
    let needsCredentialUpdate = false;
    let newAuthMethod = input.auth_method || currentFullConnection.auth_method;

    // Update non-credential fields
    if (input.name !== undefined) dataToUpdate.name = input.name;
    if (input.host !== undefined) dataToUpdate.host = input.host;
    if (input.port !== undefined) dataToUpdate.port = input.port;
    if (input.username !== undefined) dataToUpdate.username = input.username;
    if (input.proxy_id !== undefined) dataToUpdate.proxy_id = input.proxy_id; // Allows setting to null

    // Handle auth method change or credential update
    if (input.auth_method && input.auth_method !== currentFullConnection.auth_method) {
        // Auth method changed
        dataToUpdate.auth_method = input.auth_method;
        needsCredentialUpdate = true;
        if (input.auth_method === 'password') {
            if (!input.password) throw new Error('切换到密码认证时需要提供 password。');
            dataToUpdate.encrypted_password = encrypt(input.password);
            dataToUpdate.encrypted_private_key = null;
            dataToUpdate.encrypted_passphrase = null;
        } else { // key
            if (!input.private_key) throw new Error('切换到密钥认证时需要提供 private_key。');
            dataToUpdate.encrypted_private_key = encrypt(input.private_key);
            dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
            dataToUpdate.encrypted_password = null;
        }
    } else {
        // Auth method did not change, check if credentials for the current method were provided
        if (newAuthMethod === 'password' && input.password !== undefined) {
            dataToUpdate.encrypted_password = encrypt(input.password);
            needsCredentialUpdate = true;
        } else if (newAuthMethod === 'key') {
            if (input.private_key !== undefined) {
                dataToUpdate.encrypted_private_key = encrypt(input.private_key);
                // Passphrase must be updated (or cleared) if private key is updated
                dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
                needsCredentialUpdate = true;
            } else if (input.passphrase !== undefined) { // Only passphrase provided
                dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
                needsCredentialUpdate = true;
            }
        }
    }

    // 3. Update connection record if there are changes
    const hasNonTagChanges = Object.keys(dataToUpdate).length > 0;
    if (hasNonTagChanges) {
        const updated = await ConnectionRepository.updateConnection(id, dataToUpdate);
        if (!updated) {
            // Should not happen if findFullConnectionById succeeded, but good practice
            throw new Error('更新连接记录失败。');
        }
    }

    // 4. Handle tags update if tag_ids were provided
    if (input.tag_ids !== undefined) {
        const validTagIds = input.tag_ids.filter(tagId => typeof tagId === 'number' && tagId > 0);
        await ConnectionRepository.updateConnectionTags(id, validTagIds);
    }

    // 5. Fetch and return the updated connection
    return getConnectionById(id);
};


/**
 * 删除连接
 */
export const deleteConnection = async (id: number): Promise<boolean> => {
    return ConnectionRepository.deleteConnection(id);
};

// Note: testConnection, importConnections, exportConnections logic
// will be moved to SshService and ImportExportService respectively.
