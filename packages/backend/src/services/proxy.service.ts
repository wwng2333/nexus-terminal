import * as ProxyRepository from '../repositories/proxy.repository';
import { encrypt, decrypt } from '../utils/crypto'; // Assuming crypto utils are needed

// Re-export or define types (ideally from a shared types file)
export interface ProxyData extends ProxyRepository.ProxyData {}

// Input type for creating a proxy
export interface CreateProxyInput {
    name: string;
    type: 'SOCKS5' | 'HTTP';
    host: string;
    port: number;
    username?: string | null;
    auth_method?: 'none' | 'password' | 'key'; // Optional, defaults to 'none'
    password?: string | null; // Plain text password
    private_key?: string | null; // Plain text private key
    passphrase?: string | null; // Plain text passphrase
}

// Input type for updating a proxy
export interface UpdateProxyInput {
    name?: string;
    type?: 'SOCKS5' | 'HTTP';
    host?: string;
    port?: number;
    username?: string | null;
    auth_method?: 'none' | 'password' | 'key';
    password?: string | null; // Use undefined for no change, null/empty to clear
    private_key?: string | null; // Use undefined for no change, null/empty to clear
    passphrase?: string | null; // Use undefined for no change, null/empty to clear
}


/**
 * 获取所有代理
 */
export const getAllProxies = async (): Promise<ProxyData[]> => {
    // Repository returns data with encrypted fields, which is fine for listing generally
    // If decryption is needed for display, it should happen closer to the presentation layer or selectively
    return ProxyRepository.findAllProxies();
};

/**
 * 根据 ID 获取单个代理
 */
export const getProxyById = async (id: number): Promise<ProxyData | null> => {
    // Repository returns data with encrypted fields
    return ProxyRepository.findProxyById(id);
};

/**
 * 创建新代理
 */
export const createProxy = async (input: CreateProxyInput): Promise<ProxyData> => {
    // 1. Validate input
    if (!input.name || !input.type || !input.host || !input.port) {
        throw new Error('缺少必要的代理信息 (name, type, host, port)。');
    }
    if (input.auth_method === 'password' && !input.password) {
        throw new Error('代理密码认证方式需要提供 password。');
    }
     if (input.auth_method === 'key' && !input.private_key) {
         throw new Error('代理密钥认证方式需要提供 private_key。');
     }
    // Add more validation (port range, type check etc.)

    // 2. Encrypt credentials if provided
    const encryptedPassword = input.password ? encrypt(input.password) : null;
    const encryptedPrivateKey = input.private_key ? encrypt(input.private_key) : null;
    const encryptedPassphrase = input.passphrase ? encrypt(input.passphrase) : null;

    // 3. Prepare data for repository
    const proxyData: Omit<ProxyData, 'id' | 'created_at' | 'updated_at'> = {
        name: input.name,
        type: input.type,
        host: input.host,
        port: input.port,
        username: input.username || null,
        auth_method: input.auth_method || 'none',
        encrypted_password: encryptedPassword,
        encrypted_private_key: encryptedPrivateKey,
        encrypted_passphrase: encryptedPassphrase,
    };

    // 4. Create proxy record
    const newProxyId = await ProxyRepository.createProxy(proxyData);

    // 5. Fetch and return the newly created proxy
    const newProxy = await getProxyById(newProxyId);
    if (!newProxy) {
        throw new Error('创建代理后无法检索到该代理。');
    }
    return newProxy;
};

/**
 * 更新代理信息
 */
export const updateProxy = async (id: number, input: UpdateProxyInput): Promise<ProxyData | null> => {
    // 1. Fetch current proxy data to compare if needed (e.g., for auth method change logic)
    const currentProxy = await ProxyRepository.findProxyById(id);
    if (!currentProxy) {
        return null; // Proxy not found
    }

    // 2. Prepare data for update
    const dataToUpdate: Partial<Omit<ProxyData, 'id' | 'created_at'>> = {};
    let needsCredentialUpdate = false;
    const newAuthMethod = input.auth_method || currentProxy.auth_method;

    // Update standard fields
    if (input.name !== undefined) dataToUpdate.name = input.name;
    if (input.type !== undefined) dataToUpdate.type = input.type;
    if (input.host !== undefined) dataToUpdate.host = input.host;
    if (input.port !== undefined) dataToUpdate.port = input.port;
    if (input.username !== undefined) dataToUpdate.username = input.username; // Allows clearing

    // Handle auth method change or credential update
    if (input.auth_method && input.auth_method !== currentProxy.auth_method) {
        dataToUpdate.auth_method = input.auth_method;
        needsCredentialUpdate = true;
        // Encrypt new credentials based on the *new* auth_method
        if (input.auth_method === 'password') {
             if (input.password === undefined) throw new Error('切换到密码认证时需要提供 password。');
             dataToUpdate.encrypted_password = input.password ? encrypt(input.password) : null;
             dataToUpdate.encrypted_private_key = null; // Clear old key info
             dataToUpdate.encrypted_passphrase = null;
        } else if (input.auth_method === 'key') {
             if (input.private_key === undefined) throw new Error('切换到密钥认证时需要提供 private_key。');
             dataToUpdate.encrypted_private_key = input.private_key ? encrypt(input.private_key) : null;
             dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
             dataToUpdate.encrypted_password = null; // Clear old password info
        } else { // 'none'
             dataToUpdate.encrypted_password = null;
             dataToUpdate.encrypted_private_key = null;
             dataToUpdate.encrypted_passphrase = null;
        }
    } else {
        // Auth method unchanged, update credentials if provided for the current method
        if (newAuthMethod === 'password' && input.password !== undefined) {
            dataToUpdate.encrypted_password = input.password ? encrypt(input.password) : null;
            needsCredentialUpdate = true;
        } else if (newAuthMethod === 'key') {
            if (input.private_key !== undefined) {
                dataToUpdate.encrypted_private_key = input.private_key ? encrypt(input.private_key) : null;
                dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null; // Update passphrase together
                needsCredentialUpdate = true;
            } else if (input.passphrase !== undefined) { // Only passphrase updated
                dataToUpdate.encrypted_passphrase = input.passphrase ? encrypt(input.passphrase) : null;
                needsCredentialUpdate = true;
            }
        }
    }

     // 3. Update proxy record if there are changes
     const hasChanges = Object.keys(dataToUpdate).length > 0;
     if (hasChanges) {
         const updated = await ProxyRepository.updateProxy(id, dataToUpdate);
         if (!updated) {
             throw new Error('更新代理记录失败。');
         }
     }

    // 4. Fetch and return the updated proxy
    return getProxyById(id);
};

/**
 * 删除代理
 */
export const deleteProxy = async (id: number): Promise<boolean> => {
    // Repository handles setting foreign keys to NULL in connections table
    return ProxyRepository.deleteProxy(id);
};
