import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { Request, RequestHandler } from 'express';
import { Client, ClientChannel, SFTPWrapper, Stats } from 'ssh2'; // 引入 SFTPWrapper 和 Stats
import { WriteStream } from 'fs'; // 需要 WriteStream 类型 (虽然 ssh2 的流类型不同，但可以借用)
import { getDb } from './database'; // 引入数据库实例
 import { decrypt } from './utils/crypto'; // 引入解密函数
 import path from 'path'; // 需要 path
 // import { HttpsProxyAgent } from 'https-proxy-agent'; // 不再直接使用 HttpsProxyAgent for SSH tunneling
 import { SocksClient } from 'socks'; // 引入 SOCKS 代理支持
 // import http from 'http'; // 重复导入，保留上面的
 import net from 'net'; // 引入 net 用于 Socket 类型

// 扩展 WebSocket 类型以包含会话和 SSH/SFTP 连接信息
interface AuthenticatedWebSocket extends WebSocket {
    isAlive?: boolean;
    userId?: number;
    username?: string;
    sshClient?: Client; // 关联的 SSH Client 实例
    sshShellStream?: ClientChannel; // 关联的 SSH Shell Stream
    sftpStream?: SFTPWrapper; // 关联的 SFTP Stream
    statusIntervalId?: NodeJS.Timeout; // 用于存储状态轮询的 Interval ID
}

// 存储活跃的 SSH/SFTP 连接 (导出以便其他模块访问)
export const activeSshConnections = new Map<AuthenticatedWebSocket, { client: Client, shell: ClientChannel, sftp?: SFTPWrapper, statusIntervalId?: NodeJS.Timeout }>();

// 存储正在进行的 SFTP 上传操作 (key: uploadId, value: WriteStream)
// 注意：WriteStream 类型来自 'fs'，但 ssh2 的流行为类似
const activeUploads = new Map<string, WriteStream>();

// 数据库连接信息接口 (包含所有可能的凭证字段和 proxy_id)
interface DbConnectionInfo {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    encrypted_password?: string | null;
    encrypted_private_key?: string | null;
    encrypted_passphrase?: string | null;
    proxy_id?: number | null; // 关联的代理 ID
    // 其他字段...
}

// 新增：数据库代理信息接口
interface DbProxyInfo {
    id: number;
    name: string;
    type: 'SOCKS5' | 'HTTP';
    host: string;
    port: number;
    username?: string | null;
    encrypted_password?: string | null;
}


/**
 * 清理指定 WebSocket 连接关联的 SSH 资源
 * @param ws - WebSocket 连接实例
 */
const cleanupSshConnection = (ws: AuthenticatedWebSocket) => {
    const connection = activeSshConnections.get(ws);
    if (connection) {
        console.log(`WebSocket: 清理用户 ${ws.username} 的 SSH/SFTP 连接...`);
        // 注意：SFTP 流通常不需要显式关闭，它依赖于 SSH Client 的关闭
        // connection.sftp?.end(); // SFTPWrapper 没有 end 方法
        connection.shell?.end(); // 尝试结束 shell 流
        // 清除状态轮询定时器
        if (connection.statusIntervalId) {
            clearInterval(connection.statusIntervalId);
            console.log(`WebSocket: 清理用户 ${ws.username} 的状态轮询定时器。`);
        }
        connection.client?.end(); // 结束 SSH 客户端连接会隐式关闭 SFTP
        activeSshConnections.delete(ws); // 从 Map 中移除
    }
};

// --- 状态获取相关 ---
const STATUS_POLL_INTERVAL = 1000; // 每 5 秒获取一次状态

// Helper function to execute a command and return its stdout
const executeSshCommand = (client: Client, command: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        let output = '';
        let stderrOutput = ''; // Capture stderr too
        client.exec(command, (err, stream) => {
            if (err) {
                 console.error(`SSH Command (${command}) exec error:`, err);
                 return reject(err); // Reject on initial exec error
            }
            stream.on('data', (data: Buffer) => {
                output += data.toString();
            }).stderr.on('data', (data: Buffer) => {
                stderrOutput += data.toString(); // Capture stderr
                // Log stderr as warning, but don't reject based on it unless needed
                // console.warn(`SSH Command (${command}) stderr: ${data.toString().trim()}`);
            }).on('close', (code: number | null | undefined, signal: string | null) => {
                const trimmedOutput = output.trim();
                const trimmedStderr = stderrOutput.trim();

                if (signal) {
                    console.error(`Command "${command}" terminated by signal: ${signal}. Stderr: ${trimmedStderr}`);
                    return reject(new Error(`Command "${command}" terminated by signal: ${signal}`));
                }

                // **Crucial Change:** Prioritize resolving if we have ANY stdout, regardless of exit code.
                if (trimmedOutput) {
                    if (code !== 0 && code != null) {
                         console.warn(`Command "${command}" exited with code ${code} but produced output. Resolving with output. Stderr: ${trimmedStderr}`);
                    } else if (code == null) {
                         console.warn(`Command "${command}" exited with code undefined but produced output. Resolving with output. Stderr: ${trimmedStderr}`);
                    }
                    return resolve(trimmedOutput);
                }

                // If NO stdout, then reject based on error code or lack thereof.
                if (code !== 0 && code != null) {
                    console.error(`Command "${command}" failed with code ${code} and no output. Stderr: ${trimmedStderr}`);
                    return reject(new Error(`Command "${command}" failed with code ${code} and no output. Stderr: ${trimmedStderr}`));
                }
                if (code == null) {
                    // This case now specifically means no output AND undefined code - likely a genuine failure
                    console.error(`Command "${command}" failed with code undefined and no output. Stderr: ${trimmedStderr}`);
                    return reject(new Error(`Command "${command}" failed with code undefined and no output. Stderr: ${trimmedStderr}`));
                }

                // If code is 0 and no output, resolve with empty string (command succeeded but printed nothing)
                resolve('');

            }).on('error', (streamErr: Error) => { // Handle stream-specific errors
                reject(streamErr);
            });
        });
    });
};

// Interface for the detailed status object
interface ServerStatusDetails {
    cpuPercent?: number; // Percentage
    memPercent?: number; // Percentage
    memUsed?: number; // MB
    memTotal?: number; // MB
    swapPercent?: number; // Percentage
    swapUsed?: number; // MB
    swapTotal?: number; // MB
    diskPercent?: number; // Percentage for /
    diskUsed?: number; // KB
    diskTotal?: number; // KB
    cpuModel?: string;
    netRxRate?: number; // Bytes per second
    netTxRate?: number; // Bytes per second
    netInterface?: string; // Detected network interface
    osName?: string; // Added OS Name
}

// Store previous network stats for rate calculation
interface NetStats {
    rx: number;
    tx: number;
    timestamp: number;
}
const previousNetStats = new Map<AuthenticatedWebSocket, NetStats>();


// Function to fetch server status metrics
const fetchServerStatus = async (ws: AuthenticatedWebSocket, client: Client): Promise<ServerStatusDetails> => {
    const status: ServerStatusDetails = {};
    const connection = activeSshConnections.get(ws); // Needed for network stats

    try {
        // CPU Usage (%) using vmstat (100 - idle)
        // Try vmstat first
        try {
            const cpuCmd = `vmstat 1 2 | tail -1 | awk '{print 100-$15}'`;
            const cpuOutput = await executeSshCommand(client, cpuCmd);
            const cpuUsage = parseFloat(cpuOutput);
            if (!isNaN(cpuUsage)) status.cpuPercent = parseFloat(cpuUsage.toFixed(1));
        } catch (vmstatError) {
             console.warn(`获取 CPU 使用率失败 (vmstat):`, vmstatError, `尝试 top...`);
             // Fallback attempt using top if vmstat failed
             try {
                const cpuCmdFallback = `top -bn1 | grep '%Cpu(s)' | head -1 | awk '{print $2+$4}'`; // Sum User + System CPU %
                const cpuOutputFallback = await executeSshCommand(client, cpuCmdFallback);
                const cpuUsageFallback = parseFloat(cpuOutputFallback);
                if (!isNaN(cpuUsageFallback)) status.cpuPercent = parseFloat(cpuUsageFallback.toFixed(1));
             } catch (topError) {
                 console.warn(`获取 CPU 使用率失败 (top fallback):`, topError);
             }
        }
    } catch (error) { // Catch potential outer errors, though unlikely now
        console.error(`获取 CPU 使用率时发生意外错误:`, error);
    }

    // --- Corrected CPU Model Fetch ---
    try {
        // CPU Model Name from /proc/cpuinfo
        const cpuModelCmd = `cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d ':' -f 2 | sed 's/^[ \t]*//'`;
        const cpuModelOutput = await executeSshCommand(client, cpuModelCmd); // Use correct command and variable
        if (cpuModelOutput) status.cpuModel = cpuModelOutput;
    } catch (error) { // Use standard 'error' variable name and remove the incorrect logic/extra brace
        console.warn(`获取 CPU 型号失败:`, error);
    }
    // Removed duplicated CPU Model fetch block here (Comment remains from previous step, actual change is above)

    // --- Fetch OS Name ---
    try {
        const osCmd = `cat /etc/os-release`;
        const osOutput = await executeSshCommand(client, osCmd);
        const lines = osOutput.split('\n');
        const prettyNameLine = lines.find(line => line.startsWith('PRETTY_NAME='));
        if (prettyNameLine) {
            // Extract value, remove potential quotes
            status.osName = prettyNameLine.split('=')[1]?.trim().replace(/^"(.*)"$/, '$1');
        } else {
            // Fallback or alternative methods if needed (e.g., uname -a)
            const unameCmd = `uname -a`; // Less pretty, but usually available
            const unameOutput = await executeSshCommand(client, unameCmd);
            if (unameOutput) status.osName = unameOutput.trim(); // Trim uname output
        }
    } catch (error) {
        console.warn(`获取操作系统名称失败:`, error);
        // Attempt uname as a last resort even if os-release failed
        try {
            const unameCmd = `uname -a`;
            const unameOutput = await executeSshCommand(client, unameCmd);
            if (unameOutput) status.osName = unameOutput.trim(); // Trim uname output
        } catch (unameError) {
             console.warn(`获取操作系统名称失败 (uname fallback):`, unameError);
        }
    }


    try {
        // Memory Usage (Total and Used in MB, and Percentage)
        const memCmd = `free -m | awk 'NR==2{print $2 " " $3}'`; // Output: "total used"
        const memOutput = await executeSshCommand(client, memCmd);
        const memValues = memOutput.split(' ');
        if (memValues.length === 2) {
            const total = parseInt(memValues[0], 10);
            const used = parseInt(memValues[1], 10);
            if (!isNaN(total) && !isNaN(used) && total > 0) {
                status.memTotal = total;
                status.memUsed = used;
                status.memPercent = parseFloat(((used / total) * 100).toFixed(1));
            }
        }
    } catch (error) {
        console.warn(`获取内存状态失败:`, error);
    }
    // Removed duplicated Memory fetch block here

     try {
        // Swap Usage (Total and Used in MB, and Percentage)
        const swapCmd = `free -m | awk 'NR==3{print $2 " " $3}'`; // Output: "total used" for swap
        const swapOutput = await executeSshCommand(client, swapCmd);
        const swapValues = swapOutput.split(' ');
        if (swapValues.length === 2) {
            const total = parseInt(swapValues[0], 10);
            const used = parseInt(swapValues[1], 10);
            // Only report swap if total > 0
            if (!isNaN(total) && !isNaN(used) && total > 0) {
                status.swapTotal = total;
                status.swapUsed = used;
                status.swapPercent = parseFloat(((used / total) * 100).toFixed(1));
            } else if (!isNaN(total) && total === 0) {
                 status.swapTotal = 0;
                 status.swapUsed = 0;
                 status.swapPercent = 0;
            }
        }
    } catch (error) {
        console.warn(`获取 Swap 状态失败:`, error);
    }


    try {
        // Disk Usage - Using POSIX standard output 'df -Pk /' for reliable parsing
        const diskCmd = `df -Pk /`; // Use -P flag for POSIX standard output
        const diskOutput = await executeSshCommand(client, diskCmd);
        const lines = diskOutput.trim().split('\n'); // Trim output and split into lines

        if (lines.length >= 2) {
            // Skip header line (usually the first line)
            let dataLine = '';
            // Find the line ending with ' /' (mount point)
            for (let i = 1; i < lines.length; i++) {
                // Trim the line before checking the ending
                if (lines[i].trim().endsWith(' /')) {
                    dataLine = lines[i].trim();
                    break;
                }
            }

            // The second line (index 1) should contain the data in POSIX format
            if (lines.length >= 2) {
                const dataLine = lines[1].trim();
                console.log(`[Disk P Debug] dataLine: "${dataLine}"`); // Log the line
                const parts = dataLine.split(/\s+/);
                console.log(`[Disk P Debug] parts:`, parts); // Log the split parts
                // POSIX format: Filesystem, 1024-blocks (Total), Used, Available, Capacity, Mounted on
                if (parts.length >= 4) { // Need at least up to 'Available' column
                    const totalKb = parseInt(parts[1], 10);
                    const usedKb = parseInt(parts[2], 10);
                    // const availableKb = parseInt(parts[3], 10); // Available if needed
                    // const capacityPercent = parts[4]; // Percentage string like "20%"

                    if (!isNaN(totalKb) && !isNaN(usedKb) && totalKb >= 0) {
                        status.diskTotal = totalKb;
                        status.diskUsed = usedKb;
                        // Calculate percent only if total > 0 to avoid division by zero
                        status.diskPercent = totalKb > 0 ? parseFloat(((usedKb / totalKb) * 100).toFixed(1)) : 0;
                        // Optional: Could also try parsing parts[4] if calculation seems off
                    } else {
                        console.warn(`无法从 'df -Pk /' 行解析有效的磁盘大小 (Total=${parts[1]}, Used=${parts[2]}):`, dataLine);
                    }
                } else {
                     console.warn(`'df -Pk /' 数据行格式不符合预期 (列数不足):`, dataLine);
                }
            } else {
                console.warn(`无法从 'df -k /' 输出中找到根目录 ('/') 的数据行:`, diskOutput);
            }
        } else {
            console.warn(`'df -k /' 命令输出格式不符合预期 (行数不足):`, diskOutput);
        }
    } catch (error) {
        console.warn(`获取磁盘状态失败 (df -k):`, error);
    }

    // Network Rate Calculation
    let defaultInterface = '';
    try {
        const routeCmd = `ip route | grep default | awk '{print $5}' | head -1`;
        defaultInterface = await executeSshCommand(client, routeCmd);
        status.netInterface = defaultInterface; // Store detected interface
    } catch (error) {
        console.warn(`获取默认网络接口失败:`, error);
    }

    if (defaultInterface && connection) {
        try {
            const netCmd = `cat /proc/net/dev | grep '${defaultInterface}:' | awk '{print $2 " " $10}'`; // RX bytes (col 2), TX bytes (col 10)
            const netOutput = await executeSshCommand(client, netCmd);
            const netValues = netOutput.split(' ');
            if (netValues.length === 2) {
                const currentRx = parseInt(netValues[0], 10);
                const currentTx = parseInt(netValues[1], 10);
                const currentTime = Date.now();

                const prevStats = previousNetStats.get(ws);

                if (prevStats && !isNaN(currentRx) && !isNaN(currentTx)) {
                    const timeDiffSeconds = (currentTime - prevStats.timestamp) / 1000;
                    if (timeDiffSeconds > 0) {
                        status.netRxRate = Math.max(0, Math.round((currentRx - prevStats.rx) / timeDiffSeconds)); // Corrected property name
                        status.netTxRate = Math.max(0, Math.round((currentTx - prevStats.tx) / timeDiffSeconds)); // Corrected property name
                    }
                }

                // Store current stats for next calculation
                if (!isNaN(currentRx) && !isNaN(currentTx)) {
                     previousNetStats.set(ws, { rx: currentRx, tx: currentTx, timestamp: currentTime });
                }
            }
        } catch (error) {
            console.warn(`获取网络速率失败 (${defaultInterface}):`, error);
        }
    } else if (!defaultInterface) {
         console.warn(`无法计算网络速率，因为未找到默认接口。`);
    }

    return status;
};

// Function to start status polling for a connection
const startStatusPolling = (ws: AuthenticatedWebSocket, client: Client) => {
    const connection = activeSshConnections.get(ws);
    if (!connection || connection.statusIntervalId) {
        console.warn(`用户 ${ws.username} 的状态轮询已启动或连接不存在。`);
        return; // Already polling or connection gone
    }

    console.log(`WebSocket: 为用户 ${ws.username} 启动状态轮询 (间隔: ${STATUS_POLL_INTERVAL}ms)...`);

    const intervalId = setInterval(async () => {
        // Double check connection still exists before fetching
        const currentConnection = activeSshConnections.get(ws);
        if (!currentConnection || !currentConnection.client || !ws || ws.readyState !== WebSocket.OPEN) {
            console.log(`WebSocket: 用户 ${ws.username} 连接已关闭或无效，停止状态轮询。`);
            if (intervalId) clearInterval(intervalId); // Clear interval if connection is gone
             // Also ensure it's cleared from the map if cleanup didn't catch it
             if (currentConnection?.statusIntervalId === intervalId) {
                 delete currentConnection.statusIntervalId;
             }
             previousNetStats.delete(ws); // Clear previous stats on disconnect/error
            return;
        }

        try {
            const status = await fetchServerStatus(ws, currentConnection.client); // Pass ws for net stats map
            // Send status only if we got at least one metric
            if (Object.keys(status).length > 0) {
                 // console.log(`[Status Poll] Sending status for ${ws.username}:`, status); // Debug log
                 ws.send(JSON.stringify({ type: 'ssh:status:update', payload: status }));
            }
        } catch (error) {
            console.error(`用户 ${ws.username} 状态轮询时出错:`, error);
            // Optionally send an error message to the client
            // ws.send(JSON.stringify({ type: 'ssh:status:error', payload: '无法获取服务器状态' }));
            // Consider stopping polling if errors persist? For now, continue polling.
        }
    }, STATUS_POLL_INTERVAL);

    connection.statusIntervalId = intervalId; // Store the interval ID
    // Initialize previous network stats
    previousNetStats.set(ws, { rx: 0, tx: 0, timestamp: Date.now() - STATUS_POLL_INTERVAL }); // Initialize with dummy past data
};

export const initializeWebSocket = (server: http.Server, sessionParser: RequestHandler): WebSocketServer => {
    const wss = new WebSocketServer({ noServer: true });
    const db = getDb(); // 获取数据库实例

    const interval = setInterval(() => {
        wss.clients.forEach((ws: WebSocket) => {
            const extWs = ws as AuthenticatedWebSocket;
            if (extWs.isAlive === false) {
                console.log(`WebSocket 心跳检测：用户 ${extWs.username} 连接无响应，正在终止...`);
                cleanupSshConnection(extWs); // 清理 SSH 资源
                return extWs.terminate();
            }
            extWs.isAlive = false;
            extWs.ping(() => {});
        });
    }, 60000); // Increased interval to 60 seconds

    server.on('upgrade', (request: Request, socket, head) => {
        // @ts-ignore
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

    wss.on('connection', (ws: AuthenticatedWebSocket, request: Request) => {
        ws.isAlive = true;
        console.log(`WebSocket：客户端 ${ws.username} (ID: ${ws.userId}) 已连接。`);

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (message) => {
            console.log(`WebSocket：收到来自 ${ws.username} 的消息: ${message.toString().substring(0, 100)}...`); // 截断长消息日志
            try {
                const parsedMessage = JSON.parse(message.toString());
                const connection = activeSshConnections.get(ws); // 获取当前连接信息
                const sftp = connection?.sftp; // 获取 SFTP 实例

                // 辅助函数发送错误消息
                const sendSftpError = (action: string, path: string | undefined, error: any, customMsg?: string) => {
                    const errorMessage = customMsg || (error instanceof Error ? error.message : String(error));
                    console.error(`SFTP: 用户 ${ws.username} 执行 ${action} 操作 ${path ? `于 ${path}` : ''} 失败:`, error);
                    ws.send(JSON.stringify({ type: `sftp:${action}:error`, path, payload: `${action} 失败: ${errorMessage}` }));
                };

                // 辅助函数发送成功消息
                const sendSftpSuccess = (action: string, path: string | undefined, payload?: any) => {
                     console.log(`SFTP: 用户 ${ws.username} 执行 ${action} 操作 ${path ? `于 ${path}` : ''} 成功。`);
                     ws.send(JSON.stringify({ type: `sftp:${action}:success`, path, payload }));
                };

                // 检查 SFTP 会话是否存在
                const ensureSftp = (action: string, path?: string): SFTPWrapper | null => {
                    if (!sftp) {
                        console.warn(`WebSocket: 收到来自 ${ws.username} 的 SFTP ${action} 请求，但无活动 SFTP 会话。`);
                        ws.send(JSON.stringify({ type: `sftp:${action}:error`, path, payload: 'SFTP 会话未初始化或已断开。' }));
                        return null;
                    }
                    return sftp;
                };


                switch (parsedMessage.type) {
                    // --- 处理 SSH 连接请求 ---
                    case 'ssh:connect': {
                        // 注意：ssh:connect 内部逻辑需要自行处理 sftp 实例的获取，不能依赖顶层的 sftp 变量
                        if (activeSshConnections.has(ws)) {
                            console.warn(`WebSocket: 用户 ${ws.username} 已有活动的 SSH 连接，忽略新的连接请求。`);
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: '已存在活动的 SSH 连接。' }));
                            return;
                        }

                        const connectionId = parsedMessage.payload?.connectionId;
                        if (!connectionId) {
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: '缺少 connectionId。' }));
                            return;
                        }

                        console.log(`WebSocket: 用户 ${ws.username} 请求连接到 ID: ${connectionId}`);
                        ws.send(JSON.stringify({ type: 'ssh:status', payload: '正在获取连接信息...' }));

                        // 1. 从数据库获取连接信息 (包括 proxy_id)
                        const connInfo = await new Promise<DbConnectionInfo | null>((resolve, reject) => {
                            db.get(
                                `SELECT id, name, host, port, username, auth_method, proxy_id,
                                        encrypted_password, encrypted_private_key, encrypted_passphrase
                                 FROM connections WHERE id = ?`, // 添加 proxy_id
                                [connectionId],
                                (err, row: DbConnectionInfo) => { // 类型已更新
                                    if (err) {
                                        console.error(`查询连接 ${connectionId} 详细信息时出错:`, err);
                                        return reject(new Error('查询连接信息失败'));
                                    }
                                    resolve(row ?? null);
                                }
                            );
                        });

                        if (!connInfo) {
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `未找到 ID 为 ${connectionId} 的连接配置。` }));
                            return;
                        }
                        if (!connInfo.encrypted_password) {
                             ws.send(JSON.stringify({ type: 'ssh:error', payload: '连接配置缺少密码信息。' }));
                             // This check might be too early if key auth is used
                             // ws.send(JSON.stringify({ type: 'ssh:error', payload: '连接配置缺少密码信息。' }));
                             // return;
                        }

                        // 2. 获取代理信息 (如果 connInfo.proxy_id 存在)
                        let proxyInfo: DbProxyInfo | null = null;
                        if (connInfo.proxy_id) {
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在获取代理 ${connInfo.proxy_id} 信息...` }));
                            try {
                                proxyInfo = await new Promise<DbProxyInfo | null>((resolve, reject) => {
                                    db.get(
                                        `SELECT id, name, type, host, port, username, encrypted_password FROM proxies WHERE id = ?`,
                                        [connInfo.proxy_id],
                                        (err, row: DbProxyInfo) => {
                                            if (err) return reject(new Error(`查询代理 ${connInfo.proxy_id} 失败: ${err.message}`));
                                            resolve(row ?? null);
                                        }
                                    );
                                });
                                if (!proxyInfo) {
                                    throw new Error(`未找到 ID 为 ${connInfo.proxy_id} 的代理配置。`);
                                }
                                console.log(`使用代理: ${proxyInfo.name} (${proxyInfo.type})`);
                            } catch (proxyError: any) {
                                console.error(`获取代理信息失败:`, proxyError);
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `获取代理信息失败: ${proxyError.message}` }));
                                return; // 获取代理失败则停止连接
                            }
                        }

                        ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在连接到 ${connInfo.host}...` }));

                        // 3. 解密凭证并构建连接配置
                        let connectConfig: any = {
                            host: connInfo.host,
                            port: connInfo.port,
                            username: connInfo.username,
                            keepaliveInterval: 30000, // Send keep-alive every 30 seconds (milliseconds)
                            keepaliveCountMax: 3,     // Disconnect after 3 missed keep-alives
                            readyTimeout: 20000 // 连接超时时间 (毫秒)
                        };

                        try {
                            if (connInfo.auth_method === 'password') {
                                if (!connInfo.encrypted_password) {
                                    throw new Error('连接配置缺少密码信息。');
                                }
                                connectConfig.password = decrypt(connInfo.encrypted_password);
                            } else if (connInfo.auth_method === 'key') {
                                if (!connInfo.encrypted_private_key) {
                                    throw new Error('连接配置缺少私钥信息。');
                                }
                                connectConfig.privateKey = decrypt(connInfo.encrypted_private_key);
                                if (connInfo.encrypted_passphrase) {
                                    connectConfig.passphrase = decrypt(connInfo.encrypted_passphrase);
                                }
                            } else {
                                throw new Error(`不支持的认证方式: ${connInfo.auth_method}`);
                            }
                        } catch (decryptError: any) {
                            console.error(`处理连接 ${connectionId} 凭证失败:`, decryptError);
                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `无法处理连接凭证: ${decryptError.message}` }));
                            return;
                        }

                        // 4. 处理代理配置（如果存在）并建立连接
                        const sshClient = new Client(); // 创建 SSH Client 实例

                        if (proxyInfo) {
                            console.log(`WebSocket: 检测到连接 ${connInfo.id} 使用代理 ${proxyInfo.id} (${proxyInfo.type})`);
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在应用代理 ${proxyInfo.name}...` }));
                            try {
                                let proxyPassword = '';
                                if (proxyInfo.encrypted_password) {
                                    proxyPassword = decrypt(proxyInfo.encrypted_password);
                                }

                                if (proxyInfo.type === 'SOCKS5') {
                                    const socksOptions = {
                                        proxy: {
                                            host: proxyInfo.host,
                                            port: proxyInfo.port,
                                            type: 5 as 5, // SOCKS 版本 5
                                            userId: proxyInfo.username || undefined,
                                            password: proxyPassword || undefined,
                                        },
                                        command: 'connect' as 'connect',
                                        destination: {
                                            host: connInfo.host,
                                            port: connInfo.port,
                                        },
                                        timeout: connectConfig.readyTimeout ?? 20000, // 使用连接超时时间
                                    };
                                    console.log(`WebSocket: 正在通过 SOCKS5 代理 ${proxyInfo.host}:${proxyInfo.port} 连接到目标 ${connInfo.host}:${connInfo.port}...`);
                                    ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在通过 SOCKS5 代理 ${proxyInfo.name} 连接...` }));

                                    SocksClient.createConnection(socksOptions)
                                        .then(({ socket }) => {
                                            console.log(`WebSocket: SOCKS5 代理连接成功。正在建立 SSH 连接...`);
                                            ws.send(JSON.stringify({ type: 'ssh:status', payload: 'SOCKS5 代理连接成功，正在建立 SSH...' }));
                                            connectConfig.sock = socket; // 使用建立的 SOCKS socket
                                            connectSshClient(ws, sshClient, connectConfig, connInfo); // 通过代理连接 SSH
                                        })
                                        .catch(socksError => {
                                            console.error(`WebSocket: SOCKS5 代理连接失败:`, socksError);
                                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `SOCKS5 代理连接失败: ${socksError.message}` }));
                                            cleanupSshConnection(ws);
                                        });
                                    // 注意：对于 SOCKS5，连接逻辑在 .then 回调中处理

                                } else if (proxyInfo.type === 'HTTP') {
                                    console.log(`WebSocket: 尝试通过 HTTP 代理 ${proxyInfo.host}:${proxyInfo.port} 建立隧道...`);
                                    ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在通过 HTTP 代理 ${proxyInfo.name} 建立隧道...` }));

                                    // 手动发起 CONNECT 请求
                                    const reqOptions: http.RequestOptions = {
                                        method: 'CONNECT',
                                        host: proxyInfo.host,
                                        port: proxyInfo.port,
                                        path: `${connInfo.host}:${connInfo.port}`, // 目标 SSH 服务器地址和端口
                                        timeout: connectConfig.readyTimeout ?? 20000,
                                        agent: false, // 不使用全局 agent
                                    };
                                    // 添加代理认证头部 (如果需要)
                                    if (proxyInfo.username) {
                                        const auth = 'Basic ' + Buffer.from(proxyInfo.username + ':' + (proxyPassword || '')).toString('base64');
                                        reqOptions.headers = {
                                            ...reqOptions.headers,
                                            'Proxy-Authorization': auth,
                                            'Proxy-Connection': 'Keep-Alive', // 某些代理需要
                                            'Host': `${connInfo.host}:${connInfo.port}` // CONNECT 请求的目标
                                        };
                                    }

                                    const req = http.request(reqOptions);
                                    req.on('connect', (res, socket, head) => {
                                        if (res.statusCode === 200) {
                                            console.log(`WebSocket: HTTP 代理隧道建立成功。正在建立 SSH 连接...`);
                                            ws.send(JSON.stringify({ type: 'ssh:status', payload: 'HTTP 代理隧道成功，正在建立 SSH...' }));
                                            connectConfig.sock = socket; // 使用建立的隧道 socket
                                            connectSshClient(ws, sshClient, connectConfig, connInfo); // 通过隧道连接 SSH
                                        } else {
                                            console.error(`WebSocket: HTTP 代理 CONNECT 请求失败, 状态码: ${res.statusCode}`);
                                            socket.destroy();
                                            ws.send(JSON.stringify({ type: 'ssh:error', payload: `HTTP 代理连接失败 (状态码: ${res.statusCode})` }));
                                            cleanupSshConnection(ws);
                                        }
                                    });
                                    req.on('error', (err) => {
                                        console.error(`WebSocket: HTTP 代理请求错误:`, err);
                                        ws.send(JSON.stringify({ type: 'ssh:error', payload: `HTTP 代理连接错误: ${err.message}` }));
                                        cleanupSshConnection(ws);
                                    });
                                    req.on('timeout', () => {
                                        console.error(`WebSocket: HTTP 代理请求超时`);
                                        req.destroy(); // 销毁请求
                                        ws.send(JSON.stringify({ type: 'ssh:error', payload: 'HTTP 代理连接超时' }));
                                        cleanupSshConnection(ws);
                                    });
                                    req.end(); // 发送请求
                                    // 注意：对于 HTTP 代理，连接逻辑在 'connect' 事件回调中处理

                                } else {
                                     console.error(`WebSocket: 未知的代理类型: ${proxyInfo.type}`);
                                     ws.send(JSON.stringify({ type: 'ssh:error', payload: `未知的代理类型: ${proxyInfo.type}` }));
                                     cleanupSshConnection(ws);
                                }
                            } catch (proxyProcessError: any) {
                                console.error(`处理代理 ${proxyInfo.id} 配置或凭证失败:`, proxyProcessError);
                                ws.send(JSON.stringify({ type: 'ssh:error', payload: `无法处理代理配置: ${proxyProcessError.message}` }));
                                cleanupSshConnection(ws);
                            }
                        } else {
                            // 5. 无代理，直接连接
                            console.log(`WebSocket: 未配置代理。正在直接建立 SSH 连接...`);
                            ws.send(JSON.stringify({ type: 'ssh:status', payload: `正在直接连接到 ${connInfo.host}...` }));
                            connectSshClient(ws, sshClient, connectConfig, connInfo); // 直接连接 SSH
                        }
                        break;
                    } // end case 'ssh:connect'

                    // --- 处理 SSH 输入 ---

                    // --- 处理 SSH 输入 ---
                    case 'ssh:input': {
                        const connection = activeSshConnections.get(ws);
                        if (connection?.shell && parsedMessage.payload?.data) {
                            connection.shell.write(parsedMessage.payload.data);
                        } else {
                             console.warn(`WebSocket: 收到来自 ${ws.username} 的 SSH 输入，但无活动 Shell 或数据为空。`);
                        }
                        break;
                    }

                    // --- 处理终端大小调整 ---
                    case 'ssh:resize': {
                         const connection = activeSshConnections.get(ws);
                         const { cols, rows } = parsedMessage.payload || {};
                         if (connection?.shell && cols && rows) {
                             console.log(`SSH: 用户 ${ws.username} 调整终端大小: ${cols}x${rows}`);
                             connection.shell.setWindow(rows, cols, 0, 0); // 注意参数顺序 rows, cols
                         } else {
                             console.warn(`WebSocket: 收到来自 ${ws.username} 的调整大小请求，但无活动 Shell 或尺寸数据无效。`);
                         }
                         break;
                    }

                    // --- 处理 SFTP 目录列表请求 ---
                    case 'sftp:readdir': {
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('readdir', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('readdir', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求读取目录: ${targetPath}`);
                        currentSftp.readdir(targetPath, (err, list) => {
                            if (err) {
                                sendSftpError('readdir', targetPath, err);
                                return;
                            }
                            // 格式化文件列表以便前端使用
                            const formattedList = list.map(item => ({
                                filename: item.filename,
                                longname: item.longname,
                                attrs: {
                                    size: item.attrs.size,
                                    uid: item.attrs.uid,
                                    gid: item.attrs.gid,
                                    mode: item.attrs.mode,
                                    atime: item.attrs.atime * 1000,
                                    mtime: item.attrs.mtime * 1000,
                                    isDirectory: item.attrs.isDirectory(),
                                    isFile: item.attrs.isFile(),
                                    isSymbolicLink: item.attrs.isSymbolicLink(),
                                }
                            }));
                            sendSftpSuccess('readdir', targetPath, formattedList);
                        });
                        break;
                    }

                    // --- 处理 SFTP 文件/目录状态获取请求 ---
                    case 'sftp:stat': {
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('stat', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('stat', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求获取状态: ${targetPath}`);
                        currentSftp.lstat(targetPath, (err, stats) => { // 使用 lstat 获取链接本身信息
                            if (err) {
                                sendSftpError('stat', targetPath, err);
                                return;
                            }
                            const formattedStats = {
                                mode: stats.mode,
                                uid: stats.uid,
                                gid: stats.gid,
                                size: stats.size,
                                atime: stats.atime * 1000,
                                mtime: stats.mtime * 1000,
                                isDirectory: stats.isDirectory(),
                                isFile: stats.isFile(),
                                isBlockDevice: stats.isBlockDevice(),
                                isCharacterDevice: stats.isCharacterDevice(),
                                isSymbolicLink: stats.isSymbolicLink(),
                                isFIFO: stats.isFIFO(),
                                isSocket: stats.isSocket(),
                            };
                            sendSftpSuccess('stat', targetPath, formattedStats);
                        });
                        break;
                    }

                    // --- 处理 SFTP 文件上传 ---
                    case 'sftp:upload:start': {
                        const { remotePath, uploadId, size } = parsedMessage.payload || {};
                        const currentSftp = ensureSftp('upload:start', remotePath);
                        if (!currentSftp) break;

                        if (typeof remotePath !== 'string' || !uploadId) {
                            sendSftpError('upload:start', remotePath, '无效的上传请求参数 (remotePath, uploadId)。', undefined);
                            break;
                        }
                        if (activeUploads.has(uploadId)) {
                            sendSftpError('upload:start', remotePath, '具有相同 ID 的上传已在进行中。', undefined);
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 开始上传到 ${remotePath} (ID: ${uploadId}, 大小: ${size ?? '未知'})`);
                        try {
                            const writeStream = currentSftp.createWriteStream(remotePath);
                            writeStream.on('error', (err: Error) => {
                                sendSftpError('upload', remotePath, err, `写入远程文件失败: ${err.message}`);
                                activeUploads.delete(uploadId);
                            });
                            let uploadFinished = false;
                            const onStreamEnd = (eventName: string) => {
                                if (uploadFinished) return;
                                uploadFinished = true;
                                sendSftpSuccess('upload', remotePath, { uploadId }); // 成功时也带上 uploadId
                                activeUploads.delete(uploadId);
                            };
                            writeStream.on('finish', () => onStreamEnd('finish'));
                            writeStream.on('close', () => onStreamEnd('close'));
                            activeUploads.set(uploadId, writeStream as any);
                            ws.send(JSON.stringify({ type: 'sftp:upload:ready', uploadId }));
                        } catch (err: any) {
                            sendSftpError('upload:start', remotePath, err, `无法创建远程文件: ${err.message}`);
                        }
                        break;
                    }

                    case 'sftp:upload:chunk': {
                        const { uploadId, data, isLast } = parsedMessage.payload || {};
                        const writeStream = activeUploads.get(uploadId);

                        if (!writeStream) {
                            // console.warn(`WebSocket: 收到上传数据块 (ID: ${uploadId})，但未找到对应的上传任务。`);
                            // 不必每次都报错，前端可能已经取消或完成
                            break;
                        }
                        if (typeof data !== 'string') {
                             sendSftpError('upload:chunk', undefined, '无效的数据块格式。', undefined);
                             break;
                        }

                        try {
                            const buffer = Buffer.from(data, 'base64');
                            const canWriteMore = writeStream.write(buffer);
                            if (!canWriteMore) {
                                writeStream.once('drain', () => {
                                    ws.send(JSON.stringify({ type: 'sftp:upload:resume', uploadId }));
                                });
                                ws.send(JSON.stringify({ type: 'sftp:upload:pause', uploadId }));
                            }
                            if (isLast) {
                                writeStream.end();
                            }
                        } catch (err: any) {
                             sendSftpError('upload:chunk', undefined, err, `处理数据块失败: ${err.message}`);
                             writeStream.end();
                             activeUploads.delete(uploadId);
                        }
                        break;
                    }

                     case 'sftp:upload:cancel': {
                        const { uploadId } = parsedMessage.payload || {};
                        const writeStream = activeUploads.get(uploadId);
                        if (writeStream) {
                            console.log(`SFTP: 用户 ${ws.username} 取消上传 (ID: ${uploadId})`);
                            writeStream.end(); // 触发清理
                            // TODO: 删除部分文件? sftp.unlink?
                            ws.send(JSON.stringify({ type: 'sftp:upload:cancelled', uploadId }));
                        } else {
                            // console.warn(`WebSocket: 收到取消上传请求 (ID: ${uploadId})，但未找到对应的上传任务。`);
                        }
                        break;
                    }

                    // --- 处理 SFTP 文件读取请求 ---
                    case 'sftp:readfile': {
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('readfile', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('readfile', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求读取文件: ${targetPath}`);
                        const readStream = currentSftp.createReadStream(targetPath);
                        let fileContent = '';
                        let hasError = false;

                        readStream.on('data', (chunk: Buffer) => {
                            // 尝试多种编码解码，优先 UTF-8
                            try {
                                fileContent += chunk.toString('utf8');
                            } catch (e) {
                                // 如果 UTF-8 失败，尝试其他常见编码，例如 GBK (适用于中文 Windows)
                                // 注意：这只是一个尝试，可能不准确。更可靠的方法是让用户指定编码。
                                try {
                                    // 需要安装 iconv-lite: npm install iconv-lite @types/iconv-lite -w packages/backend
                                    // import * as iconv from 'iconv-lite';
                                    // fileContent += iconv.decode(chunk, 'gbk');
                                    // 暂时回退到 base64 发送原始数据，让前端处理解码
                                    console.warn(`SFTP: 文件 ${targetPath} 无法以 UTF-8 解码，将发送 Base64 编码内容。`);
                                    fileContent = Buffer.concat([Buffer.from(fileContent), chunk]).toString('base64');
                                } catch (decodeError) {
                                    console.error(`SFTP: 文件 ${targetPath} 解码失败:`, decodeError);
                                    sendSftpError('readfile', targetPath, '文件解码失败。');
                                    readStream.destroy(); // 停止读取
                                    hasError = true;
                                }
                            }
                        });

                        readStream.on('error', (err: Error) => {
                            if (hasError) return; // 避免重复发送错误
                            sendSftpError('readfile', targetPath, err);
                            hasError = true;
                        });

                        readStream.on('end', () => {
                            if (hasError) return; // 如果之前已出错，则不发送成功消息
                            // 判断是发送文本内容还是 Base64
                            let payload: { content: string; encoding: 'utf8' | 'base64' };
                            try {
                                // 尝试再次解码整个内容为 UTF-8，如果成功则发送 UTF-8
                                Buffer.from(fileContent, 'base64').toString('utf8');
                                // 如果上一步是 base64 编码，这里会是原始 base64 字符串
                                if (fileContent === Buffer.from(fileContent, 'base64').toString('base64')) {
                                     payload = { content: fileContent, encoding: 'base64' };
                                } else {
                                     payload = { content: fileContent, encoding: 'utf8' };
                                }

                            } catch (e) {
                                // 如果整体解码失败，则发送 Base64
                                payload = { content: Buffer.from(fileContent).toString('base64'), encoding: 'base64' };
                            }
                             // 限制发送内容的大小，避免 WebSocket 拥塞 (例如 1MB)
                             const MAX_CONTENT_SIZE = 1 * 1024 * 1024;
                             if (Buffer.byteLength(payload.content, payload.encoding === 'base64' ? 'base64' : 'utf8') > MAX_CONTENT_SIZE) {
                                 sendSftpError('readfile', targetPath, `文件过大 (超过 ${MAX_CONTENT_SIZE / 1024 / 1024}MB)，无法在编辑器中打开。`);
                             } else {
                                 sendSftpSuccess('readfile', targetPath, payload);
                             }
                        });
                        break;
                    }

                    // --- 处理 SFTP 文件写入请求 ---
                    case 'sftp:writefile': {
                        const { path: targetPath, content, encoding } = parsedMessage.payload || {};
                        const currentSftp = ensureSftp('writefile', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string' || typeof content !== 'string' || (encoding !== 'utf8' && encoding !== 'base64')) {
                            sendSftpError('writefile', targetPath, '请求参数无效 (需要 path, content, encoding[\'utf8\'|\'base64\'])。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求写入文件: ${targetPath}, Encoding: ${encoding}, Content length: ${content.length}`); // 增加日志细节

                        try {
                            console.log(`[writefile] Attempting to create buffer for ${targetPath}`);
                            const buffer = Buffer.from(content, encoding); // 根据 encoding 解码/转换内容为 Buffer
                            console.log(`[writefile] Buffer created successfully for ${targetPath}. Attempting to create write stream.`);
                            const writeStream = currentSftp.createWriteStream(targetPath);
                            console.log(`[writefile] Write stream created for ${targetPath}. Attaching listeners.`);
                            let hasError = false;
                            let operationCompleted = false; // Flag to track if finish/error occurred
                            let backendTimeoutId: NodeJS.Timeout | null = null;
                            const streamId = Math.random().toString(36).substring(2, 9); // Unique ID for logging this stream instance
                            const BACKEND_WRITE_TIMEOUT = 15000; // 15 seconds backend timeout

                            console.log(`[${streamId}] SFTP: Attaching listeners for writeStream to ${targetPath}`);

                            const cleanupTimeout = () => {
                                if (backendTimeoutId) {
                                    clearTimeout(backendTimeoutId);
                                    backendTimeoutId = null;
                                }
                            };

                            writeStream.on('error', (err: Error) => {
                                console.error(`[${streamId}] SFTP: writeStream 'error' event for ${targetPath}:`, err);
                                if (operationCompleted) return; // Already completed
                                operationCompleted = true;
                                cleanupTimeout();
                                sendSftpError('writefile', targetPath, err, `写入远程文件失败: ${err.message}`);
                                hasError = true; // Keep track for close handler if needed
                            });

                            writeStream.on('finish', () => { // 'finish' 表示所有数据已刷入底层系统
                                console.log(`[${streamId}] SFTP: writeStream 'finish' event for ${targetPath}. HasError: ${hasError}`);
                                if (operationCompleted) return; // Already completed (e.g., error occurred first)
                                operationCompleted = true;
                                cleanupTimeout();
                                if (hasError) return; // Error occurred before finish
                                sendSftpSuccess('writefile', targetPath);
                            });
                            writeStream.on('close', () => { // 'close' 表示流已关闭
                                console.log(`[${streamId}] SFTP: writeStream 'close' event for ${targetPath}. writableFinished: ${writeStream.writableFinished}, HasError: ${hasError}, OperationCompleted: ${operationCompleted}`);
                                cleanupTimeout(); // Clear timeout if close happens before it fires
                                // If the stream closed and no error/finish/timeout event handled it yet,
                                // consider it a success. This handles cases where 'finish' might not fire reliably,
                                // even if writableFinished is false when close is emitted prematurely.
                                if (!operationCompleted) {
                                    console.warn(`[${streamId}] SFTP: writeStream 'close' event occurred before 'finish' or 'error'. Assuming success for ${targetPath}.`);
                                    sendSftpSuccess('writefile', targetPath);
                                    operationCompleted = true; // Mark as completed via close
                                }
                                // If an error or finish occurred, the respective handlers already sent the message.
                                // If finish occurred, the 'finish' handler sent success.
                                // If closed without finishing and without error, the backend timeout might handle it,
                                // or it might be a legitimate early close after an error on the server side not reported via 'error' event.
                            });

                            // 写入数据并结束流
                            console.log(`[${streamId}] SFTP: Calling writeStream.end() for ${targetPath}`);
                            writeStream.end(buffer, () => {
                                console.log(`[${streamId}] SFTP: writeStream.end() callback fired for ${targetPath}. Starting backend timeout.`);
                                // Start backend timeout *after* end() callback fires (or immediately if no callback needed)
                                backendTimeoutId = setTimeout(() => {
                                    if (!operationCompleted) {
                                        console.error(`[${streamId}] SFTP: Backend write timeout (${BACKEND_WRITE_TIMEOUT}ms) reached for ${targetPath}.`);
                                        operationCompleted = true; // Mark as completed due to timeout
                                        sendSftpError('writefile', targetPath, `后端写入超时 (${BACKEND_WRITE_TIMEOUT / 1000}秒)`);
                                    }
                                }, BACKEND_WRITE_TIMEOUT);
                            });


                        } catch (err: any) {
                            console.error(`[writefile] Error during write stream creation or buffer processing for ${targetPath}:`, err); // 增加 catch 日志
                            // Buffer.from 可能因无效编码或内容抛出错误
                            sendSftpError('writefile', targetPath, err, `处理文件内容或创建写入流失败: ${err.message}`);
                        }
                        break;
                    }


                    // --- 新增 SFTP 操作 ---
                    case 'sftp:mkdir': {
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('mkdir', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('mkdir', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求创建目录: ${targetPath}`);
                        // TODO: 考虑添加 mode 参数支持
                        currentSftp.mkdir(targetPath, (err) => {
                            if (err) {
                                sendSftpError('mkdir', targetPath, err);
                            } else {
                                sendSftpSuccess('mkdir', targetPath);
                            }
                        });
                        break;
                    }

                    case 'sftp:rmdir': {
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('rmdir', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('rmdir', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求删除目录: ${targetPath}`);
                        currentSftp.rmdir(targetPath, (err) => {
                            if (err) {
                                sendSftpError('rmdir', targetPath, err);
                            } else {
                                sendSftpSuccess('rmdir', targetPath);
                            }
                        });
                        break;
                    }

                    case 'sftp:unlink': { // 删除文件
                        const targetPath = parsedMessage.payload?.path;
                        const currentSftp = ensureSftp('unlink', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string') {
                            sendSftpError('unlink', targetPath, '请求路径无效。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求删除文件: ${targetPath}`);
                        currentSftp.unlink(targetPath, (err) => {
                            if (err) {
                                sendSftpError('unlink', targetPath, err);
                            } else {
                                sendSftpSuccess('unlink', targetPath);
                            }
                        });
                        break;
                    }

                    case 'sftp:rename': {
                        const { oldPath, newPath } = parsedMessage.payload || {};
                        const currentSftp = ensureSftp('rename', oldPath);
                        if (!currentSftp) break;

                        if (typeof oldPath !== 'string' || typeof newPath !== 'string') {
                            sendSftpError('rename', oldPath, '无效的旧路径或新路径。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求重命名: ${oldPath} -> ${newPath}`);
                        currentSftp.rename(oldPath, newPath, (err) => {
                            if (err) {
                                sendSftpError('rename', oldPath, err);
                            } else {
                                sendSftpSuccess('rename', oldPath, { oldPath, newPath }); // 返回新旧路径
                            }
                        });
                        break;
                    }

                     case 'sftp:chmod': {
                        const { targetPath, mode } = parsedMessage.payload || {};
                        const currentSftp = ensureSftp('chmod', targetPath);
                        if (!currentSftp) break;

                        if (typeof targetPath !== 'string' || typeof mode !== 'number') {
                            sendSftpError('chmod', targetPath, '无效的路径或权限模式。');
                            break;
                        }

                        console.log(`SFTP: 用户 ${ws.username} 请求修改权限: ${targetPath} -> ${mode.toString(8)}`); // 以八进制显示 mode
                        currentSftp.chmod(targetPath, mode, (err) => {
                            if (err) {
                                sendSftpError('chmod', targetPath, err);
                            } else {
                                sendSftpSuccess('chmod', targetPath, { mode }); // 返回设置的 mode
                            }
                        });
                        break;
                    }


                    default:
                        console.warn(`WebSocket：收到未知类型的消息: ${parsedMessage.type}`);
                        ws.send(JSON.stringify({ type: 'error', payload: `不支持的消息类型: ${parsedMessage.type}` }));
                }
            } catch (e) {
                console.error('WebSocket：解析消息时出错:', e);
                ws.send(JSON.stringify({ type: 'error', payload: '无效的消息格式' }));
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`WebSocket：客户端 ${ws.username} (ID: ${ws.userId}) 已断开连接。代码: ${code}, 原因: ${reason.toString()}`);
            cleanupSshConnection(ws); // 清理关联的 SSH 资源
        });

        ws.on('error', (error) => {
            console.error(`WebSocket：客户端 ${ws.username} (ID: ${ws.userId}) 发生错误:`, error);
            cleanupSshConnection(ws); // 清理关联的 SSH 资源
        });

        // 不再发送通用欢迎消息，等待前端发起 ssh:connect
        // ws.send(JSON.stringify({ type: 'info', payload: `欢迎, ${ws.username}! WebSocket 连接已建立。` }));
    });

    wss.on('close', () => {
        console.log('WebSocket 服务器正在关闭，清理心跳定时器...');
        clearInterval(interval);
        // 关闭所有活动的 SSH 连接
        console.log('关闭所有活动的 SSH 连接...');
        activeSshConnections.forEach((conn, ws) => {
            cleanupSshConnection(ws);
        });
    });

    console.log('WebSocket 服务器初始化完成。');
    return wss;
};

// --- 辅助函数：建立 SSH 连接并处理事件 ---
function connectSshClient(ws: AuthenticatedWebSocket, sshClient: Client, connectConfig: any, connInfo: DbConnectionInfo) {
    ws.sshClient = sshClient; // 关联 client

    sshClient.on('ready', () => {
        console.log(`SSH: 用户 ${ws.username} 到 ${connInfo.host} 连接成功！`);
        ws.send(JSON.stringify({ type: 'ssh:status', payload: 'SSH 连接成功，正在打开 Shell...' }));

        // 请求 Shell 通道
        sshClient.shell((err, stream) => {
            if (err) {
                console.error(`SSH: 用户 ${ws.username} 打开 Shell 失败:`, err);
                ws.send(JSON.stringify({ type: 'ssh:error', payload: `打开 Shell 失败: ${err.message}` }));
                cleanupSshConnection(ws);
                return;
            }
            ws.sshShellStream = stream; // 关联 stream
            // 存储活动连接 (此时 sftp 可能还未就绪)
            // 确保 client 和 shell 都存在才存储
            if (activeSshConnections.has(ws)) {
                 // 如果已存在（例如 SOCKS 连接后），更新 shell
                 const existing = activeSshConnections.get(ws)!;
                 existing.shell = stream;
            } else {
                 activeSshConnections.set(ws, { client: sshClient, shell: stream });
            }
            console.log(`SSH: 用户 ${ws.username} Shell 通道已打开。`);

            // 尝试初始化 SFTP 会话
            sshClient.sftp((sftpErr, sftp) => {
                if (sftpErr) {
                    console.error(`SFTP: 用户 ${ws.username} 初始化失败:`, sftpErr);
                    ws.send(JSON.stringify({ type: 'sftp:error', payload: `SFTP 初始化失败: ${sftpErr.message}` }));
                    ws.send(JSON.stringify({ type: 'ssh:status', payload: 'Shell 已连接，但 SFTP 初始化失败。' }));
                    // SFTP 失败不应断开整个连接，但需要标记
                    const existingConn = activeSshConnections.get(ws);
                    if (existingConn) {
                        // SFTP 失败，但 Shell 仍可用，启动状态轮询
                        startStatusPolling(ws, sshClient);
                    }
                    return;
                }
                console.log(`SFTP: 用户 ${ws.username} 会话已初始化。`);
                const existingConn = activeSshConnections.get(ws);
                if (existingConn) {
                    existingConn.sftp = sftp;
                    ws.send(JSON.stringify({ type: 'ssh:connected' })); // SFTP 就绪后通知前端
                    startStatusPolling(ws, sshClient); // 启动状态轮询
                } else {
                    console.error(`SFTP: 无法找到用户 ${ws.username} 的活动连接记录以存储 SFTP 或启动轮询。`);
                    ws.send(JSON.stringify({ type: 'ssh:error', payload: '内部服务器错误：无法关联 SFTP 会话。' }));
                    cleanupSshConnection(ws);
                }
            });

            // 数据转发：Shell -> WebSocket
            stream.on('data', (data: Buffer) => {
                ws.send(JSON.stringify({
                    type: 'ssh:output',
                    payload: data.toString('base64'),
                    encoding: 'base64'
                }));
            });

            // 处理 Shell 关闭
            stream.on('close', () => {
                console.log(`SSH: 用户 ${ws.username} Shell 通道已关闭。`);
                ws.send(JSON.stringify({ type: 'ssh:disconnected', payload: 'Shell 通道已关闭。' }));
                cleanupSshConnection(ws);
            });
            // Stderr 转发
            stream.stderr.on('data', (data: Buffer) => {
                 console.error(`SSH Stderr (${ws.username}): ${data.toString('utf8').substring(0,100)}...`);
                 ws.send(JSON.stringify({
                     type: 'ssh:output',
                     payload: data.toString('base64'),
                     encoding: 'base64'
                 }));
            });
        });
    }).on('error', (err) => {
        console.error(`SSH: 用户 ${ws.username} 连接错误:`, err);
        // 避免在 SOCKS 错误后重复发送错误
        if (!ws.CLOSED && !ws.CLOSING) { // 检查 WebSocket 状态
             ws.send(JSON.stringify({ type: 'ssh:error', payload: `SSH 连接错误: ${err.message}` }));
        }
        cleanupSshConnection(ws);
    }).on('close', () => {
        console.log(`SSH: 用户 ${ws.username} 连接已关闭。`);
        if (activeSshConnections.has(ws)) {
             if (!ws.CLOSED && !ws.CLOSING) {
                 ws.send(JSON.stringify({ type: 'ssh:disconnected', payload: 'SSH 连接已关闭。' }));
             }
             cleanupSshConnection(ws);
        }
    }).connect(connectConfig);
}
