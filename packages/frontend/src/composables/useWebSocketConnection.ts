import { ref, shallowRef, computed, readonly } from 'vue';
import type { ConnectionStatus, MessagePayload, WebSocketMessage, MessageHandler } from '../types/websocket.types';

/**
 * 创建并管理单个 WebSocket 连接实例。
 * 每个实例对应一个会话 (Session)。
 *
 * @param {string} sessionId - 此 WebSocket 连接关联的会话 ID (用于日志记录)。
 * @param {string} dbConnectionId - 此 WebSocket 连接关联的数据库连接 ID (用于后端识别)。
 * @param {Function} t - i18n 翻译函数，从父组件传入
 * @returns 一个包含状态和方法的 WebSocket 连接管理器对象。
 */
export function createWebSocketConnectionManager(sessionId: string, dbConnectionId: string, t: Function) {
    // --- Instance State ---
    // 每个实例拥有独立的 WebSocket 对象、状态和消息处理器
    const ws = shallowRef<WebSocket | null>(null); // WebSocket 实例
    const connectionStatus = ref<ConnectionStatus>('disconnected'); // 连接状态
    const statusMessage = ref<string>(''); // 状态描述文本
    const isSftpReady = ref<boolean>(false); // SFTP 是否就绪
    const messageHandlers = new Map<string, Set<MessageHandler>>(); // 此实例的消息处理器注册表
    const instanceSessionId = sessionId; // 保存会话 ID 用于日志
    const instanceDbConnectionId = dbConnectionId; // 保存数据库连接 ID
    // --- End Instance State ---

    /**
     * 安全地获取状态文本的辅助函数
     * @param {string} statusKey - i18n 键名 (例如 'connectingWs')
     * @param {Record<string, unknown>} [params] - i18n 插值参数
     * @returns {string} 翻译后的文本或键名本身 (如果翻译失败)
     */
    const getStatusText = (statusKey: string, params?: Record<string, unknown>): string => {
        try {
            const translated = t(`workspace.status.${statusKey}`, params || {});
            return translated === `workspace.status.${statusKey}` ? statusKey : translated;
        } catch (e) {
            console.warn(`[WebSocket ${instanceSessionId}] i18n 错误 (键: workspace.status.${statusKey}):`, e);
            return statusKey;
        }
    };

    /**
     * 将收到的消息分发给已注册的处理器
     * @param {string} type - 消息类型
     * @param {MessagePayload} payload - 消息负载
     * @param {WebSocketMessage} fullMessage - 完整的消息对象
     */
    const dispatchMessage = (type: string, payload: MessagePayload, fullMessage: WebSocketMessage) => {
        if (messageHandlers.has(type)) {
            messageHandlers.get(type)?.forEach(handler => {
                try {
                    handler(payload, fullMessage);
                } catch (e) {
                    console.error(`[WebSocket ${instanceSessionId}] 消息处理器错误 (类型: "${type}"):`, e);
                }
            });
        }
    };

    /**
     * 建立 WebSocket 连接
     * @param {string} url - WebSocket 服务器 URL
     */
    const connect = (url: string) => {
        // 防止重复连接同一实例
        if (ws.value && (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING)) {
            console.warn(`[WebSocket ${instanceSessionId}] 连接已打开或正在连接中。`);
            return;
        }

        console.log(`[WebSocket ${instanceSessionId}] 尝试连接到: ${url} (DB Conn ID: ${instanceDbConnectionId})`);
        statusMessage.value = getStatusText('connectingWs', { url });
        connectionStatus.value = 'connecting';
        isSftpReady.value = false; // 重置 SFTP 状态

        try {
            ws.value = new WebSocket(url);

            ws.value.onopen = () => {
                console.log(`[WebSocket ${instanceSessionId}] 连接已打开。`);
                statusMessage.value = getStatusText('wsConnected');
                // 状态保持 'connecting' 直到收到 ssh:connected
                // 发送后端所需的初始连接消息，包含数据库连接 ID
                sendMessage({ type: 'ssh:connect', payload: { connectionId: instanceDbConnectionId } });
                dispatchMessage('internal:opened', {}, { type: 'internal:opened' }); // 触发内部打开事件
            };

            ws.value.onmessage = (event: MessageEvent) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    // console.debug(`[WebSocket ${instanceSessionId}] 收到:`, message.type);

                    // --- 更新此实例的连接状态 ---
                    if (message.type === 'ssh:connected') {
                        if (connectionStatus.value !== 'connected') {
                            console.log(`[WebSocket ${instanceSessionId}] SSH 会话已连接。`);
                            connectionStatus.value = 'connected';
                            statusMessage.value = getStatusText('connected');
                        }
                    } else if (message.type === 'ssh:disconnected') {
                        if (connectionStatus.value !== 'disconnected') {
                            console.log(`[WebSocket ${instanceSessionId}] SSH 会话已断开。`);
                            connectionStatus.value = 'disconnected';
                            statusMessage.value = getStatusText('disconnected', { reason: message.payload || '未知原因' });
                            isSftpReady.value = false; // SSH 断开，SFTP 也应不可用
                        }
                    } else if (message.type === 'ssh:error' || message.type === 'error') {
                        if (connectionStatus.value !== 'disconnected' && connectionStatus.value !== 'error') {
                            console.error(`[WebSocket ${instanceSessionId}] 收到错误消息:`, message.payload);
                            connectionStatus.value = 'error';
                            let errorMsg = message.payload || '未知错误';
                            if (typeof errorMsg === 'object' && errorMsg.message) errorMsg = errorMsg.message;
                            statusMessage.value = getStatusText('error', { message: errorMsg });
                            isSftpReady.value = false;
                        }
                    } else if (message.type === 'sftp_ready') {
                        console.log(`[WebSocket ${instanceSessionId}] SFTP 会话已就绪。`);
                        isSftpReady.value = true;
                    }
                    // --- 状态更新结束 ---

                    // 分发消息给此实例的处理器
                    dispatchMessage(message.type, message.payload, message);

                } catch (e) {
                    console.error(`[WebSocket ${instanceSessionId}] 处理消息时出错:`, e, '原始数据:', event.data);
                    dispatchMessage('internal:raw', event.data, { type: 'internal:raw' });
                }
            };

            ws.value.onerror = (event) => {
                console.error(`[WebSocket ${instanceSessionId}] 连接错误:`, event);
                if (connectionStatus.value !== 'disconnected') {
                    connectionStatus.value = 'error';
                    statusMessage.value = getStatusText('wsError');
                }
                dispatchMessage('internal:error', event, { type: 'internal:error' });
                isSftpReady.value = false;
                ws.value = null; // 清理实例
            };

            ws.value.onclose = (event) => {
                console.log(`[WebSocket ${instanceSessionId}] 连接已关闭: Code=${event.code}, Reason=${event.reason}`);
                if (connectionStatus.value !== 'disconnected' && connectionStatus.value !== 'error') {
                    connectionStatus.value = 'disconnected';
                    statusMessage.value = getStatusText('wsClosed', { code: event.code });
                }
                dispatchMessage('internal:closed', { code: event.code, reason: event.reason }, { type: 'internal:closed' });
                isSftpReady.value = false;
                ws.value = null; // 清理实例引用
                // 不自动清除处理器，以便在重连时可能复用
            };
        } catch (err) {
             console.error(`[WebSocket ${instanceSessionId}] 创建 WebSocket 实例失败:`, err);
             connectionStatus.value = 'error';
             statusMessage.value = getStatusText('wsError');
             isSftpReady.value = false;
             ws.value = null;
        }
    };

    /**
     * 手动断开此 WebSocket 连接
     */
    const disconnect = () => {
        if (ws.value) {
            console.log(`[WebSocket ${instanceSessionId}] 手动关闭连接...`);
            if (connectionStatus.value !== 'disconnected') {
                 connectionStatus.value = 'disconnected';
                 statusMessage.value = getStatusText('disconnected', { reason: '手动断开' });
            }
             ws.value.close(1000, '客户端主动断开'); // 使用标准代码和原因
             ws.value = null;
             isSftpReady.value = false;
             // 手动断开时可以考虑清除处理器，取决于是否需要重连逻辑
             // messageHandlers.clear();
        } else {
             console.log(`[WebSocket ${instanceSessionId}] 连接已关闭或不存在，无需断开。`);
        }
    };

    /**
     * 发送 WebSocket 消息
     * @param {WebSocketMessage} message - 要发送的消息对象
     */
    const sendMessage = (message: WebSocketMessage) => {
        if (ws.value && ws.value.readyState === WebSocket.OPEN) {
            try {
                const messageString = JSON.stringify(message);
                // console.debug(`[WebSocket ${instanceSessionId}] 发送:`, message.type);
                ws.value.send(messageString);
            } catch (e) {
                console.error(`[WebSocket ${instanceSessionId}] 序列化或发送消息失败:`, e, message);
            }
        } else {
            console.warn(`[WebSocket ${instanceSessionId}] 无法发送消息，连接未打开。状态: ${connectionStatus.value}, ReadyState: ${ws.value?.readyState}`);
        }
    };

    /**
     * 注册一个消息处理器
     * @param {string} type - 要监听的消息类型
     * @param {MessageHandler} handler - 处理函数
     * @returns {Function} 一个用于注销此处理器的函数
     */
    const onMessage = (type: string, handler: MessageHandler): (() => void) => {
        if (!messageHandlers.has(type)) {
            messageHandlers.set(type, new Set());
        }
        const handlersSet = messageHandlers.get(type);
        if (handlersSet) {
             handlersSet.add(handler);
             // console.debug(`[WebSocket ${instanceSessionId}] 已注册处理器: ${type}`);
        }

        // 返回注销函数
        return () => {
            const currentSet = messageHandlers.get(type);
            if (currentSet) {
                currentSet.delete(handler);
                // console.debug(`[WebSocket ${instanceSessionId}] 已注销处理器: ${type}`);
                if (currentSet.size === 0) {
                    messageHandlers.delete(type);
                }
            }
        };
    };

    // 注意：没有在此处使用 onUnmounted。
    // disconnect 方法需要由外部调用者 (例如 WorkspaceView) 在会话关闭时显式调用。

    // 返回此实例的状态和方法
    return {
        // 状态 (只读引用)
        isConnected: computed(() => connectionStatus.value === 'connected'),
        isSftpReady: readonly(isSftpReady),
        connectionStatus: readonly(connectionStatus),
        statusMessage: readonly(statusMessage),

        // 方法
        connect,
        disconnect,
        sendMessage,
        onMessage,
    };
}
