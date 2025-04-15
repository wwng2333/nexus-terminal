import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { Request, RequestHandler } from 'express';
import { Client, ClientChannel } from 'ssh2';
import { v4 as uuidv4 } from 'uuid'; // 用于生成唯一的会话 ID
import { getDb } from './database';
import { decrypt } from './utils/crypto';
import { SftpService } from './services/sftp.service'; // 引入 SftpService
import { StatusMonitorService } from './services/status-monitor.service'; // 引入 StatusMonitorService
import * as SshService from './services/ssh.service'; // 引入重构后的 SshService 函数

// 扩展 WebSocket 类型以包含会话 ID
interface AuthenticatedWebSocket extends WebSocket {
    isAlive?: boolean;
    userId?: number;
    username?: string;
    sessionId?: string; // 用于关联 ClientState 的唯一 ID
}

import { SFTPWrapper } from 'ssh2'; // 引入 SFTPWrapper 类型

// 中心化的客户端状态接口 (统一版本)
export interface ClientState { // 导出以便 Service 可以导入
    ws: AuthenticatedWebSocket;
    sshClient: Client;
    sshShellStream?: ClientChannel;
    dbConnectionId: number;
    sftp?: SFTPWrapper; // 添加 sftp 实例 (由 SftpService 管理)
    statusIntervalId?: NodeJS.Timeout; // 添加状态轮询 ID (由 StatusMonitorService 管理)
}

// 存储所有活动客户端的状态 (key: sessionId)
const clientStates = new Map<string, ClientState>();

// --- 服务实例化 ---
// 将 clientStates 传递给需要访问共享状态的服务
const sftpService = new SftpService(clientStates); // 移除 as any
const statusMonitorService = new StatusMonitorService(clientStates); // 移除 as any

/**
 * 清理指定会话 ID 关联的所有资源
 * @param sessionId - 会话 ID
 */
const cleanupClientConnection = (sessionId: string | undefined) => {
    if (!sessionId) return;

    const state = clientStates.get(sessionId);
    if (state) {
        console.log(`WebSocket: 清理会话 ${sessionId} (用户: ${state.ws.username}, DB 连接 ID: ${state.dbConnectionId})...`);

        // 1. 停止状态轮询
        statusMonitorService.stopStatusPolling(sessionId);

        // 2. 清理 SFTP 会话
        sftpService.cleanupSftpSession(sessionId);

        // 3. 清理 SSH 连接 (调用 SshService 中的底层清理逻辑，或直接操作)
        // SshService.cleanupConnection(state.ws); // 旧版 SshService 的清理方式，需要调整
        state.sshShellStream?.end(); // 结束 shell 流
        state.sshClient?.end(); // 结束 SSH 客户端

        // 4. 从状态 Map 中移除
        clientStates.delete(sessionId);

        // 5. 清除 WebSocket 上的 sessionId 关联 (可选，因为 ws 可能已关闭)
        if (state.ws && state.ws.sessionId === sessionId) {
            delete state.ws.sessionId;
        }

        console.log(`WebSocket: 会话 ${sessionId} 已清理。`);
    } else {
        // console.log(`WebSocket: 清理时未找到会话 ${sessionId} 的状态。`);
    }
};

export const initializeWebSocket = (server: http.Server, sessionParser: RequestHandler): WebSocketServer => {
    const wss = new WebSocketServer({ noServer: true });
    const db = getDb(); // 获取数据库实例

    // --- 心跳检测 ---
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws: WebSocket) => {
            const extWs = ws as AuthenticatedWebSocket;
            if (extWs.isAlive === false) {
                console.log(`WebSocket 心跳检测：用户 ${extWs.username} (会话: ${extWs.sessionId}) 连接无响应，正在终止...`);
                cleanupClientConnection(extWs.sessionId); // 使用会话 ID 清理
                return extWs.terminate();
            }
            extWs.isAlive = false;
            extWs.ping(() => {});
        });
    }, 30000); // 30 秒心跳间隔

    // --- WebSocket 升级处理 (认证) ---
    server.on('upgrade', (request: Request, socket, head) => {
        // @ts-ignore Express-session 类型问题
        sessionParser(request, {} as any, () => {
            if (!request.session || !request.session.userId) {
                console.log('WebSocket 认证失败：未找到会话或用户未登录。');
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            console.log(`WebSocket 认证成功：用户 ${request.session.username} (ID: ${request.session.userId})`);
            wss.handleUpgrade(request, socket, head, (ws) => {
                const extWs = ws as AuthenticatedWebSocket;
                extWs.userId = request.session.userId;
                extWs.username = request.session.username;
                wss.emit('connection', extWs, request);
            });
        });
    });

    // --- WebSocket 连接处理 ---
    wss.on('connection', (ws: AuthenticatedWebSocket, request: Request) => {
        ws.isAlive = true;
        console.log(`WebSocket：客户端 ${ws.username} (ID: ${ws.userId}) 已连接。`);

        ws.on('pong', () => { ws.isAlive = true; });

        // --- 消息处理 ---
        ws.on('message', async (message) => {
            // console.log(`WebSocket：收到来自 ${ws.username} (会话: ${ws.sessionId}) 的消息: ${message.toString().substring(0, 100)}...`);
            let parsedMessage: any;
            try {
                parsedMessage = JSON.parse(message.toString());
            } catch (e) {
                console.error(`WebSocket：来自 ${ws.username} 的无效 JSON 消息:`, message.toString());
                ws.send(JSON.stringify({ type: 'error', payload: '无效的消息格式 (非 JSON)' }));
                return;
            }

            const { type, payload, requestId } = parsedMessage; // requestId 用于 SFTP 操作
            const sessionId = ws.sessionId; // 获取当前 WebSocket 的会话 ID
            const state = sessionId ? clientStates.get(sessionId) : undefined; // 获取当前会话状态

            try {
                switch (type) {
                    // --- SSH 连接请求 ---
                    case 'ssh:connect': {
                        if (sessionId && state) {
                            console.warn(`WebSocket: 用户 ${ws.username} (会话: ${sessionId}) 已有活动连接，忽略新的连接请求。`);
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: '已存在活动的 SSH 连接。' }));
                            return;
                        }

                        const dbConnectionId = payload?.connectionId;
                        if (!dbConnectionId) {
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: '缺少 connectionId。' }));
                            return;
                        }

                        console.log(`WebSocket: 用户 ${ws.username} 请求连接到数据库 ID: ${dbConnectionId}`);
                        ws.send(JSON.stringify({ type: 'ssh:status', payload: '正在处理连接请求...' }));

                        try {
                            // 调用 SshService 建立连接并打开 Shell
                            // 注意：SshService.connectAndOpenShell 现在需要返回 Client 和 ShellStream
                            // 或者我们在这里编排，调用 SshService 的不同部分
                            // 这里采用 SshService.connectAndOpenShell 返回包含 client 和 shell 的对象的假设
                            // SshService 内部不再管理 activeSessions Map

                            // 模拟调用 SshService (实际应调用重构后的函数)
                            // const { client, shellStream } = await SshService.connectAndOpenShell(dbConnectionId, ws); // 假设 SshService 返回这些

                            // --- 手动编排 SSH 连接流程 ---
                            // 1. 获取连接信息 (与旧代码类似，但移到这里)
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: '正在获取连接信息...' }));
                            const connInfo = await SshService.getConnectionDetails(dbConnectionId); // 假设 SshService 提供此函数

                            // 2. 建立 SSH 连接 (调用 SshService 的底层连接函数)
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在连接到 ${connInfo.host}...` }));
                            const sshClient = await SshService.establishSshConnection(connInfo); // 假设 SshService 提供此函数

                            // 3. 连接成功，创建状态
                            const newSessionId = uuidv4(); // 生成唯一会话 ID
                            ws.sessionId = newSessionId; // 关联到 WebSocket

                            const newState: ClientState = {
                                ws: ws,
                                sshClient: sshClient,
                                dbConnectionId: dbConnectionId,
                                // shellStream 稍后添加
                            };
                            clientStates.set(newSessionId, newState);
                            console.log(`WebSocket: 为用户 ${ws.username} 创建新会话 ${newSessionId} (DB ID: ${dbConnectionId})`);

                            // 4. 打开 Shell
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: 'SSH 连接成功，正在打开 Shell...' }));
                            try {
                                const shellStream = await SshService.openShell(sshClient); // 假设 SshService 提供此函数
                                newState.sshShellStream = shellStream; // 存储 Shell 流

                                // 5. 设置 Shell 事件转发
                                shellStream.on('data', (data: Buffer) => {
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({ type: 'ssh:output', payload: data.toString('base64'), encoding: 'base64' }));
                                    }
                                });
                                shellStream.stderr.on('data', (data: Buffer) => {
                                    console.error(`SSH Stderr (会话: ${newSessionId}): ${data.toString('utf8').substring(0, 100)}...`);
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({ type: 'ssh:output', payload: data.toString('base64'), encoding: 'base64' }));
                                    }
                                });
                                shellStream.on('close', () => {
                                    console.log(`SSH: 会话 ${newSessionId} 的 Shell 通道已关闭。`);
                                    ws.send(JSON.stringify({ type: 'ssh:disconnected', payload: 'Shell 通道已关闭。' }));
                                    cleanupClientConnection(newSessionId); // Shell 关闭时清理整个会话
                                });

                                // 6. 发送 SSH 连接成功消息 (Shell 已就绪)
                                ws.send(JSON.stringify({
                                    type: 'ssh:connected',
                                    payload: {
                                        connectionId: dbConnectionId,
                                        sessionId: newSessionId
                                        // sftpReady 标志移除，将通过 sftp_ready 消息通知
                                    }
                                }));
                                console.log(`WebSocket: 会话 ${newSessionId} SSH 连接和 Shell 建立成功。`);

                                // 7. 异步初始化 SFTP 和启动状态监控
                                console.log(`WebSocket: 会话 ${newSessionId} 正在异步初始化 SFTP...`);
                                sftpService.initializeSftpSession(newSessionId)
                                    .then(() => {
                                        console.log(`SFTP: 会话 ${newSessionId} 异步初始化成功。`);
                                        // SFTP 初始化成功后，前端会收到 sftp_ready 消息
                                        // FileManager 会在 isConnected 变为 true 后自动请求目录
                                    })
                                    .catch(sftpInitError => {
                                        console.error(`WebSocket: 会话 ${newSessionId} 异步初始化 SFTP 失败:`, sftpInitError);
                                        // 错误消息已在 initializeSftpSession 内部发送
                                    });

                                console.log(`WebSocket: 会话 ${newSessionId} 正在启动状态监控...`);
                                statusMonitorService.startStatusPolling(newSessionId); // 启动状态轮询

                            } catch (shellError: any) {
                                console.error(`SSH: 会话 ${newSessionId} 打开 Shell 失败:`, shellError);
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `打开 Shell 失败: ${shellError.message}` }));
                                cleanupClientConnection(newSessionId); // 打开 Shell 失败也需要清理
                            }

                            // 7. 设置 SSH Client 的关闭和错误处理
                            sshClient.on('close', () => {
                                console.log(`SSH: 会话 ${newSessionId} 的客户端连接已关闭。`);
                                // Shell 关闭事件通常会先触发清理，这里作为保险
                                cleanupClientConnection(newSessionId);
                            });
                            sshClient.on('error', (err: Error) => {
                                console.error(`SSH: 会话 ${newSessionId} 的客户端连接错误:`, err);
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `SSH 连接错误: ${err.message}` }));
                                cleanupClientConnection(newSessionId);
                            });

                        } catch (connectError: any) {
                            console.error(`WebSocket: 用户 ${ws.username} 连接到数据库 ID ${dbConnectionId} 失败:`, connectError);
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `连接失败: ${connectError.message}` }));
                            // 此处不需要 cleanup，因为状态尚未创建
                        }
                        break;
                    } // end case 'ssh:connect'

                    // --- SSH 输入 ---
                    case 'ssh:input': {
                        if (!state || !state.sshShellStream) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 SSH 输入，但无活动 Shell。`);
                            return;
                        }
                        const data = payload?.data;
                        if (typeof data === 'string') {
                            state.sshShellStream.write(data);
                        }
                        break;
                    }

                    // --- SSH 终端大小调整 ---
                    case 'ssh:resize': {
                        if (!state || !state.sshShellStream) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的调整大小请求，但无活动 Shell。`);
                            return;
                        }
                        const { cols, rows } = payload || {};
                        if (typeof cols === 'number' && typeof rows === 'number') {
                            console.log(`SSH: 会话 ${sessionId} 调整终端大小: ${cols}x${rows}`);
                            state.sshShellStream.setWindow(rows, cols, 0, 0);
                        }
                        break;
                    }

                    // --- SFTP 操作 (委托给 SftpService) ---
                    case 'sftp:readdir':
                    case 'sftp:stat':
                    case 'sftp:readfile':
                    case 'sftp:writefile': // Added missing case
                    case 'sftp:mkdir':
                    case 'sftp:rmdir':
                    case 'sftp:unlink':
                    case 'sftp:rename':
                    case 'sftp:chmod': {
                        if (!sessionId || !state) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} 的 SFTP 请求 (${type})，但无活动会话。`);
                            // 尝试包含 requestId 发送错误，如果 requestId 存在的话
                            const errPayload: { message: string; requestId?: string } = { message: '无效的会话' };
                            if (requestId) errPayload.requestId = requestId;
                            ws.send(JSON.stringify({ type: 'sftp_error', payload: errPayload }));
                            return;
                        }

                        // --- 添加 Request ID 检查 ---
                        // 对于需要响应关联的操作，强制要求 requestId
                        if (!requestId) {
                            console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 SFTP 请求 (${type})，但缺少 requestId。`);
                            ws.send(JSON.stringify({ type: 'sftp_error', payload: { message: `SFTP 操作 ${type} 缺少 requestId` } }));
                            return; // 没有 requestId 则不继续处理
                        }
                        // --- 结束 Request ID 检查 ---

                        // Explicitly call SftpService methods based on type
                        try {
                            switch (type) {
                                case 'sftp:readdir':
                                    if (payload?.path) {
                                        sftpService.readdir(sessionId, payload.path, requestId);
                                    } else { throw new Error("Missing 'path' in payload for readdir"); }
                                    break;
                                case 'sftp:stat':
                                    if (payload?.path) {
                                        sftpService.stat(sessionId, payload.path, requestId);
                                    } else { throw new Error("Missing 'path' in payload for stat"); }
                                    break;
                                case 'sftp:readfile':
                                     if (payload?.path) {
                                         sftpService.readFile(sessionId, payload.path, requestId);
                                     } else { throw new Error("Missing 'path' in payload for readfile"); }
                                     break;
                                case 'sftp:writefile':
                                    // Handle both 'data' (from potential future upload refactor) and 'content'
                                    const fileContent = payload?.content ?? payload?.data ?? ''; // Default to empty string for create
                                    if (payload?.path) {
                                        // Ensure content is base64 encoded if needed (assuming frontend sends base64 for now)
                                        // If creating empty file, data might be empty string, Buffer.from('') is fine.
                                        const dataToSend = (typeof fileContent === 'string') ? fileContent : ''; // Ensure it's a string
                                        sftpService.writefile(sessionId, payload.path, dataToSend, requestId);
                                    } else { throw new Error("Missing 'path' in payload for writefile"); }
                                    break;
                                case 'sftp:mkdir':
                                     if (payload?.path) {
                                         sftpService.mkdir(sessionId, payload.path, requestId);
                                     } else { throw new Error("Missing 'path' in payload for mkdir"); }
                                     break;
                                case 'sftp:rmdir':
                                     if (payload?.path) {
                                         sftpService.rmdir(sessionId, payload.path, requestId);
                                     } else { throw new Error("Missing 'path' in payload for rmdir"); }
                                     break;
                                case 'sftp:unlink':
                                     if (payload?.path) {
                                         sftpService.unlink(sessionId, payload.path, requestId);
                                     } else { throw new Error("Missing 'path' in payload for unlink"); }
                                     break;
                                case 'sftp:rename':
                                     if (payload?.oldPath && payload?.newPath) {
                                         sftpService.rename(sessionId, payload.oldPath, payload.newPath, requestId);
                                     } else { throw new Error("Missing 'oldPath' or 'newPath' in payload for rename"); }
                                     break;
                                case 'sftp:chmod':
                                     if (payload?.path && typeof payload?.mode === 'number') {
                                         sftpService.chmod(sessionId, payload.path, payload.mode, requestId);
                                     } else { throw new Error("Missing 'path' or invalid 'mode' in payload for chmod"); }
                                     break;
                                default:
                                    // Should not happen if already checked type, but as a safeguard
                                    throw new Error(`Unhandled SFTP type: ${type}`);
                            }
                        } catch (sftpCallError: any) {
                             console.error(`WebSocket: Error preparing/calling SFTP service for ${type} (Request ID: ${requestId}):`, sftpCallError);
                             ws.send(JSON.stringify({ type: 'sftp_error', payload: { message: `处理 SFTP 请求 ${type} 时出错: ${sftpCallError.message}`, requestId } }));
                        }
                        break;
                    }
                     // --- SFTP 文件上传 (保持部分逻辑，因为涉及分块) ---
                     // TODO: 考虑将上传逻辑也移入 SftpService
                     case 'sftp:upload:start':
                     case 'sftp:upload:chunk':
                     case 'sftp:upload:cancel': {
                         console.warn(`WebSocket: SFTP 上传功能 (${type}) 尚未完全迁移到 SftpService。`);
                         // 可以在这里调用 SftpService 的对应方法，或者暂时保留旧逻辑
                         ws.send(JSON.stringify({ type: 'error', payload: `SFTP 上传功能正在重构中。` }));
                         break;
                     }


                    default:
                        console.warn(`WebSocket：收到来自 ${ws.username} (会话: ${sessionId}) 的未知消息类型: ${type}`);
                        ws.send(JSON.stringify({ type: 'error', payload: `不支持的消息类型: ${type}` }));
                }
            } catch (error: any) {
                console.error(`WebSocket: 处理来自 ${ws.username} (会话: ${sessionId}) 的消息 (${type}) 时发生顶层错误:`, error);
                ws.send(JSON.stringify({ type: 'error', payload: `处理消息时发生内部错误: ${error.message}` }));
                // 考虑是否需要清理连接？取决于错误的性质
                // cleanupClientConnection(sessionId);
            }
        });

        // --- 连接关闭和错误处理 ---
        ws.on('close', (code, reason) => {
            console.log(`WebSocket：客户端 ${ws.username} (会话: ${ws.sessionId}) 已断开连接。代码: ${code}, 原因: ${reason.toString()}`);
            cleanupClientConnection(ws.sessionId); // 使用会话 ID 清理
        });

        ws.on('error', (error) => {
            console.error(`WebSocket：客户端 ${ws.username} (会话: ${ws.sessionId}) 发生错误:`, error);
            cleanupClientConnection(ws.sessionId); // 使用会话 ID 清理
        });
    });

    // --- WebSocket 服务器关闭处理 ---
    wss.on('close', () => {
        console.log('WebSocket 服务器正在关闭，清理心跳定时器和所有活动会话...');
        clearInterval(heartbeatInterval);
        // 关闭所有活动的连接
        clientStates.forEach((state, sessionId) => {
            cleanupClientConnection(sessionId);
        });
        console.log('所有活动会话已清理。');
    });

    console.log('WebSocket 服务器初始化完成。');
    return wss;
};

// --- 移除旧的辅助函数 ---
// - connectSshClient
// - fetchServerStatus
// - executeSshCommand
// - startStatusPolling
// - cleanupSshConnection (旧版本)
// - activeSshConnections Map
// - activeUploads Map
// - previousNetStats Map
