import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { SocksClient, SocksClientOptions } from 'socks';
import http from 'http';
import net from 'net';
import * as ConnectionRepository from '../repositories/connection.repository';
import { decrypt } from '../utils/crypto';

const CONNECT_TIMEOUT = 20000; // 连接超时时间 (毫秒)
const TEST_TIMEOUT = 15000; // 测试连接超时时间 (毫秒)

// 辅助接口：定义解密后的凭证和代理信息结构 (导出以便 websocket.ts 使用)
export interface DecryptedConnectionDetails {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    password?: string; // Decrypted
    privateKey?: string; // Decrypted
    passphrase?: string; // Decrypted
    proxy?: {
        id: number;
        name: string;
        type: 'SOCKS5' | 'HTTP';
        host: string;
        port: number;
        username?: string;
        password?: string; // Decrypted
        // auth_method?: string; // Proxy auth method (如果需要可以保留)
        // privateKey?: string; // Decrypted proxy key (如果需要可以保留)
        // passphrase?: string; // Decrypted proxy passphrase (如果需要可以保留)
    } | null;
}

/**
 * 获取并解密指定 ID 的完整连接信息（包括代理）
 * @param connectionId 连接 ID
 * @returns Promise<DecryptedConnectionDetails> 解密后的连接详情
 * @throws Error 如果连接配置未找到或解密失败
 */
export const getConnectionDetails = async (connectionId: number): Promise<DecryptedConnectionDetails> => {
    console.log(`SshService: 获取连接 ${connectionId} 的详细信息...`);
    const rawConnInfo = await ConnectionRepository.findFullConnectionById(connectionId);
    if (!rawConnInfo) {
        throw new Error(`连接配置 ID ${connectionId} 未找到。`);
    }

    try {
        const fullConnInfo: DecryptedConnectionDetails = {
            id: rawConnInfo.id,
            // Add null check for required fields from rawConnInfo
            name: rawConnInfo.name ?? (() => { throw new Error(`Connection ID ${connectionId} has null name.`); })(),
            host: rawConnInfo.host ?? (() => { throw new Error(`Connection ID ${connectionId} has null host.`); })(),
            port: rawConnInfo.port ?? (() => { throw new Error(`Connection ID ${connectionId} has null port.`); })(),
            username: rawConnInfo.username ?? (() => { throw new Error(`Connection ID ${connectionId} has null username.`); })(),
            auth_method: rawConnInfo.auth_method ?? (() => { throw new Error(`Connection ID ${connectionId} has null auth_method.`); })(),
            password: (rawConnInfo.auth_method === 'password' && rawConnInfo.encrypted_password) ? decrypt(rawConnInfo.encrypted_password) : undefined,
            privateKey: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_private_key) ? decrypt(rawConnInfo.encrypted_private_key) : undefined,
            passphrase: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_passphrase) ? decrypt(rawConnInfo.encrypted_passphrase) : undefined,
            proxy: null,
        };

        if (rawConnInfo.proxy_db_id) {
             // Add null checks for required proxy fields inside the if block
             const proxyName = rawConnInfo.proxy_name ?? (() => { throw new Error(`Proxy for Connection ID ${connectionId} has null name.`); })();
             const proxyType = rawConnInfo.proxy_type ?? (() => { throw new Error(`Proxy for Connection ID ${connectionId} has null type.`); })();
             const proxyHost = rawConnInfo.proxy_host ?? (() => { throw new Error(`Proxy for Connection ID ${connectionId} has null host.`); })();
             const proxyPort = rawConnInfo.proxy_port ?? (() => { throw new Error(`Proxy for Connection ID ${connectionId} has null port.`); })();

             // Ensure proxyType is one of the allowed values
             if (proxyType !== 'SOCKS5' && proxyType !== 'HTTP') {
                throw new Error(`Proxy for Connection ID ${connectionId} has invalid type: ${proxyType}`);
             }

            fullConnInfo.proxy = {
                id: rawConnInfo.proxy_db_id, // Already checked by the if condition
                name: proxyName,
                type: proxyType, // Already validated
                host: proxyHost,
                port: proxyPort,
                username: rawConnInfo.proxy_username || undefined, // Optional, defaults to undefined
                password: rawConnInfo.proxy_encrypted_password ? decrypt(rawConnInfo.proxy_encrypted_password) : undefined, // Optional, handled by decrypt logic
                // 可以根据需要解密代理的其他凭证
            };
        }
        console.log(`SshService: 连接 ${connectionId} 的详细信息获取并解密成功。`);
        return fullConnInfo;
    } catch (decryptError: any) {
        console.error(`SshService: 处理连接 ${connectionId} 凭证或代理凭证失败:`, decryptError);
        throw new Error(`处理凭证失败: ${decryptError.message}`);
    }
};

/**
 * 根据解密后的连接详情建立 SSH 连接（处理代理）
 * @param connDetails - 解密后的连接详情
 * @param timeout - 连接超时时间 (毫秒)，可选
 * @returns Promise<Client> 连接成功的 SSH Client 实例
 * @throws Error 如果连接失败
 */
export const establishSshConnection = (
    connDetails: DecryptedConnectionDetails,
    timeout: number = CONNECT_TIMEOUT
): Promise<Client> => {
    return new Promise((resolve, reject) => {
        const sshClient = new Client();

        const connectConfig: ConnectConfig = {
            host: connDetails.host,
            port: connDetails.port,
            username: connDetails.username,
            password: connDetails.password,
            privateKey: connDetails.privateKey,
            passphrase: connDetails.passphrase,
            readyTimeout: timeout,
            keepaliveInterval: 10000, // 保持连接
            keepaliveCountMax: 10,
        };

        const readyHandler = () => {
            console.log(`SshService: SSH 连接到 ${connDetails.host}:${connDetails.port} (ID: ${connDetails.id}) 成功。`);
            sshClient.removeListener('error', errorHandler); // 成功后移除错误监听器
            resolve(sshClient); // 返回 Client 实例
        };

        const errorHandler = (err: Error) => {
            console.error(`SshService: SSH 连接到 ${connDetails.host}:${connDetails.port} (ID: ${connDetails.id}) 失败:`, err);
            sshClient.removeListener('ready', readyHandler); // 失败后移除成功监听器
            sshClient.end(); // 确保关闭客户端
            reject(err);
        };

        sshClient.once('ready', readyHandler);
        sshClient.once('error', errorHandler);

        // --- 处理代理 ---
        if (connDetails.proxy) {
            const proxy = connDetails.proxy;
            console.log(`SshService: 应用代理 ${proxy.name} (${proxy.type}) 连接到 ${connDetails.host}:${connDetails.port}`);
            if (proxy.type === 'SOCKS5') {
                const socksOptions: SocksClientOptions = {
                    proxy: { host: proxy.host, port: proxy.port, type: 5, userId: proxy.username, password: proxy.password },
                    command: 'connect',
                    destination: { host: connectConfig.host!, port: connectConfig.port! },
                    timeout: connectConfig.readyTimeout,
                };
                SocksClient.createConnection(socksOptions)
                    .then(({ socket }) => {
                        console.log(`SshService: SOCKS5 代理连接成功 (目标: ${connDetails.host}:${connDetails.port})。`);
                        connectConfig.sock = socket;
                        sshClient.connect(connectConfig);
                    })
                    .catch(socksError => {
                        errorHandler(new Error(`SOCKS5 代理 ${proxy.host}:${proxy.port} 连接失败: ${socksError.message}`));
                    });

            } else if (proxy.type === 'HTTP') {
                console.log(`SshService: 尝试通过 HTTP 代理 ${proxy.host}:${proxy.port} 建立隧道到 ${connDetails.host}:${connDetails.port}...`);
                const reqOptions: http.RequestOptions = {
                    method: 'CONNECT',
                    host: proxy.host,
                    port: proxy.port,
                    path: `${connectConfig.host}:${connectConfig.port}`,
                    timeout: connectConfig.readyTimeout,
                    agent: false
                };
                if (proxy.username) {
                    const auth = 'Basic ' + Buffer.from(proxy.username + ':' + (proxy.password || '')).toString('base64');
                    reqOptions.headers = { ...reqOptions.headers, 'Proxy-Authorization': auth, 'Proxy-Connection': 'Keep-Alive', 'Host': `${connectConfig.host}:${connectConfig.port}` };
                }
                const req = http.request(reqOptions);
                req.on('connect', (res, socket, head) => {
                    if (res.statusCode === 200) {
                        console.log(`SshService: HTTP 代理隧道建立成功 (目标: ${connDetails.host}:${connDetails.port})。`);
                        connectConfig.sock = socket;
                        sshClient.connect(connectConfig);
                    } else {
                        socket.destroy();
                        errorHandler(new Error(`HTTP 代理 ${proxy.host}:${proxy.port} 连接失败 (状态码: ${res.statusCode})`));
                    }
                });
                req.on('error', (err) => {
                    errorHandler(new Error(`HTTP 代理 ${proxy.host}:${proxy.port} 请求错误: ${err.message}`));
                });
                req.on('timeout', () => {
                    req.destroy();
                    errorHandler(new Error(`HTTP 代理 ${proxy.host}:${proxy.port} 连接超时`));
                });
                req.end();
            } else {
                errorHandler(new Error(`不支持的代理类型: ${proxy.type}`));
            }
        } else {
            // 无代理，直接连接
            console.log(`SshService: 无代理，直接连接到 ${connDetails.host}:${connDetails.port}`);
            sshClient.connect(connectConfig);
        }
    });
};

/**
 * 在已连接的 SSH Client 上打开 Shell 通道
 * @param sshClient - 已连接的 SSH Client 实例
 * @returns Promise<ClientChannel> Shell 通道实例
 * @throws Error 如果打开 Shell 失败
 */
export const openShell = (sshClient: Client): Promise<ClientChannel> => {
    return new Promise((resolve, reject) => {
        sshClient.shell((err, stream) => {
            if (err) {
                console.error(`SshService: 打开 Shell 失败:`, err);
                return reject(new Error(`打开 Shell 失败: ${err.message}`));
            }
            console.log(`SshService: Shell 通道已打开。`);
            resolve(stream);
        });
    });
};

/**
 * 测试给定 ID 的 SSH 连接（包括代理）
 * @param connectionId 连接 ID
 * @returns Promise<void> - 如果连接成功则 resolve，否则 reject
 * @throws Error 如果连接失败或配置错误
 */
export const testConnection = async (connectionId: number): Promise<void> => {
    console.log(`SshService: 测试连接 ${connectionId}...`);
    let sshClient: Client | null = null;
    try {
        // 1. 获取并解密连接信息
        const connDetails = await getConnectionDetails(connectionId);

        // 2. 尝试建立连接 (使用较短的测试超时时间)
        sshClient = await establishSshConnection(connDetails, TEST_TIMEOUT);

        console.log(`SshService: 测试连接 ${connectionId} 成功。`);
        // 测试成功，Promise 自动 resolve void
    } catch (error) {
        console.error(`SshService: 测试连接 ${connectionId} 失败:`, error);
        throw error; // 将错误向上抛出
    } finally {
        // 无论成功失败，都关闭 SSH 客户端
        if (sshClient) {
            sshClient.end();
            console.log(`SshService: 测试连接 ${connectionId} 的客户端已关闭。`);
        }
    }
};

// --- 移除旧的函数 ---
// - connectAndOpenShell
// - sendInput
// - resizeTerminal
// - cleanupConnection
// - activeSessions Map
// - AuthenticatedWebSocket interface (如果仅在此文件使用)
