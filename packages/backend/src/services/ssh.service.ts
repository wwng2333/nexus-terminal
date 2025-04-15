import { Client, ClientChannel, ConnectConfig } from 'ssh2'; // Import ClientChannel and ConnectConfig
import { SocksClient, SocksClientOptions } from 'socks'; // Import SocksClientOptions
import http from 'http';
import net from 'net';
import WebSocket from 'ws'; // Import WebSocket for type hint
import * as ConnectionRepository from '../repositories/connection.repository';
import { decrypt } from '../utils/crypto';
// Import SftpService if needed later for initialization
// import * as SftpService from './sftp.service';
// Import StatusMonitorService if needed later for initialization
// import * as StatusMonitorService from './status-monitor.service';


const CONNECT_TIMEOUT = 20000; // 连接超时时间 (毫秒)
const TEST_TIMEOUT = 15000; // 测试连接超时时间 (毫秒)

// Define AuthenticatedWebSocket interface (or import from websocket.ts if refactored there)
// This is needed to associate SSH clients with specific WS connections
interface AuthenticatedWebSocket extends WebSocket {
    isAlive?: boolean;
    userId?: number;
    username?: string;
    // sshClient?: Client; // Managed by the service now
    // sshShellStream?: ClientChannel; // Managed by the service now
}

// Structure to hold active SSH connection details managed by this service
interface ActiveSshSession {
    client: Client;
    shell: ClientChannel;
    // sftp?: SFTPWrapper; // SFTP will be managed by SftpService
    // statusIntervalId?: NodeJS.Timeout; // Status polling managed by StatusMonitorService
    connectionInfo: DecryptedConnectionDetails; // Store connection info for context (Fix typo)
}

// Map to store active sessions associated with WebSocket clients
const activeSessions = new Map<AuthenticatedWebSocket, ActiveSshSession>();


// 辅助接口：定义解密后的凭证和代理信息结构 (可以共享到 types 文件)
// Renamed to avoid conflict if imported later
interface DecryptedConnectionDetails {
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
        auth_method?: string; // Proxy auth method
        privateKey?: string; // Decrypted proxy key
        passphrase?: string; // Decrypted proxy passphrase
    } | null;
}

/**
 * 测试给定 ID 的 SSH 连接（包括代理）
 * @param connectionId 连接 ID
 * @returns Promise<void> - 如果连接成功则 resolve，否则 reject
 * @throws Error 如果连接失败或配置错误
 */
export const testConnection = async (connectionId: number): Promise<void> => {
    console.log(`SshService: Testing connection ${connectionId}...`);
    // 1. 获取完整的连接信息（包括加密凭证和代理信息）
    const rawConnInfo = await ConnectionRepository.findFullConnectionById(connectionId); // Assuming this fetches proxy details too
    if (!rawConnInfo) {
        throw new Error('连接配置未找到。');
    }

    // 2. 解密凭证并构建结构化的连接信息
    let fullConnInfo: DecryptedConnectionDetails;
    try {
        fullConnInfo = {
            id: rawConnInfo.id,
            name: rawConnInfo.name,
            host: rawConnInfo.host,
            port: rawConnInfo.port,
            username: rawConnInfo.username,
            auth_method: rawConnInfo.auth_method,
            password: (rawConnInfo.auth_method === 'password' && rawConnInfo.encrypted_password) ? decrypt(rawConnInfo.encrypted_password) : undefined,
            privateKey: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_private_key) ? decrypt(rawConnInfo.encrypted_private_key) : undefined,
            passphrase: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_passphrase) ? decrypt(rawConnInfo.encrypted_passphrase) : undefined,
            proxy: null,
        };

        if (rawConnInfo.proxy_db_id) {
            fullConnInfo.proxy = {
                id: rawConnInfo.proxy_db_id,
                name: rawConnInfo.proxy_name,
                type: rawConnInfo.proxy_type,
                host: rawConnInfo.proxy_host,
                port: rawConnInfo.proxy_port,
                username: rawConnInfo.proxy_username || undefined,
                auth_method: rawConnInfo.proxy_auth_method, // Include proxy auth method
                password: rawConnInfo.proxy_encrypted_password ? decrypt(rawConnInfo.proxy_encrypted_password) : undefined,
                privateKey: rawConnInfo.proxy_encrypted_private_key ? decrypt(rawConnInfo.proxy_encrypted_private_key) : undefined, // Decrypt proxy key
                passphrase: rawConnInfo.proxy_encrypted_passphrase ? decrypt(rawConnInfo.proxy_encrypted_passphrase) : undefined, // Decrypt proxy passphrase
            };
        }
    } catch (decryptError: any) {
        console.error(`Service: 处理连接 ${connectionId} 凭证或代理凭证失败:`, decryptError);
        throw new Error(`处理凭证失败: ${decryptError.message}`);
    }

    // 3. 构建 ssh2 连接配置
    const connectConfig: ConnectConfig = { // Use ConnectConfig type
        host: fullConnInfo.host,
        port: fullConnInfo.port,
        username: fullConnInfo.username,
        password: fullConnInfo.password,
        privateKey: fullConnInfo.privateKey,
        passphrase: fullConnInfo.passphrase,
        readyTimeout: TEST_TIMEOUT,
        keepaliveInterval: 0, // 测试连接不需要 keepalive
    };

    // 4. 应用代理配置并执行连接 (Refactored into helper)
    const sshClient = new Client();
    try {
        await establishSshConnection(sshClient, connectConfig, fullConnInfo.proxy); // Use helper
        console.log(`SshService: Test connection ${connectionId} successful.`);
        // Test successful, void promise resolves implicitly
    } catch (error) {
        console.error(`SshService: Test connection ${connectionId} failed:`, error);
        throw error; // Re-throw the specific error
    } finally {
         // 无论成功失败，都关闭 SSH 客户端
         sshClient.end();
         console.log(`SshService: Test connection ${connectionId} client closed.`);
    }
};


// --- NEW FUNCTIONS FOR MANAGING LIVE CONNECTIONS ---

/**
 * Establishes an SSH connection, handling proxies.
 * Internal helper function.
 * @param sshClient - The ssh2 Client instance.
 * @param connectConfig - Base SSH connection config.
 * @param proxyInfo - Optional proxy details.
 * @returns Promise that resolves when SSH is ready, or rejects on error.
 */
const establishSshConnection = (
    sshClient: Client,
    connectConfig: ConnectConfig,
    proxyInfo: DecryptedConnectionDetails['proxy']
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const readyHandler = () => {
            sshClient.removeListener('error', errorHandler); // Clean up error listener on success
            resolve();
        };
        const errorHandler = (err: Error) => {
            sshClient.removeListener('ready', readyHandler); // Clean up ready listener on error
            reject(err); // Reject with the specific error
        };

        sshClient.once('ready', readyHandler);
        sshClient.once('error', errorHandler); // Generic error handler for direct connect issues

        if (proxyInfo) {
            const proxy = proxyInfo;
            console.log(`SshService: Applying proxy ${proxy.name} (${proxy.type})`);
            if (proxy.type === 'SOCKS5') {
                const socksOptions: SocksClientOptions = {
                    proxy: { host: proxy.host, port: proxy.port, type: 5, userId: proxy.username, password: proxy.password }, // Type 5 is implicit
                    command: 'connect',
                    destination: { host: connectConfig.host!, port: connectConfig.port! }, // Use base config host/port
                    timeout: connectConfig.readyTimeout ?? CONNECT_TIMEOUT, // Use connection timeout
                };
                SocksClient.createConnection(socksOptions)
                    .then(({ socket }) => {
                        console.log(`SshService: SOCKS5 proxy connection successful.`);
                        connectConfig.sock = socket;
                        sshClient.connect(connectConfig); // Connect SSH via proxy socket
                    })
                    .catch(socksError => {
                        console.error(`SshService: SOCKS5 proxy connection failed:`, socksError);
                        // Reject the main promise, remove listeners handled by errorHandler
                        errorHandler(new Error(`SOCKS5 代理连接失败: ${socksError.message}`));
                    });

            } else if (proxy.type === 'HTTP') {
                console.log(`SshService: Attempting HTTP proxy tunnel via ${proxy.host}:${proxy.port}...`);
                const reqOptions: http.RequestOptions = { method: 'CONNECT', host: proxy.host, port: proxy.port, path: `${connectConfig.host}:${connectConfig.port}`, timeout: connectConfig.readyTimeout ?? CONNECT_TIMEOUT, agent: false };
                if (proxy.username) {
                    const auth = 'Basic ' + Buffer.from(proxy.username + ':' + (proxy.password || '')).toString('base64');
                    reqOptions.headers = { ...reqOptions.headers, 'Proxy-Authorization': auth, 'Proxy-Connection': 'Keep-Alive', 'Host': `${connectConfig.host}:${connectConfig.port}` };
                }
                const req = http.request(reqOptions);
                req.on('connect', (res, socket, head) => {
                    if (res.statusCode === 200) {
                        console.log(`SshService: HTTP proxy tunnel established.`);
                        connectConfig.sock = socket;
                        sshClient.connect(connectConfig); // Connect SSH via tunnel socket
                    } else {
                        console.error(`SshService: HTTP proxy CONNECT request failed, status code: ${res.statusCode}`);
                        socket.destroy();
                        errorHandler(new Error(`HTTP 代理连接失败 (状态码: ${res.statusCode})`)); // Reject main promise
                    } // <-- Added missing closing parenthesis here
                });
                req.on('error', (err) => {
                    console.error(`SshService: HTTP proxy request error:`, err);
                    errorHandler(new Error(`HTTP 代理连接错误: ${err.message}`)); // Reject main promise
                });
                req.on('timeout', () => {
                    console.error(`SshService: HTTP proxy request timeout.`);
                    req.destroy();
                    errorHandler(new Error('HTTP 代理连接超时')); // Reject main promise
                });
                req.end(); // Send the CONNECT request
            } else {
                errorHandler(new Error(`不支持的代理类型: ${proxy.type}`)); // Reject main promise
            }
        } else {
            // No proxy, connect directly
            console.log(`SshService: No proxy detected, connecting directly...`);
            sshClient.connect(connectConfig);
        }
    });
};


/**
 * Connects to SSH, opens a shell, and sets up event forwarding via WebSocket.
 * @param connectionId - The ID of the connection config in the database.
 * @param ws - The authenticated WebSocket client instance.
 */
export const connectAndOpenShell = async (connectionId: number, ws: AuthenticatedWebSocket): Promise<void> => {
    console.log(`SshService: User ${ws.username} requested connection to ID: ${connectionId}`);
    if (activeSessions.has(ws)) {
        console.warn(`SshService: User ${ws.username} already has an active session.`);
        throw new Error('已存在活动的 SSH 连接。');
    }

    ws.send(JSON.stringify({ type: 'ssh:status', payload: '正在获取连接信息...' }));

    // 1. Get connection info
    const rawConnInfo = await ConnectionRepository.findFullConnectionById(connectionId);
    if (!rawConnInfo) {
        throw new Error('连接配置未找到。');
    }

    // 2. Decrypt and prepare connection details
    let fullConnInfo: DecryptedConnectionDetails;
    try {
        // (Decryption logic similar to testConnection, could be refactored)
        fullConnInfo = { /* ... decryption ... */
             id: rawConnInfo.id, name: rawConnInfo.name, host: rawConnInfo.host, port: rawConnInfo.port, username: rawConnInfo.username, auth_method: rawConnInfo.auth_method,
             password: (rawConnInfo.auth_method === 'password' && rawConnInfo.encrypted_password) ? decrypt(rawConnInfo.encrypted_password) : undefined,
             privateKey: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_private_key) ? decrypt(rawConnInfo.encrypted_private_key) : undefined,
             passphrase: (rawConnInfo.auth_method === 'key' && rawConnInfo.encrypted_passphrase) ? decrypt(rawConnInfo.encrypted_passphrase) : undefined,
             proxy: null,
        };
        if (rawConnInfo.proxy_db_id) {
             fullConnInfo.proxy = { /* ... proxy decryption ... */
                 id: rawConnInfo.proxy_db_id, name: rawConnInfo.proxy_name, type: rawConnInfo.proxy_type, host: rawConnInfo.proxy_host, port: rawConnInfo.proxy_port, username: rawConnInfo.proxy_username || undefined, auth_method: rawConnInfo.proxy_auth_method,
                 password: rawConnInfo.proxy_encrypted_password ? decrypt(rawConnInfo.proxy_encrypted_password) : undefined,
                 privateKey: rawConnInfo.proxy_encrypted_private_key ? decrypt(rawConnInfo.proxy_encrypted_private_key) : undefined,
                 passphrase: rawConnInfo.proxy_encrypted_passphrase ? decrypt(rawConnInfo.proxy_encrypted_passphrase) : undefined,
             };
        }
    } catch (decryptError: any) {
        console.error(`SshService: Handling credentials failed for ${connectionId}:`, decryptError);
        throw new Error(`无法处理连接凭证: ${decryptError.message}`);
    }

    // 3. Prepare SSH config
    const connectConfig: ConnectConfig = {
        host: fullConnInfo.host,
        port: fullConnInfo.port,
        username: fullConnInfo.username,
        password: fullConnInfo.password,
        privateKey: fullConnInfo.privateKey,
        passphrase: fullConnInfo.passphrase,
        readyTimeout: CONNECT_TIMEOUT,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
    };

    // 4. Establish connection and open shell
    const sshClient = new Client();

    // Generic error/close handlers for the client
    const clientCloseHandler = () => {
        console.log(`SshService: SSH client for ${ws.username} closed.`);
        if (activeSessions.has(ws)) { // Check if cleanup wasn't already called
            if (!ws.CLOSED && !ws.CLOSING) {
                ws.send(JSON.stringify({ type: 'ssh:disconnected', payload: 'SSH 连接已关闭。' }));
            }
            cleanupConnection(ws); // Ensure cleanup
        }
    };
    const clientErrorHandler = (err: Error) => {
        console.error(`SshService: SSH client error for ${ws.username}:`, err);
         if (activeSessions.has(ws)) { // Check if cleanup wasn't already called
            if (!ws.CLOSED && !ws.CLOSING) {
                ws.send(JSON.stringify({ type: 'ssh:error', payload: `SSH 连接错误: ${err.message}` }));
            }
            cleanupConnection(ws); // Ensure cleanup
        }
    };
    sshClient.on('close', clientCloseHandler);
    sshClient.on('error', clientErrorHandler);


    try {
        ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在连接到 ${fullConnInfo.host}...` }));
        await establishSshConnection(sshClient, connectConfig, fullConnInfo.proxy); // Use helper

        ws.send(JSON.stringify({ type: 'ssh:status', payload: 'SSH 连接成功，正在打开 Shell...' }));

        // 5. Open Shell Stream
        const shellStream = await new Promise<ClientChannel>((resolve, reject) => {
            sshClient.shell((err, stream) => {
                if (err) {
                    console.error(`SshService: User ${ws.username} failed to open shell:`, err);
                    return reject(new Error(`打开 Shell 失败: ${err.message}`));
                }
                console.log(`SshService: User ${ws.username} shell channel opened.`);
                resolve(stream);
            });
        });

        // 6. Store active session
        const session: ActiveSshSession = { client: sshClient, shell: shellStream, connectionInfo: fullConnInfo };
        activeSessions.set(ws, session);
        console.log(`SshService: Active session stored for ${ws.username}.`);

        // 7. Setup event forwarding for the shell stream
        shellStream.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ssh:output', payload: data.toString('base64'), encoding: 'base64' }));
            }
        });
        shellStream.stderr.on('data', (data: Buffer) => {
             console.error(`SSH Stderr (${ws.username}): ${data.toString('utf8').substring(0,100)}...`);
             if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ssh:output', payload: data.toString('base64'), encoding: 'base64' })); // Send stderr as output
             }
        });
        shellStream.on('close', () => {
            console.log(`SshService: Shell stream for ${ws.username} closed.`);
             if (activeSessions.has(ws)) { // Check if cleanup wasn't already called by client close
                if (!ws.CLOSED && !ws.CLOSING) {
                    ws.send(JSON.stringify({ type: 'ssh:disconnected', payload: 'Shell 通道已关闭。' }));
                }
                cleanupConnection(ws); // Trigger cleanup if shell closes independently
            }
        });

        // 8. Initialize SFTP (TODO: Move to SftpService) and Status Polling (TODO: Move to StatusMonitorService)
        // For now, just notify connection success
        ws.send(JSON.stringify({ type: 'ssh:connected' }));

        // TODO: Call SftpService.initializeSftpSession(ws, sshClient);
        // TODO: Call StatusMonitorService.startStatusPolling(ws, sshClient);


    } catch (error: any) {
        console.error(`SshService: Failed to connect or open shell for ${ws.username}:`, error);
        // Ensure client listeners are removed and client is ended on failure
        sshClient.removeListener('close', clientCloseHandler);
        sshClient.removeListener('error', clientErrorHandler);
        sshClient.end();
        cleanupConnection(ws); // Clean up any partial state
        throw error; // Re-throw for the controller
    }
};

/**
 * Sends input data to the SSH shell stream associated with a WebSocket connection.
 * @param ws - The authenticated WebSocket client.
 * @param data - The data string to send.
 */
export const sendInput = (ws: AuthenticatedWebSocket, data: string): void => {
    const session = activeSessions.get(ws);
    if (session?.shell && session.shell.writable) {
        session.shell.write(data);
    } else {
        console.warn(`SshService: Cannot send input for ${ws.username}, no active/writable shell stream found.`);
        // Optionally notify the client ws.send(...)
    }
};

/**
 * Resizes the pseudo-terminal associated with a WebSocket connection.
 * @param ws - The authenticated WebSocket client.
 * @param cols - Terminal width in columns.
 * @param rows - Terminal height in rows.
 */
export const resizeTerminal = (ws: AuthenticatedWebSocket, cols: number, rows: number): void => {
    const session = activeSessions.get(ws);
    if (session?.shell) {
        console.log(`SshService: Resizing terminal for ${ws.username} to ${cols}x${rows}`);
        session.shell.setWindow(rows, cols, 0, 0); // Note: rows, cols order
    } else {
         console.warn(`SshService: Cannot resize terminal for ${ws.username}, no active shell stream found.`);
    }
};

/**
 * Cleans up SSH resources associated with a WebSocket connection.
 * @param ws - The authenticated WebSocket client.
 */
export const cleanupConnection = (ws: AuthenticatedWebSocket): void => {
    const session = activeSessions.get(ws);
    if (session) {
        console.log(`SshService: Cleaning up SSH session for ${ws.username}...`);
        // TODO: Call StatusMonitorService.stopStatusPolling(ws);
        // TODO: Call SftpService.cleanupSftpSession(ws);

        // End streams and client
        session.shell?.end(); // End the shell stream first
        session.client?.end(); // End the main SSH client connection

        activeSessions.delete(ws); // Remove from active sessions map
        console.log(`SshService: SSH session for ${ws.username} cleaned up.`);
    } else {
        // console.log(`SshService: No active SSH session found for ${ws.username} during cleanup.`);
    }
};
