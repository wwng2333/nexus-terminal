import { ref, readonly, onUnmounted } from 'vue';
import { useWebSocketConnection } from './useWebSocketConnection'; // 只导入 hook
import type { ServerStatus } from '../types/server.types'; // 从类型文件导入
import type { WebSocketMessage, MessagePayload } from '../types/websocket.types'; // 从类型文件导入

// --- 接口定义 (已移至 server.types.ts) ---

export function useStatusMonitor() {
    const { onMessage, isConnected } = useWebSocketConnection();

    const serverStatus = ref<ServerStatus | null>(null);
    const statusError = ref<string | null>(null); // 存储状态获取错误

    // --- WebSocket 消息处理 ---
    const handleStatusUpdate = (payload: MessagePayload, message: WebSocketMessage) => {
        // console.debug('[状态监控模块] 收到 status_update:', payload);
        if (payload && payload.status) {
            serverStatus.value = payload.status;
            statusError.value = null; // 收到有效状态时清除错误
        } else {
            console.warn('[状态监控模块] 收到缺少 payload.status 的 status_update 消息');
            // 可以选择设置一个错误状态，表明数据格式不正确
            // statusError.value = '收到的状态数据格式无效';
        }
    };

    // 处理可能的后端状态错误消息 (如果后端会发送的话)
    const handleStatusError = (payload: MessagePayload, message: WebSocketMessage) => {
         console.error('[状态监控模块] 收到状态错误消息:', payload);
         statusError.value = typeof payload === 'string' ? payload : '获取服务器状态时发生未知错误';
         serverStatus.value = null; // 出错时清除状态数据
    };

    // --- 注册 WebSocket 消息处理器 ---
    let unregisterUpdate: (() => void) | null = null;
    let unregisterError: (() => void) | null = null;

    const registerStatusHandlers = () => {
        // 仅在连接时注册处理器
        if (isConnected.value) {
            console.log('[状态监控模块] 注册状态消息处理器。');
            unregisterUpdate = onMessage('status_update', handleStatusUpdate);
            // 假设后端可能发送 'status:error' 类型的特定错误
            unregisterError = onMessage('status:error', handleStatusError);
        } else {
             console.warn('[状态监控模块] WebSocket 未连接，无法注册状态处理器。');
        }
    };

    const unregisterAllStatusHandlers = () => {
        console.log('[状态监控模块] 注销状态消息处理器。');
        unregisterUpdate?.();
        unregisterError?.();
        unregisterUpdate = null;
        unregisterError = null;
    };

    // --- 清理 ---
    onUnmounted(() => {
        unregisterAllStatusHandlers();
        console.log('[状态监控模块] Composable 已卸载。');
    });

    // --- 暴露接口 ---
    return {
        serverStatus: readonly(serverStatus), // 只读状态
        statusError: readonly(statusError),   // 只读错误状态
        registerStatusHandlers,       // 暴露注册函数
        unregisterAllStatusHandlers,  // 暴露注销函数
    };
}
