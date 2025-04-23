import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { Request, RequestHandler } from 'express';
import { Client, ClientChannel } from 'ssh2';
import { v4 as uuidv4 } from 'uuid'; // 用于生成唯一的会话 ID
import { getDbInstance } from './database/connection'; // Updated import path, use getDbInstance
import { decrypt } from './utils/crypto';
import { SftpService } from './services/sftp.service';
import { StatusMonitorService } from './services/status-monitor.service';
import * as SshService from './services/ssh.service';
import { DockerService } from './services/docker.service'; // 导入 DockerService
import { AuditLogService } from './services/audit.service'; // 导入 AuditLogService
import { AuditLogActionType } from './types/audit.types'; // 导入 AuditLogActionType
import { settingsService } from './services/settings.service'; // +++ 修正导入路径 +++

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
    dockerStatusIntervalId?: NodeJS.Timeout; // NEW: Docker 状态轮询 ID
    ipAddress?: string; // 添加 IP 地址字段
}

// --- Interfaces (保持与前端一致) ---
// --- FIX: Move PortInfo definition before its usage ---
interface PortInfo {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: 'tcp' | 'udp' | string;
}
// --- End FIX ---

// --- Docker Interfaces (Ensure this matches frontend and DockerService) ---
// Stats 接口
interface DockerStats {
    ID: string;       // 来自 docker stats
    Name: string;     // 来自 docker stats
    CPUPerc: string;  // 来自 docker stats
    MemUsage: string; // 来自 docker stats
    MemPerc: string;  // 来自 docker stats
    NetIO: string;    // 来自 docker stats
    BlockIO: string;  // 来自 docker stats
    PIDs: string;     // 来自 docker stats
}

// Container 接口 (包含 stats)
interface DockerContainer {
    id: string; // 使用小写 id 以匹配前端期望
    Names: string[];
    Image: string;
    ImageID: string;
    Command: string;
    Created: number;
    State: string;
    Status: string;
    Ports: PortInfo[];
    Labels: Record<string, string>;
    stats?: DockerStats | null; // 可选的 stats 字段
}
// --- End Docker Interfaces ---


// --- 新增：解析 Ports 字符串的辅助函数 ---
function parsePortsString(portsString: string | undefined | null): PortInfo[] { // Now PortInfo is defined
    if (!portsString) {
        return [];
    }
    const ports: PortInfo[] = []; // Now PortInfo is defined
    // 示例格式: "0.0.0.0:8080->80/tcp, :::8080->80/tcp", "127.0.0.1:5432->5432/tcp", "6379/tcp"
    const entries = portsString.split(', ');

    for (const entry of entries) {
        const parts = entry.split('->');
        let publicPart = '';
        let privatePart = '';

        if (parts.length === 2) { // Format like "IP:PublicPort->PrivatePort/Type" or "PublicPort->PrivatePort/Type"
            publicPart = parts[0];
            privatePart = parts[1];
        } else if (parts.length === 1) { // Format like "PrivatePort/Type"
            privatePart = parts[0];
        } else {
            console.warn(`[WebSocket] Skipping unparsable port entry: ${entry}`);
            continue;
        }

        // Parse Private Part (e.g., "80/tcp")
        const privateMatch = privatePart.match(/^(\d+)\/(tcp|udp|\w+)$/);
        if (!privateMatch) {
             console.warn(`[WebSocket] Skipping unparsable private port part: ${privatePart}`);
             continue;
        }
        const privatePort = parseInt(privateMatch[1], 10);
        const type = privateMatch[2];

        let ip: string | undefined = undefined;
        let publicPort: number | undefined = undefined;

        // Parse Public Part (e.g., "0.0.0.0:8080" or ":::8080" or just "8080")
        if (publicPart) {
            const publicMatch = publicPart.match(/^(?:([\d.:a-fA-F]+):)?(\d+)$/); // Supports IPv4, IPv6, or just port
             if (publicMatch) {
                 ip = publicMatch[1] || undefined; // IP might be undefined if only port is specified
                 publicPort = parseInt(publicMatch[2], 10);
             } else {
                  console.warn(`[WebSocket] Skipping unparsable public port part: ${publicPart}`);
                  // Continue processing with only private port info if public part is weird
             }
        }

        if (!isNaN(privatePort)) {
             ports.push({
                 IP: ip,
                 PrivatePort: privatePort,
                 PublicPort: publicPort,
                 Type: type
             });
        }
    }
    return ports;
}
// --- 结束辅助函数 ---

// 存储所有活动客户端的状态 (key: sessionId)
export const clientStates = new Map<string, ClientState>(); // Export clientStates

// --- 服务实例化 ---
// 将 clientStates 传递给需要访问共享状态的服务
const sftpService = new SftpService(clientStates);
const statusMonitorService = new StatusMonitorService(clientStates);
const auditLogService = new AuditLogService(); // 实例化 AuditLogService
const dockerService = new DockerService(); // 实例化 DockerService (主要用于类型或未来可能的本地调用)

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
        state.sshShellStream?.end(); // 结束 shell 流
        state.sshClient?.end(); // 结束 SSH 客户端

        // 4. 清理 Docker 状态轮询定时器
        if (state.dockerStatusIntervalId) {
            clearInterval(state.dockerStatusIntervalId);
            console.log(`WebSocket: Cleared Docker status interval for session ${sessionId}.`);
        }

        // 5. 从状态 Map 中移除
        clientStates.delete(sessionId);

        // 6. 清除 WebSocket 上的 sessionId 关联 (可选，因为 ws 可能已关闭)
        if (state.ws && state.ws.sessionId === sessionId) {
            delete state.ws.sessionId;
        }

        console.log(`WebSocket: 会话 ${sessionId} 已清理。`);
    } else {
        // console.log(`WebSocket: 清理时未找到会话 ${sessionId} 的状态。`);
    }
};

// --- NEW: Reusable function to fetch remote Docker status with stats ---
const fetchRemoteDockerStatus = async (state: ClientState): Promise<{ available: boolean; containers: DockerContainer[] }> => {
    if (!state || !state.sshClient) {
        throw new Error('SSH client is not available in the current state.');
    }

    let allContainers: DockerContainer[] = [];
    const statsMap = new Map<string, DockerStats>();
    let isDockerCmdAvailable = false; // Start assuming unavailable until version check passes

    // --- 1. Check Docker Availability with 'docker version' ---
    try {
        const versionCommand = "docker version --format '{{.Server.Version}}'";
        console.log(`[fetchRemoteDockerStatus] Executing: ${versionCommand} on session ${state.ws.sessionId}`);
        const { stdout: versionStdout, stderr: versionStderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            state.sshClient.exec(versionCommand, { pty: false }, (err, stream) => {
                if (err) return reject(err);
                stream.on('data', (data: Buffer) => { stdout += data.toString(); });
                stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
                stream.on('close', (code: number | null) => {
                    // Resolve even if code is non-zero, check stderr
                    resolve({ stdout, stderr });
                });
                stream.on('error', (execErr: Error) => reject(execErr));
            });
        });

        // Check stderr for common errors indicating Docker is unavailable or inaccessible
        if (versionStderr.includes('command not found') ||
            versionStderr.includes('permission denied') ||
            versionStderr.includes('Cannot connect to the Docker daemon')) {
            console.warn(`[fetchRemoteDockerStatus] Docker version check failed on session ${state.ws.sessionId}. Docker unavailable or inaccessible. Stderr: ${versionStderr.trim()}`);
            return { available: false, containers: [] }; // Docker not available
        } else if (versionStderr) {
            // Log other stderr outputs as warnings but proceed
            console.warn(`[fetchRemoteDockerStatus] Docker version command stderr on session ${state.ws.sessionId}: ${versionStderr.trim()}`);
        }

        // If stdout has content (version number), Docker is likely available
        if (versionStdout.trim()) {
            console.log(`[fetchRemoteDockerStatus] Docker version check successful on session ${state.ws.sessionId}. Version: ${versionStdout.trim()}`);
            isDockerCmdAvailable = true;
        } else {
            // If stdout is empty but no critical error in stderr, still assume unavailable
            console.warn(`[fetchRemoteDockerStatus] Docker version check on session ${state.ws.sessionId} produced no output, assuming Docker unavailable.`);
            return { available: false, containers: [] };
        }

    } catch (error: any) {
        console.error(`[fetchRemoteDockerStatus] Error executing docker version for session ${state.ws.sessionId}:`, error);
        // Treat any error during version check as Docker being unavailable
        return { available: false, containers: [] };
    }

    // If version check failed, we already returned. If it passed, isDockerCmdAvailable is true.

    // --- 2. Get basic container info ---
    try {
        const psCommand = "docker ps -a --no-trunc --format '{{json .}}'";
        console.log(`[fetchRemoteDockerStatus] Executing: ${psCommand} on session ${state.ws.sessionId}`);
        const { stdout: psStdout, stderr: psStderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            state.sshClient.exec(psCommand, { pty: false }, (err, stream) => {
                if (err) return reject(err);
                stream.on('data', (data: Buffer) => { stdout += data.toString(); });
                stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
                stream.on('close', (code: number | null) => {
                    // Don't reject on non-zero code here, check stderr
                    resolve({ stdout, stderr });
                });
                stream.on('error', (execErr: Error) => reject(execErr));
            });
        });

        // Although version check should catch most, double-check ps stderr
        if (psStderr.includes('command not found') || // Should not happen if version check passed
            psStderr.includes('permission denied') || // Could still happen if permissions differ
            psStderr.includes('Cannot connect to the Docker daemon')) { // Should not happen
            console.warn(`[fetchRemoteDockerStatus] Docker ps command failed unexpectedly after version check on session ${state.ws.sessionId}. Stderr: ${psStderr.trim()}`);
            // Report as available=false, as ps failed critically
            return { available: false, containers: [] };
        } else if (psStderr) {
             console.warn(`[fetchRemoteDockerStatus] Docker ps command stderr on session ${state.ws.sessionId}: ${psStderr.trim()}`);
             // Continue execution but log the warning
        }

        // If stdout is empty, there are no containers, which is valid
        const lines = psStdout.trim() ? psStdout.trim().split('\n') : [];
        allContainers = lines
            .map(line => {
                try {
                    const data = JSON.parse(line);
                    // Map raw data to DockerContainer interface (lowercase id)
                    const container: DockerContainer = {
                        id: data.ID, // Map ID to lowercase id
                        Names: typeof data.Names === 'string' ? data.Names.split(',') : (data.Names || []),
                        Image: data.Image || '',
                        ImageID: data.ImageID || '',
                        Command: data.Command || '',
                        Created: data.CreatedAt || 0, // Check if CreatedAt exists
                        State: data.State || 'unknown',
                        Status: data.Status || '',
                        Ports: parsePortsString(data.Ports),
                        Labels: data.Labels || {},
                        stats: null // Initialize stats as null
                    };
                    return container;
                } catch (parseError) {
                    console.error(`[fetchRemoteDockerStatus] Failed to parse container JSON line for session ${state.ws.sessionId}: ${line}`, parseError);
                    return null;
                }
            })
            .filter((container): container is DockerContainer => container !== null);

    } catch (error: any) {
        console.error(`[fetchRemoteDockerStatus] Error executing docker ps for session ${state.ws.sessionId}:`, error);
        // If ps command fails after version check, report as unavailable
        return { available: false, containers: [] };
        // Rethrowing might be too aggressive here, better to report unavailability
        // throw new Error(`Failed to get remote Docker container list: ${error.message || error}`);
    }

    // --- 3. Get stats for running containers (only if ps was successful) ---
    // Check if there are any containers before running stats
    const runningContainerIds = allContainers.filter(c => c.State === 'running').map(c => c.id);

    if (runningContainerIds.length > 0) {
        try {
            // Construct command to get stats only for running containers
            const statsCommand = `docker stats ${runningContainerIds.join(' ')} --no-stream --format '{{json .}}'`;
            console.log(`[fetchRemoteDockerStatus] Executing: ${statsCommand} on session ${state.ws.sessionId}`);
            const { stdout: statsStdout, stderr: statsStderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                let stdout = '';
            let stderr = '';
            state.sshClient.exec(statsCommand, { pty: false }, (err, stream) => {
                if (err) return reject(err);
                stream.on('data', (data: Buffer) => { stdout += data.toString(); });
                stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
                stream.on('close', (code: number | null) => {
                    // Don't reject on non-zero code, check stderr
                    resolve({ stdout, stderr });
                });
                stream.on('error', (execErr: Error) => reject(execErr));
            });
        });

            if (statsStderr) {
                // Log stats errors but don't necessarily fail the whole process
                console.warn(`[fetchRemoteDockerStatus] Docker stats command stderr on session ${state.ws.sessionId}: ${statsStderr.trim()}`);
            }

            const statsLines = statsStdout.trim() ? statsStdout.trim().split('\n') : [];
            statsLines.forEach(line => {
                try {
                    const statsData = JSON.parse(line) as DockerStats;
                    if (statsData.ID) {
                        // Use the ID from stats data (usually short ID) as the key
                        statsMap.set(statsData.ID, statsData);
                    }
                } catch (parseError) {
                    console.error(`[fetchRemoteDockerStatus] Failed to parse stats JSON line for session ${state.ws.sessionId}: ${line}`, parseError);
                }
            });
        } catch (error: any) {
            // Failure to get stats is not critical, just log and continue
            console.warn(`[fetchRemoteDockerStatus] Error executing docker stats for session ${state.ws.sessionId}:`, error);
        }
    } else {
         console.log(`[fetchRemoteDockerStatus] No running containers found on session ${state.ws.sessionId}, skipping docker stats.`);
    }

    // --- 4. Merge stats into containers ---
    allContainers.forEach(container => {
        const shortId = container.id.substring(0, 12); // docker stats often uses short ID
        const stats = statsMap.get(container.id) || statsMap.get(shortId); // Try matching long and short ID
        if (stats) {
            container.stats = stats;
        }
    });

    // If we reached here, Docker is considered available (version check passed)
    return { available: true, containers: allContainers };
};
// --- End fetchRemoteDockerStatus function ---


export const initializeWebSocket = async (server: http.Server, sessionParser: RequestHandler): Promise<WebSocketServer> => { // Make async
    const wss = new WebSocketServer({ noServer: true });
    const db = await getDbInstance(); // 获取数据库实例 (use await and getDbInstance)
    const DOCKER_STATUS_INTERVAL = 2000; // Poll Docker status every 2 seconds

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
    }, 60000); // 增加到 60 秒心跳间隔

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
            // 获取客户端 IP 地址
            const ipAddress = request.ip;
            console.log(`WebSocket: 升级请求来自 IP: ${ipAddress}`);

            wss.handleUpgrade(request, socket, head, (ws) => {
                const extWs = ws as AuthenticatedWebSocket;
                extWs.userId = request.session.userId;
                extWs.username = request.session.username;
                // 将 IP 地址附加到 request 对象上传递给 connection 事件处理器，以便后续使用
                (request as any).clientIpAddress = ipAddress;
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
                        // 从传递过来的 request 对象获取 IP 地址 (在 catch 块中也需要访问)
                        const clientIp = (request as any).clientIpAddress || 'unknown';

                        try {
                            // --- 手动编排 SSH 连接流程 ---
                            // 1. 获取连接信息
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: '正在获取连接信息...' }));
                            const connInfo = await SshService.getConnectionDetails(dbConnectionId);

                            // 2. 建立 SSH 连接
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在连接到 ${connInfo.host}...` }));
                            const sshClient = await SshService.establishSshConnection(connInfo);

                            // 3. 连接成功，创建状态
                            const newSessionId = uuidv4();
                            ws.sessionId = newSessionId;

                            const newState: ClientState = {
                                ws: ws,
                                sshClient: sshClient,
                                dbConnectionId: dbConnectionId,
                                ipAddress: clientIp, // 存储 IP 地址
                            };
                            clientStates.set(newSessionId, newState);
                            console.log(`WebSocket: 为用户 ${ws.username} (IP: ${clientIp}) 创建新会话 ${newSessionId} (DB ID: ${dbConnectionId})`);

                            // 4. 打开 Shell
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: 'SSH 连接成功，正在打开 Shell...' }));
                            try {
                                const shellStream = await SshService.openShell(sshClient);
                                newState.sshShellStream = shellStream;

                                // 5. 设置 Shell 事件转发
                                shellStream.on('data', (data: Buffer) => {
                                    // --- 添加日志：打印收到的原始数据 ---
                                    console.log(`SSH Data (会话: ${newSessionId}, 原始): `, data.toString()); // 添加原始数据日志 (尝试 utf8)
                                    console.log(`SSH Data (会话: ${newSessionId}, Hex): `, data.toString('hex')); // 添加 Hex 日志
                                    // ------------------------------------
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
                                    cleanupClientConnection(newSessionId);
                                });

                                // 6. 发送 SSH 连接成功消息
                                ws.send(JSON.stringify({
                                    type: 'ssh:connected',
                                    payload: {
                                        connectionId: dbConnectionId,
                                        sessionId: newSessionId
                                    }
                                }));
                                console.log(`WebSocket: 会话 ${newSessionId} SSH 连接和 Shell 建立成功。`);
                                // 记录审计日志：SSH 连接成功
                                auditLogService.logAction('SSH_CONNECT_SUCCESS', {
                                    userId: ws.userId,
                                    username: ws.username,
                                    connectionId: dbConnectionId,
                                    sessionId: newSessionId,
                                    ip: newState.ipAddress
                                });

                                // 7. 异步初始化 SFTP 和启动状态监控
                                console.log(`WebSocket: 会话 ${newSessionId} 正在异步初始化 SFTP...`);
                                sftpService.initializeSftpSession(newSessionId)
                                    .then(() => console.log(`SFTP: 会话 ${newSessionId} 异步初始化成功。`))
                                    .catch(sftpInitError => console.error(`WebSocket: 会话 ${newSessionId} 异步初始化 SFTP 失败:`, sftpInitError));

                                console.log(`WebSocket: 会话 ${newSessionId} 正在启动状态监控...`);
                                statusMonitorService.startStatusPolling(newSessionId);

                               // 8. Start Docker status polling (using setting)
                               console.log(`WebSocket: 会话 ${newSessionId} 正在启动 Docker 状态轮询...`);
                               // --- Get interval from settings ---
                               let dockerPollIntervalMs = 2000; // Default interval
                               try {
                                   const intervalSetting = await settingsService.getSetting('dockerStatusIntervalSeconds');
                                   if (intervalSetting) {
                                       const intervalSeconds = parseInt(intervalSetting, 10);
                                       if (!isNaN(intervalSeconds) && intervalSeconds >= 1) {
                                           dockerPollIntervalMs = intervalSeconds * 1000;
                                           console.log(`[Docker Polling] Using interval from settings: ${intervalSeconds}s (${dockerPollIntervalMs}ms) for session ${newSessionId}`);
                                       } else {
                                            console.warn(`[Docker Polling] Invalid interval setting '${intervalSetting}' found. Using default ${dockerPollIntervalMs}ms for session ${newSessionId}`);
                                       }
                                   } else {
                                       console.log(`[Docker Polling] No interval setting found. Using default ${dockerPollIntervalMs}ms for session ${newSessionId}`);
                                   }
                               } catch (settingError) {
                                    console.error(`[Docker Polling] Error fetching interval setting for session ${newSessionId}. Using default ${dockerPollIntervalMs}ms:`, settingError);
                               }
                               // --- End get interval ---

                               const dockerIntervalId = setInterval(async () => {
                                   const currentState = clientStates.get(newSessionId); // Re-fetch state
                                   if (!currentState || currentState.ws.readyState !== WebSocket.OPEN) {
                                       console.log(`[Docker Polling] Session ${newSessionId} no longer valid or WS closed. Stopping poll.`);
                                       clearInterval(dockerIntervalId);
                                       return;
                                   }
                                   try {
                                       // console.log(`[Docker Polling] Fetching status for session ${newSessionId}...`);
                                       const statusPayload = await fetchRemoteDockerStatus(currentState);
                                       if (currentState.ws.readyState === WebSocket.OPEN) {
                                           currentState.ws.send(JSON.stringify({ type: 'docker:status:update', payload: statusPayload }));
                                       }
                                   } catch (error: any) {
                                       console.error(`[Docker Polling] Error fetching Docker status for session ${newSessionId}:`, error);
                                       // Optionally send error to client, or just log
                                       // if (currentState.ws.readyState === WebSocket.OPEN) {
                                       //    currentState.ws.send(JSON.stringify({ type: 'docker:status:error', payload: { message: `Polling failed: ${error.message}` } }));
                                       // }
                                   }
                               }, dockerPollIntervalMs); // <-- Use the determined interval
                               newState.dockerStatusIntervalId = dockerIntervalId;

                               // 9. Trigger initial Docker status fetch immediately
                                (async () => {
                                    const currentState = clientStates.get(newSessionId);
                                    if (currentState && currentState.ws.readyState === WebSocket.OPEN) {
                                        try {
                                            console.log(`[Docker Initial Fetch] Fetching status for session ${newSessionId}...`);
                                            const statusPayload = await fetchRemoteDockerStatus(currentState);
                                            if (currentState.ws.readyState === WebSocket.OPEN) {
                                                currentState.ws.send(JSON.stringify({ type: 'docker:status:update', payload: statusPayload }));
                                            }
                                        } catch (error: any) {
                                            console.error(`[Docker Initial Fetch] Error fetching Docker status for session ${newSessionId}:`, error);
                                            if (currentState.ws.readyState === WebSocket.OPEN) {
                                                 // Send specific error type for initial fetch failure
                                                 const errorMessage = error.message || 'Unknown error during initial fetch';
                                                 const isUnavailable = errorMessage.includes('command not found') || errorMessage.includes('Cannot connect to the Docker daemon');
                                                 if (isUnavailable) {
                                                     currentState.ws.send(JSON.stringify({ type: 'docker:status:update', payload: { available: false, containers: [] } }));
                                                 } else {
                                                     currentState.ws.send(JSON.stringify({ type: 'docker:status:error', payload: { message: `Initial Docker status fetch failed: ${errorMessage}` } }));
                                                 }
                                            }
                                        }
                                    }
                                })();


                            } catch (shellError: any) {
                                console.error(`SSH: 会话 ${newSessionId} 打开 Shell 失败:`, shellError);
                                // 记录审计日志：打开 Shell 失败
                                auditLogService.logAction('SSH_SHELL_FAILURE', {
                                    userId: ws.userId,
                                    username: ws.username,
                                    connectionId: dbConnectionId,
                                    sessionId: newSessionId,
                                    ip: newState.ipAddress,
                                    reason: shellError.message
                                });
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `打开 Shell 失败: ${shellError.message}` }));
                                cleanupClientConnection(newSessionId);
                            }

                            // 10. 设置 SSH Client 的关闭和错误处理 (移到 Shell 成功打开之后)
                            sshClient.on('close', () => {
                                console.log(`SSH: 会话 ${newSessionId} 的客户端连接已关闭。`);
                                cleanupClientConnection(newSessionId);
                            });
                            sshClient.on('error', (err: Error) => {
                                console.error(`SSH: 会话 ${newSessionId} 的客户端连接错误:`, err);
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `SSH 连接错误: ${err.message}` }));
                                cleanupClientConnection(newSessionId);
                            });

                        } catch (connectError: any) {
                            console.error(`WebSocket: 用户 ${ws.username} (IP: ${clientIp}) 连接到数据库 ID ${dbConnectionId} 失败:`, connectError);
                            // 记录审计日志：SSH 连接失败
                            auditLogService.logAction('SSH_CONNECT_FAILURE', {
                                userId: ws.userId,
                                username: ws.username,
                                connectionId: dbConnectionId,
                                ip: clientIp,
                                reason: connectError.message
                            });
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `连接失败: ${connectError.message}` }));
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

                    // --- REFACTORED: Handle Docker Status Request ---
                    case 'docker:get_status': {
                        if (!state) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但无活动会话状态。`);
                            ws.send(JSON.stringify({ type: 'docker:status:error', payload: { message: 'Session state not found.' } }));
                            return;
                        }
                         if (!state.sshClient) {
                             console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但无活动 SSH 连接。`);
                             ws.send(JSON.stringify({ type: 'docker:status:error', payload: { message: 'SSH connection not active.' } }));
                             return;
                         }
                        console.log(`WebSocket: 处理来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求 (手动触发)...`);
                        try {
                            // Call the reusable function
                            const statusPayload = await fetchRemoteDockerStatus(state);
                            ws.send(JSON.stringify({ type: 'docker:status:update', payload: statusPayload }));
                        } catch (error: any) {
                            console.error(`WebSocket: 手动执行远程 Docker 状态命令失败 for session ${sessionId}:`, error);
                            const errorMessage = error.message || 'Unknown error fetching status';
                            // Send specific error if Docker unavailable, general error otherwise
                            const isUnavailable = errorMessage.includes('command not found') || errorMessage.includes('Cannot connect to the Docker daemon');
                            if (isUnavailable) {
                                ws.send(JSON.stringify({ type: 'docker:status:update', payload: { available: false, containers: [] } }));
                            } else {
                                ws.send(JSON.stringify({ type: 'docker:status:error', payload: { message: `Failed to get remote Docker status: ${errorMessage}` } }));
                            }
                        }
                        break;
                    } // end case 'docker:get_status' (Refactored)

                    // --- NEW: Handle Docker Command Execution ---
                    case 'docker:command': {
                         if (!state || !state.sshClient) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但无活动 SSH 连接。`);
                            ws.send(JSON.stringify({ type: 'docker:command:error', payload: { command: payload?.command, message: 'SSH connection not active.' } }));
                            return;
                        }
                        const { containerId, command } = payload || {};
                         if (!containerId || typeof containerId !== 'string' || !command || !['start', 'stop', 'restart', 'remove'].includes(command)) {
                             console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的无效 ${type} 请求。Payload:`, payload);
                             ws.send(JSON.stringify({ type: 'docker:command:error', payload: { command: command, message: 'Invalid containerId or command.' } }));
                             return;
                         }

                        // --- 添加日志 ---
                        console.log(`WebSocket: Received docker:command. Raw Payload:`, payload);
                        console.log(`WebSocket: Validating containerId: "${containerId}" (Type: ${typeof containerId}), Command: "${command}" (Type: ${typeof command})`);
                        // --- 结束日志 ---

                         // 验证逻辑:
                         if (!containerId || typeof containerId !== 'string' || !command || !['start', 'stop', 'restart', 'remove'].includes(command)) {
                             console.error(`WebSocket: Validation FAILED for docker:command. Payload:`, payload); // 增加失败日志
                             ws.send(JSON.stringify({ type: 'docker:command:error', payload: { command: command, message: 'Invalid containerId or command.' } }));
                             return;
                         }

                        console.log(`WebSocket: Validation PASSED for docker:command.`); // 增加成功日志
                        console.log(`WebSocket: Processing command '${command}' for container '${containerId}' on session ${sessionId}...`);
                        try {
                             // Sanitize containerId (basic) - more robust validation might be needed
                             const cleanContainerId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
                             if (!cleanContainerId) throw new Error('Invalid container ID format after sanitization.');

                             let dockerCliCommand: string;
                             switch (command) {
                                 case 'start': dockerCliCommand = `docker start ${cleanContainerId}`; break;
                                 case 'stop': dockerCliCommand = `docker stop ${cleanContainerId}`; break;
                                 case 'restart': dockerCliCommand = `docker restart ${cleanContainerId}`; break;
                                 case 'remove': dockerCliCommand = `docker rm -f ${cleanContainerId}`; break; // Use -f for remove
                                 default: throw new Error(`Unsupported command: ${command}`); // Should be caught by earlier validation
                             }

                             // Execute command remotely
                             await new Promise<void>((resolve, reject) => {
                                 state.sshClient.exec(dockerCliCommand, { pty: false }, (err, stream) => {
                                     if (err) return reject(err);
                                     let stderr = '';
                                     stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
                                     stream.on('close', (code: number | null) => {
                                         if (code === 0) {
                                             console.log(`WebSocket: 远程 Docker 命令 (${dockerCliCommand}) on session ${sessionId} 执行成功。`);
                                             resolve();
                                         } else {
                                             console.error(`WebSocket: 远程 Docker 命令 (${dockerCliCommand}) on session ${sessionId} 执行失败 (Code: ${code}). Stderr: ${stderr}`);
                                             reject(new Error(`Command failed with code ${code}. ${stderr || 'No stderr output.'}`));
                                         }
                                     });
                                      // Add type annotation for execErr
                                      stream.on('error', (execErr: Error) => reject(execErr));
                                 });
                             });
                             // Optionally send a success confirmation back? Not strictly needed if status updates quickly.
                             // ws.send(JSON.stringify({ type: 'docker:command:success', payload: { command, containerId } }));

                             // Trigger a status update after command execution
                             // Use a small delay to allow Docker daemon to potentially update state
                             setTimeout(() => {
                                 if (clientStates.has(sessionId!)) { // Check if session still exists
                                     ws.send(JSON.stringify({ type: 'request_docker_status_update' })); // Ask frontend to re-request
                                     // Or directly trigger backend fetch and push:
                                     // handleDockerGetStatus(ws, state); // Need to refactor get_status logic into a reusable function
                                 }
                             }, 500);


                        } catch (error: any) {
                             console.error(`WebSocket: 执行远程 Docker 命令 (${command} for ${containerId}) 失败 for session ${sessionId}:`, error);
                             ws.send(JSON.stringify({ type: 'docker:command:error', payload: { command, containerId, message: `Failed to execute remote command: ${error.message}` } }));
                        }
                        break;
                    } // end case 'docker:command'


                    // --- SFTP Cases ---
                    case 'sftp:readdir':
                    case 'sftp:stat':
                    case 'sftp:readfile':
                    case 'sftp:writefile':
                    case 'sftp:mkdir':
                    case 'sftp:rmdir':
                    case 'sftp:unlink':
                    case 'sftp:rename':
                    case 'sftp:chmod':
                    case 'sftp:realpath': {
                        if (!sessionId || !state) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} 的 SFTP 请求 (${type})，但无活动会话。`);
                            const errPayload: { message: string; requestId?: string } = { message: '无效的会话' };
                            if (requestId) errPayload.requestId = requestId;
                            ws.send(JSON.stringify({ type: 'sftp_error', payload: errPayload }));
                            return;
                        }
                        if (!requestId) {
                            console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 SFTP 请求 (${type})，但缺少 requestId。`);
                            ws.send(JSON.stringify({ type: 'sftp_error', payload: { message: `SFTP 操作 ${type} 缺少 requestId` } }));
                            return;
                        }
                        // TODO: 在这里或 SftpService 内部添加 SFTP 操作的审计日志记录 (可选)
                        // 例如: auditLogService.logAction('SFTP_ACTION', { type, path: payload?.path, userId: ws.userId, ip: state.ipAddress });
                        try {
                            switch (type) {
                                case 'sftp:readdir':
                                    if (payload?.path) sftpService.readdir(sessionId, payload.path, requestId);
                                    else throw new Error("Missing 'path' in payload for readdir");
                                    break;
                                case 'sftp:stat':
                                    if (payload?.path) sftpService.stat(sessionId, payload.path, requestId);
                                    else throw new Error("Missing 'path' in payload for stat");
                                    break;
                                case 'sftp:readfile':
                                     if (payload?.path) sftpService.readFile(sessionId, payload.path, requestId);
                                     else throw new Error("Missing 'path' in payload for readfile");
                                     break;
                                case 'sftp:writefile':
                                    const fileContent = payload?.content ?? payload?.data ?? '';
                                    if (payload?.path) {
                                        const dataToSend = (typeof fileContent === 'string') ? fileContent : '';
                                        sftpService.writefile(sessionId, payload.path, dataToSend, requestId);
                                    } else throw new Error("Missing 'path' in payload for writefile");
                                    break;
                                case 'sftp:mkdir':
                                     if (payload?.path) sftpService.mkdir(sessionId, payload.path, requestId);
                                     else throw new Error("Missing 'path' in payload for mkdir");
                                     break;
                                case 'sftp:rmdir':
                                     if (payload?.path) sftpService.rmdir(sessionId, payload.path, requestId);
                                     else throw new Error("Missing 'path' in payload for rmdir");
                                     break;
                                case 'sftp:unlink':
                                     if (payload?.path) sftpService.unlink(sessionId, payload.path, requestId);
                                     else throw new Error("Missing 'path' in payload for unlink");
                                     break;
                                case 'sftp:rename':
                                     if (payload?.oldPath && payload?.newPath) sftpService.rename(sessionId, payload.oldPath, payload.newPath, requestId);
                                     else throw new Error("Missing 'oldPath' or 'newPath' in payload for rename");
                                     break;
                                case 'sftp:chmod':
                                     if (payload?.path && typeof payload?.mode === 'number') sftpService.chmod(sessionId, payload.path, payload.mode, requestId);
                                     else throw new Error("Missing 'path' or invalid 'mode' in payload for chmod");
                                     break;
                                case 'sftp:realpath':
                                    if (payload?.path) sftpService.realpath(sessionId, payload.path, requestId);
                                    else throw new Error("Missing 'path' in payload for realpath");
                                    break;
                                default: throw new Error(`Unhandled SFTP type: ${type}`);
                            }
                        } catch (sftpCallError: any) {
                             console.error(`WebSocket: Error preparing/calling SFTP service for ${type} (Request ID: ${requestId}):`, sftpCallError);
                             ws.send(JSON.stringify({ type: 'sftp_error', payload: { message: `处理 SFTP 请求 ${type} 时出错: ${sftpCallError.message}`, requestId } }));
                        }
                        break;
                    }
                    // --- SFTP 文件上传 ---
                    case 'sftp:upload:start': {
                        if (!sessionId || !state) {
                            console.warn(`WebSocket: 收到来自 ${ws.username} 的 SFTP 请求 (${type})，但无活动会话。`);
                            ws.send(JSON.stringify({ type: 'sftp:upload:error', payload: { uploadId: payload?.uploadId, message: '无效的会话' } }));
                            return;
                        }
                        if (!payload?.uploadId || !payload?.remotePath || typeof payload?.size !== 'number') {
                            console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但缺少 uploadId, remotePath 或 size。`);
                            ws.send(JSON.stringify({ type: 'sftp:upload:error', payload: { uploadId: payload?.uploadId, message: '缺少 uploadId, remotePath 或 size' } }));
                            return;
                        }
                        // TODO: Add audit log for SFTP upload start?
                        sftpService.startUpload(sessionId, payload.uploadId, payload.remotePath, payload.size);
                        break;
                    }
                    case 'sftp:upload:chunk': {
                        if (!sessionId || !state) return;
                         if (!payload?.uploadId || typeof payload?.chunkIndex !== 'number' || !payload?.data) {
                            console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但缺少 uploadId, chunkIndex 或 data。`);
                            return;
                        }
                        sftpService.handleUploadChunk(sessionId, payload.uploadId, payload.chunkIndex, payload.data);
                        break;
                    }
                    case 'sftp:upload:cancel': {
                         if (!sessionId || !state) return;
                         if (!payload?.uploadId) {
                            console.error(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但缺少 uploadId。`);
                            ws.send(JSON.stringify({ type: 'sftp:upload:error', payload: { uploadId: payload?.uploadId, message: '缺少 uploadId' } }));
                            return;
                        }
                        // TODO: Add audit log for SFTP upload cancel?
                        sftpService.cancelUpload(sessionId, payload.uploadId);
                        break;
                    }

                    // --- NEW CASE: Handle docker:get_stats ---
                    case 'docker:get_stats': {
                        if (!state || !state.sshClient) { // Check state and sshClient
                            console.warn(`WebSocket: 收到来自 ${ws.username} (会话: ${sessionId}) 的 ${type} 请求，但无活动 SSH 连接。`);
                            ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId: payload?.containerId, message: 'SSH connection not active.' } }));
                            return; // Use return instead of break inside switch
                        }
                        if (!payload || !payload.containerId) {
                            console.warn(`WebSocket: Invalid payload for docker:get_stats in session ${sessionId}:`, payload);
                            ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId: payload?.containerId, message: 'Missing containerId.' } }));
                            return;
                        }

                        const containerId = payload.containerId;
                        console.log(`WebSocket: Handling docker:get_stats for container ${containerId} in session ${sessionId}`);
                        const command = `docker stats ${containerId} --no-stream --format '{{json .}}'`;

                        try {
                            // --- FIX: Use sshClient.exec directly ---
                            const execResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                                let stdout = '';
                                let stderr = '';
                                state.sshClient.exec(command, { pty: false }, (err, stream) => {
                                    if (err) return reject(err);
                                    stream.on('data', (data: Buffer) => { stdout += data.toString(); });
                                    stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
                                    stream.on('close', (code: number | null) => {
                                        // Don't reject on non-zero exit code here, stderr check is more reliable for docker stats
                                        resolve({ stdout, stderr });
                                    });
                                    stream.on('error', (execErr: Error) => reject(execErr));
                                });
                            });
                            // --- End FIX ---

                            if (execResult.stderr) {
                                // Handle cases like container not found or docker errors
                                console.error(`WebSocket: Docker stats stderr for ${containerId} in session ${sessionId}: ${execResult.stderr}`);
                                ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId, message: execResult.stderr.trim() || 'Error executing stats command.' } }));
                                return; // Use return after sending error
                            }

                            if (!execResult.stdout) {
                                console.warn(`WebSocket: No stats output for container ${containerId} in session ${sessionId}. Might be stopped or error occurred.`);
                                // Check stderr again just in case, although previous check should catch most errors
                                if (!execResult.stderr) {
                                     ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId, message: 'No stats data received (container might be stopped).' } }));
                                }
                                return; // Use return after sending error or warning
                            }

                            try {
                                const statsData = JSON.parse(execResult.stdout.trim());
                                // Optional: Clean up or format statsData if needed before sending
                                ws.send(JSON.stringify({ type: 'docker:stats:update', payload: { containerId, stats: statsData } }));
                            } catch (parseError) {
                                console.error(`WebSocket: Failed to parse docker stats JSON for ${containerId} in session ${sessionId}: ${execResult.stdout}`, parseError);
                                ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId, message: 'Failed to parse stats data.' } }));
                            }

                        } catch (error: any) {
                            console.error(`WebSocket: Failed to execute docker stats for ${containerId} in session ${sessionId}:`, error);
                            ws.send(JSON.stringify({ type: 'docker:stats:error', payload: { containerId, message: error.message || 'Failed to fetch Docker stats.' } }));
                        }
                        break; // Break after handling the case
                    } // --- END CASE: docker:get_stats ---


                    default:
                        console.warn(`WebSocket：收到来自 ${ws.username} (会话: ${sessionId}) 的未知消息类型: ${type}`);
                        ws.send(JSON.stringify({ type: 'error', payload: `不支持的消息类型: ${type}` }));
                }
            } catch (error: any) {
                console.error(`WebSocket: 处理来自 ${ws.username} (会话: ${sessionId}) 的消息 (${type}) 时发生顶层错误:`, error);
                ws.send(JSON.stringify({ type: 'error', payload: `处理消息时发生内部错误: ${error.message}` }));
            }
        });

        // --- 连接关闭和错误处理 ---
        ws.on('close', (code, reason) => {
            console.log(`WebSocket：客户端 ${ws.username} (会话: ${ws.sessionId}) 已断开连接。代码: ${code}, 原因: ${reason.toString()}`);
            cleanupClientConnection(ws.sessionId);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket：客户端 ${ws.username} (会话: ${ws.sessionId}) 发生错误:`, error);
            cleanupClientConnection(ws.sessionId);
        });
    });

    // --- WebSocket 服务器关闭处理 ---
    wss.on('close', () => {
        console.log('WebSocket 服务器正在关闭，清理心跳定时器和所有活动会话...');
        clearInterval(heartbeatInterval);
        clientStates.forEach((state, sessionId) => {
            cleanupClientConnection(sessionId);
        });
        console.log('所有活动会话已清理。');
    });

    console.log('WebSocket 服务器初始化完成。');
    return wss;
};

// --- 移除旧的辅助函数 ---
