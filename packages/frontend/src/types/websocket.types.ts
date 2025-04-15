// WebSocket 连接状态类型
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// 通用消息负载类型定义
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessagePayload = any;

// WebSocket 消息结构接口
export interface WebSocketMessage {
    type: string; // 消息类型
    payload?: MessagePayload; // 消息负载
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // 允许其他属性，如 requestId, encoding 等
}

// 消息处理器函数类型
export type MessageHandler = (payload: MessagePayload, message: WebSocketMessage) => void; // 恢复 message 参数为必需
