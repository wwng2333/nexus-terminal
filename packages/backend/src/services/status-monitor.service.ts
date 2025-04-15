import { Client } from 'ssh2';
import { WebSocket } from 'ws';
import { ClientState } from '../websocket'; // 导入统一的 ClientState

// 定义服务器状态的数据结构 (与前端 StatusMonitor.vue 匹配)
interface ServerStatus {
    cpuPercent?: number;
    memPercent?: number;
    memUsed?: number; // MB
    memTotal?: number; // MB
    swapPercent?: number;
    swapUsed?: number; // MB
    swapTotal?: number; // MB
    diskPercent?: number;
    diskUsed?: number; // KB
    diskTotal?: number; // KB
    cpuModel?: string;
    netRxRate?: number; // Bytes per second
    netTxRate?: number; // Bytes per second
    netInterface?: string;
    osName?: string;
    loadAvg?: number[]; // 系统平均负载 [1min, 5min, 15min]
    timestamp: number; // 状态获取时间戳
}

// Interface for parsed network stats
interface NetworkStats {
    [interfaceName: string]: {
        rx_bytes: number;
        tx_bytes: number;
    }
}

const DEFAULT_POLLING_INTERVAL = 1000; // 修改为 1 秒轮询间隔 (毫秒)
// 用于存储上一次的网络统计信息以计算速率
const previousNetStats = new Map<string, { rx: number, tx: number, timestamp: number }>();

export class StatusMonitorService {
    private clientStates: Map<string, ClientState>; // 使用导入的 ClientState

    constructor(clientStates: Map<string, ClientState>) {
        this.clientStates = clientStates;
    }

    /**
     * 启动指定会话的状态轮询
     * @param sessionId 会话 ID
     * @param interval 轮询间隔 (毫秒)，可选，默认为 DEFAULT_POLLING_INTERVAL
     */
    startStatusPolling(sessionId: string, interval: number = DEFAULT_POLLING_INTERVAL): void {
        const state = this.clientStates.get(sessionId);
        if (!state || !state.sshClient) {
            //console.warn(`[StatusMonitor] 无法为会话 ${sessionId} 启动状态轮询：状态无效或 SSH 客户端不存在。`);
            return;
        }
        if (state.statusIntervalId) {
            //console.warn(`[StatusMonitor] 会话 ${sessionId} 的状态轮询已在运行中。`);
            return;
        }
        //console.warn(`[StatusMonitor] 为会话 ${sessionId} 启动状态轮询，间隔 ${interval}ms`);
        this.fetchAndSendServerStatus(sessionId); // 立即执行一次
        state.statusIntervalId = setInterval(() => {
            this.fetchAndSendServerStatus(sessionId);
        }, interval);
    }

    /**
     * 停止指定会话的状态轮询
     * @param sessionId 会话 ID
     */
    stopStatusPolling(sessionId: string): void {
        const state = this.clientStates.get(sessionId);
        if (state?.statusIntervalId) {
            //console.warn(`[StatusMonitor] 停止会话 ${sessionId} 的状态轮询。`);
            clearInterval(state.statusIntervalId);
            state.statusIntervalId = undefined;
            previousNetStats.delete(sessionId); // 清理网络统计缓存
        }
    }

    /**
     * 获取并发送服务器状态给客户端
     * @param sessionId 会话 ID
     */
    private async fetchAndSendServerStatus(sessionId: string): Promise<void> {
        const state = this.clientStates.get(sessionId);
        if (!state || !state.sshClient || state.ws.readyState !== WebSocket.OPEN) {
            //console.warn(`[StatusMonitor] 无法获取会话 ${sessionId} 的状态，停止轮询。原因：状态无效、SSH断开或WS关闭。`);
            this.stopStatusPolling(sessionId);
            return;
        }
        try {
            // 传递 sessionId 给 fetchServerStatus 以便查找 previousNetStats
            const status = await this.fetchServerStatus(state.sshClient, sessionId);
            state.ws.send(JSON.stringify({ type: 'status_update', payload: { connectionId: state.dbConnectionId, status } }));
        } catch (error: any) {
            //console.warn(`[StatusMonitor] 获取会话 ${sessionId} 服务器状态失败:`, error);
            state.ws.send(JSON.stringify({ type: 'status_error', payload: { connectionId: state.dbConnectionId, message: `获取状态失败: ${error.message}` } }));
        }
    }

     /**
      * 通过 SSH 执行命令获取服务器状态信息
      * @param sshClient SSH 客户端实例
      * @param sessionId 当前会话 ID，用于网络速率计算
      * @returns Promise<ServerStatus> 服务器状态信息
      */
     private async fetchServerStatus(sshClient: Client, sessionId: string): Promise<ServerStatus> {
         console.debug(`[StatusMonitor ${sessionId}] Fetching server status...`);
         const timestamp = Date.now();
         let status: Partial<ServerStatus> = { timestamp };

         try {
             // --- OS Name ---
             try {
                 const osReleaseOutput = await this.executeSshCommand(sshClient, 'cat /etc/os-release');
                 const nameMatch = osReleaseOutput.match(/^PRETTY_NAME="?([^"]+)"?/m);
                 status.osName = nameMatch ? nameMatch[1] : (osReleaseOutput.match(/^NAME="?([^"]+)"?/m)?.[1] ?? 'Unknown');
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get OS name:`, err); }

             // --- CPU Model ---
             try {
                 const lscpuOutput = await this.executeSshCommand(sshClient, "lscpu | grep 'Model name:'");
                 status.cpuModel = lscpuOutput.match(/Model name:\s+(.*)/)?.[1].trim() ?? 'Unknown';
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get CPU model:`, err); }

             // --- Memory and Swap ---
             try {
                 const freeOutput = await this.executeSshCommand(sshClient, 'free -m');
                 const lines = freeOutput.split('\n');
                 const memLine = lines.find(line => line.startsWith('Mem:'));
                 const swapLine = lines.find(line => line.startsWith('Swap:'));
                 if (memLine) {
                     const parts = memLine.split(/\s+/);
                     if (parts.length >= 4) {
                         const total = parseInt(parts[1], 10);
                         const used = parseInt(parts[2], 10);
                         if (!isNaN(total) && !isNaN(used)) {
                             status.memTotal = total; status.memUsed = used;
                             status.memPercent = total > 0 ? parseFloat(((used / total) * 100).toFixed(1)) : 0;
                         }
                     }
                 }
                 if (swapLine) {
                     const parts = swapLine.split(/\s+/);
                     if (parts.length >= 4) {
                         const total = parseInt(parts[1], 10);
                         const used = parseInt(parts[2], 10);
                         if (!isNaN(total) && !isNaN(used)) {
                             status.swapTotal = total; status.swapUsed = used;
                             status.swapPercent = total > 0 ? parseFloat(((used / total) * 100).toFixed(1)) : 0;
                         }
                     }
                 } else { status.swapTotal = 0; status.swapUsed = 0; status.swapPercent = 0; }
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get memory/swap usage:`, err); }

             // --- Disk Usage (Root Partition) ---
             try {
                 const dfOutput = await this.executeSshCommand(sshClient, "df -k / | tail -n 1");
                 const parts = dfOutput.split(/\s+/);
                 if (parts.length >= 5) {
                     const total = parseInt(parts[1], 10); const used = parseInt(parts[2], 10);
                     const percentMatch = parts[4].match(/(\d+)%/);
                     if (!isNaN(total) && !isNaN(used) && percentMatch) {
                         status.diskTotal = total; status.diskUsed = used;
                         status.diskPercent = parseFloat(percentMatch[1]);
                     }
                 }
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get disk usage:`, err); }

             // --- CPU Usage (Simplified from top) ---
             try {
                 const topOutput = await this.executeSshCommand(sshClient, "top -bn1 | grep '%Cpu(s)' | head -n 1");
                 const idleMatch = topOutput.match(/(\d+\.?\d*)\s+id/); // Adjusted regex for float
                 if (idleMatch) {
                     const idlePercent = parseFloat(idleMatch[1]);
                     status.cpuPercent = parseFloat((100 - idlePercent).toFixed(1));
                 }
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get CPU usage from top:`, err); }

             // --- Load Average ---
             try {
                 const uptimeOutput = await this.executeSshCommand(sshClient, 'uptime');
                 const match = uptimeOutput.match(/load average(?:s)?:\s*([\d.]+)[, ]?\s*([\d.]+)[, ]?\s*([\d.]+)/);
                 if (match) status.loadAvg = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get uptime/load average:`, err); }

             // --- Network Rates ---
             try {
                 const currentStats = await this.parseProcNetDev(sshClient);
                 if (currentStats) {
                     const defaultInterface = await this.getDefaultInterface(sshClient) || Object.keys(currentStats).find(iface => iface !== 'lo'); // Detect or fallback excluding loopback

                     if (defaultInterface && currentStats[defaultInterface]) {
                         status.netInterface = defaultInterface;
                         const currentRx = currentStats[defaultInterface].rx_bytes;
                         const currentTx = currentStats[defaultInterface].tx_bytes;
                         const prevStats = previousNetStats.get(sessionId);

                         if (prevStats && prevStats.timestamp < timestamp) { // Ensure time has passed
                             const timeDiffSeconds = (timestamp - prevStats.timestamp) / 1000;
                             if (timeDiffSeconds > 0.1) { // Avoid division by zero or tiny intervals
                                 status.netRxRate = Math.max(0, Math.round((currentRx - prevStats.rx) / timeDiffSeconds));
                                 status.netTxRate = Math.max(0, Math.round((currentTx - prevStats.tx) / timeDiffSeconds));
                             } else { status.netRxRate = 0; status.netTxRate = 0; } // Rate is 0 if interval too small
                         } else { status.netRxRate = 0; status.netTxRate = 0; } // First run or no time diff

                         previousNetStats.set(sessionId, { rx: currentRx, tx: currentTx, timestamp });
                     } else { console.warn(`[StatusMonitor ${sessionId}] Could not find stats for default interface ${defaultInterface}`); }
                 }
             } catch (err) { console.warn(`[StatusMonitor ${sessionId}] Failed to get network stats:`, err); }

         } catch (error) {
             console.error(`[StatusMonitor ${sessionId}] General error fetching server status:`, error);
         }

         return status as ServerStatus;
     }

    /**
     * 解析 /proc/net/dev 的输出
     * @param sshClient SSH 客户端实例
     * @returns Promise<NetworkStats | null> 解析后的网络统计信息或 null
     */
    private async parseProcNetDev(sshClient: Client): Promise<NetworkStats | null> {
        let output: string;
        try {
            // 将命令执行放入 try...catch
            output = await this.executeSshCommand(sshClient, 'cat /proc/net/dev');
        } catch (error) {
            // 如果命令失败，记录警告并返回 null
            console.warn("[StatusMonitor] Failed to execute 'cat /proc/net/dev':", error);
            return null;
        }
        // 如果命令成功，继续解析
        try {
            const lines = output.split('\n').slice(2); // Skip header lines
            const stats: NetworkStats = {};
            for (const line of lines) {
                const parts = line.trim().split(/:\s+|\s+/);
                if (parts.length < 17) continue; // Need at least interface name + 16 stats
                const interfaceName = parts[0];
                const rx_bytes = parseInt(parts[1], 10);
                const tx_bytes = parseInt(parts[9], 10); // TX bytes is the 10th field (index 9)
                if (!isNaN(rx_bytes) && !isNaN(tx_bytes)) {
                    stats[interfaceName] = { rx_bytes, tx_bytes };
                }
            }
            return Object.keys(stats).length > 0 ? stats : null;
        } catch (parseError) {
            // 如果解析失败，记录错误并返回 null
            console.error("[StatusMonitor] Error parsing /proc/net/dev output:", parseError);
            return null;
        }
    }

    /**
     * 获取默认网络接口名称 (Linux specific)
     * @param sshClient SSH 客户端实例
     * @returns Promise<string | null> 默认接口名称或 null
     */
    private async getDefaultInterface(sshClient: Client): Promise<string | null> {
        try {
            // 使用 ip route 命令查找默认路由对应的接口
            const output = await this.executeSshCommand(sshClient, "ip route get 1.1.1.1 | grep -oP 'dev\\s+\\K\\S+'");
            const interfaceName = output.trim();
            if (interfaceName) return interfaceName;
            // 如果 ip route 没返回有效接口名，也尝试 fallback
            console.warn("[StatusMonitor] 'ip route' did not return a valid interface name. Falling back...");

        } catch (error) {
            console.warn("[StatusMonitor] Failed to get default interface using 'ip route', falling back:", error);
        // Fallback: 尝试查找第一个非 lo 接口
        try {
             const netDevOutput = await this.executeSshCommand(sshClient, 'cat /proc/net/dev');
             const lines = netDevOutput.split('\n').slice(2);
             for (const line of lines) {
                     const iface = line.trim().split(':')[0];
                     if (iface && iface !== 'lo') {
                         return iface;
                     }
                 }
            } catch (fallbackError) {
                 console.error("[StatusMonitor] Failed to fallback to /proc/net/dev for interface:", fallbackError);
            }
            // Ensure null is returned if both primary and fallback fail within the outer catch
            return null;
        }
        // This part should ideally not be reached if the first try succeeded or the catch block returned.
        // Adding a final return null for safety and to satisfy TS if logic paths are complex.
        return null;
    }

    /**
     * 在 SSH 连接上执行单个命令
     * @param sshClient SSH 客户端实例
     * @param command 要执行的命令
     * @returns Promise<string> 命令的标准输出
     * @throws Error 如果命令执行失败
     */
    private executeSshCommand(sshClient: Client, command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let output = '';
            sshClient.exec(command, (err, stream) => {
                if (err) {
                    return reject(new Error(`执行命令 '${command}' 失败: ${err.message}`));
                }
                stream.on('close', (code: number, signal?: string) => {
                    // Don't reject on non-zero exit code, as some commands might return non-zero normally
                    // if (code !== 0) {
                    //     //console.warn(`[StatusMonitor] Command '${command}' exited with code ${code}`);
                    // }
                    resolve(output.trim());
                }).on('data', (data: Buffer) => {
                    output += data.toString('utf8');
                }).stderr.on('data', (data: Buffer) => {
                    //console.warn(`[StatusMonitor] Command '${command}' stderr: ${data.toString('utf8').trim()}`);
                });
            });
        });
    }

     /**
      * 查找与给定 SSH 客户端关联的会话 ID (辅助函数)
      * @param sshClientToFind 要查找的 SSH 客户端实例
      * @returns string | undefined 找到的会话 ID 或 undefined
      */
     private findSessionIdForClient(sshClientToFind: Client): string | undefined {
         for (const [sessionId, state] of this.clientStates.entries()) {
             if (state.sshClient === sshClientToFind) {
                 return sessionId;
             }
         }
         return undefined;
     }
}
