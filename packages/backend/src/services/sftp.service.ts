import { Client, SFTPWrapper, Stats, Dirent } from 'ssh2'; // 导入 Stats 和 Dirent 类型
import { WebSocket } from 'ws';
// import { logger } from '../utils/logger'; // 不再使用自定义 logger，改用 console

// 定义客户端状态接口
interface ClientState {
    ws: WebSocket;
    sshClient: Client;
    sftp?: SFTPWrapper;
    // 如果需要，可以添加其他相关的状态属性
}

export class SftpService {
    private clientStates: Map<string, ClientState>; // 存储 connectionId 到 ClientState 的映射

    constructor(clientStates: Map<string, ClientState>) {
        this.clientStates = clientStates;
    }

    /**
     * 初始化 SFTP 会话
     * @param connectionId 连接 ID
     */
    async initializeSftpSession(connectionId: string): Promise<void> {
        const state = this.clientStates.get(connectionId);
        if (!state || !state.sshClient || state.sftp) {
            console.warn(`[SFTP] 无法为 ${connectionId} 初始化 SFTP：状态无效或 SFTP 已初始化。`);
            return;
        }

        return new Promise((resolve, reject) => {
            state.sshClient.sftp((err, sftp) => {
                if (err) {
                    console.error(`[SFTP] 为 ${connectionId} 初始化 SFTP 会话失败:`, err);
                    state.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, message: 'SFTP 初始化失败' } }));
                    reject(err);
                } else {
                    console.log(`[SFTP] 为 ${connectionId} 初始化 SFTP 会话成功。`);
                    state.sftp = sftp;
                    state.ws.send(JSON.stringify({ type: 'sftp_ready', payload: { connectionId } }));

                    sftp.on('end', () => {
                        console.log(`[SFTP] ${connectionId} 的 SFTP 会话已结束。`);
                        if (state) state.sftp = undefined; // 在结束时清除 SFTP 实例
                    });
                    sftp.on('close', () => {
                        console.log(`[SFTP] ${connectionId} 的 SFTP 会话已关闭。`);
                         if (state) state.sftp = undefined; // 在关闭时清除 SFTP 实例
                    });
                    sftp.on('error', (sftpErr: Error) => { // 为 sftpErr 添加 Error 类型
                         console.error(`[SFTP] ${connectionId} 的 SFTP 会话出错:`, sftpErr);
                         if (state) state.sftp = undefined; // 在出错时清除 SFTP 实例
                         // 可选：通知客户端
                         state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, message: 'SFTP 会话错误' } }));
                    });

                    resolve();
                }
            });
        });
    }

    cleanupSftpSession(connectionId: string): void {
        const state = this.clientStates.get(connectionId);
        if (state?.sftp) {
            logger.info(`[SFTP] Cleaning up SFTP session for ${connectionId}`);
            state.sftp.end();
            state.sftp = undefined;
        }
    }

    // Placeholder methods for SFTP operations - to be implemented
    async readdir(connectionId: string, path: string, requestId: string): Promise<void> {
        const state = this.clientStates.get(connectionId);
        if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for readdir on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
        }
        // Implementation to follow
        logger.debug(`[SFTP] Received readdir request for ${connectionId}:${path}`);
        // Example: state.sftp.readdir(...)
        state.ws.send(JSON.stringify({ type: 'sftp_readdir_result', payload: { connectionId, requestId, files: [] /* Placeholder */ } }));
    }

    async stat(connectionId: string, path: string, requestId: string): Promise<void> {
        const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for stat on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received stat request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_stat_result', payload: { connectionId, requestId, stats: null /* Placeholder */ } }));
    }

    async readFile(connectionId: string, path: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for readFile on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received readFile request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_readfile_result', payload: { connectionId, requestId, data: '' /* Placeholder */ } }));
    }

    async writeFile(connectionId: string, path: string, data: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for writeFile on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received writeFile request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_writefile_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

    async mkdir(connectionId: string, path: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for mkdir on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received mkdir request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_mkdir_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

     async rmdir(connectionId: string, path: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for rmdir on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received rmdir request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_rmdir_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

     async unlink(connectionId: string, path: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for unlink on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received unlink request for ${connectionId}:${path}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_unlink_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

     async rename(connectionId: string, oldPath: string, newPath: string, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for rename on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received rename request for ${connectionId}: ${oldPath} -> ${newPath}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_rename_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

     async chmod(connectionId: string, path: string, mode: number, requestId: string): Promise<void> {
         const state = this.clientStates.get(connectionId);
         if (!state || !state.sftp) {
             logger.warn(`[SFTP] SFTP not ready for chmod on ${connectionId}`);
             state?.ws.send(JSON.stringify({ type: 'sftp_error', payload: { connectionId, requestId, message: 'SFTP session not ready' } }));
             return;
         }
        logger.debug(`[SFTP] Received chmod request for ${connectionId}:${path} to mode ${mode.toString(8)}`);
        // Implementation to follow
        state.ws.send(JSON.stringify({ type: 'sftp_chmod_result', payload: { connectionId, requestId, success: false /* Placeholder */ } }));
    }

    // TODO: Implement file upload/download logic with progress reporting
    // async uploadFile(...)
    // async downloadFile(...)

}
