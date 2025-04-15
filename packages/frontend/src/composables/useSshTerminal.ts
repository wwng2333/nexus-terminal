import { ref, onUnmounted, type Ref } from 'vue';
import { useWebSocketConnection } from './useWebSocketConnection'; // 只导入 hook 本身
import { useI18n } from 'vue-i18n';
import type { Terminal } from 'xterm';
import type { WebSocketMessage, MessagePayload } from '../types/websocket.types'; // 从类型文件导入

export function useSshTerminal() {
    const { t } = useI18n();
    const { sendMessage, onMessage, isConnected } = useWebSocketConnection();

    const terminalInstance = ref<Terminal | null>(null);
    const terminalOutputBuffer = ref<string[]>([]); // 缓冲 WebSocket 消息直到终端准备好

    // 辅助函数：获取终端消息文本
    const getTerminalText = (key: string, params?: Record<string, any>): string => {
        // 确保 i18n key 存在，否则返回原始 key
        const translationKey = `workspace.terminal.${key}`;
        const translated = t(translationKey, params || {});
        return translated === translationKey ? key : translated;
    };

    // --- 终端事件处理 ---

    const handleTerminalReady = (term: Terminal) => {
        console.log('[SSH终端模块] 终端实例已就绪。');
        terminalInstance.value = term;
        // 将缓冲区的输出写入终端
        terminalOutputBuffer.value.forEach(data => term.write(data));
        terminalOutputBuffer.value = []; // 清空缓冲区
        // 可以在这里自动聚焦或执行其他初始化操作
        // term.focus(); // 也许在 ssh:connected 时聚焦更好
    };

    const handleTerminalData = (data: string) => {
        // console.debug('[SSH终端模块] 接收到终端输入:', data);
        sendMessage({ type: 'ssh:input', payload: { data } });
    };

    const handleTerminalResize = (dimensions: { cols: number; rows: number }) => {
        console.log('[SSH终端模块] 发送终端大小调整:', dimensions);
        sendMessage({ type: 'ssh:resize', payload: dimensions });
    };

    // --- WebSocket 消息处理 ---

    const handleSshOutput = (payload: MessagePayload, message: WebSocketMessage) => {
        let outputData = payload;
        // 检查是否为 Base64 编码 (需要后端配合发送 encoding 字段)
        if (message.encoding === 'base64' && typeof outputData === 'string') {
            try {
                outputData = atob(outputData); // 在浏览器环境中使用 atob
            } catch (e) {
                console.error('[SSH终端模块] Base64 解码失败:', e, '原始数据:', message.payload);
                outputData = `\r\n[解码错误: ${e}]\r\n`; // 在终端显示解码错误
            }
        }
        // 如果不是 base64 或解码失败，确保它是字符串
        else if (typeof outputData !== 'string') {
             console.warn('[SSH终端模块] 收到非字符串 ssh:output payload:', outputData);
             try {
                 outputData = JSON.stringify(outputData); // 尝试序列化
             } catch {
                 outputData = String(outputData); // 最后手段：强制转字符串
             }
        }

        if (terminalInstance.value) {
            terminalInstance.value.write(outputData);
        } else {
            // 如果终端还没准备好，先缓冲输出
            terminalOutputBuffer.value.push(outputData);
        }
    };

    const handleSshConnected = () => {
        console.log('[SSH终端模块] SSH 会话已连接。');
        // 连接成功后聚焦终端
        terminalInstance.value?.focus();
        // 清空可能存在的旧缓冲（虽然理论上此时应该已经 ready 了）
        if (terminalOutputBuffer.value.length > 0) {
             console.warn('[SSH终端模块] SSH 连接时仍有缓冲数据，正在写入...');
             terminalOutputBuffer.value.forEach(data => terminalInstance.value?.write(data));
             terminalOutputBuffer.value = [];
        }
    };

    const handleSshDisconnected = (payload: MessagePayload) => {
        const reason = payload || t('workspace.terminal.unknownReason'); // 使用 i18n 获取未知原因文本
        console.log('[SSH终端模块] SSH 会话已断开:', reason);
        terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('disconnectMsg', { reason })}\x1b[0m`);
        // 可以在这里添加其他清理逻辑，例如禁用输入
    };

    const handleSshError = (payload: MessagePayload) => {
        const errorMsg = payload || t('workspace.terminal.unknownSshError'); // 使用 i18n
        console.error('[SSH终端模块] SSH 错误:', errorMsg);
        terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('genericErrorMsg', { message: errorMsg })}\x1b[0m`);
    };

    const handleSshStatus = (payload: MessagePayload) => {
        // 这个消息现在由 useWebSocketConnection 处理以更新全局状态栏消息
        // 这里可以保留日志或用于其他特定于终端的 UI 更新（如果需要）
        const statusKey = payload?.key || 'unknown';
        const statusParams = payload?.params || {};
        console.log('[SSH终端模块] 收到 SSH 状态更新:', statusKey, statusParams);
        // 可以在终端打印一些状态信息吗？
        // terminalInstance.value?.writeln(`\r\n\x1b[34m[状态: ${statusKey}]\x1b[0m`);
    };

    const handleInfoMessage = (payload: MessagePayload) => {
        console.log('[SSH终端模块] 收到后端信息:', payload);
        terminalInstance.value?.writeln(`\r\n\x1b[34m${getTerminalText('infoPrefix')} ${payload}\x1b[0m`);
    };

    const handleErrorMessage = (payload: MessagePayload) => {
        // 通用错误也可能需要显示在终端
        const errorMsg = payload || t('workspace.terminal.unknownGenericError'); // 使用 i18n
        console.error('[SSH终端模块] 收到后端通用错误:', errorMsg);
        terminalInstance.value?.writeln(`\r\n\x1b[31m${getTerminalText('errorPrefix')} ${errorMsg}\x1b[0m`);
    };


    // --- 注册 WebSocket 消息处理器 ---
    const unregisterHandlers: (() => void)[] = [];

    const registerSshHandlers = () => {
        unregisterHandlers.push(onMessage('ssh:output', handleSshOutput));
        unregisterHandlers.push(onMessage('ssh:connected', handleSshConnected));
        unregisterHandlers.push(onMessage('ssh:disconnected', handleSshDisconnected));
        unregisterHandlers.push(onMessage('ssh:error', handleSshError));
        unregisterHandlers.push(onMessage('ssh:status', handleSshStatus));
        unregisterHandlers.push(onMessage('info', handleInfoMessage));
        unregisterHandlers.push(onMessage('error', handleErrorMessage)); // 也处理通用错误
        console.log('[SSH终端模块] 已注册 SSH 相关消息处理器。');
    };

    const unregisterAllSshHandlers = () => {
        console.log('[SSH终端模块] 注销 SSH 相关消息处理器...');
        unregisterHandlers.forEach(unregister => unregister?.());
        unregisterHandlers.length = 0; // 清空数组
    };

    // --- 清理 ---
    onUnmounted(() => {
        unregisterAllSshHandlers();
        // terminalInstance.value?.dispose(); // 终端实例的销毁由 TerminalComponent 负责
        terminalInstance.value = null;
        console.log('[SSH终端模块] Composable 已卸载。');
    });

    // --- 暴露给组件的接口 ---
    return {
        terminalInstance, // 暴露终端实例 ref，以便组件可以访问（如果需要）
        handleTerminalReady,
        handleTerminalData,
        handleTerminalResize,
        registerSshHandlers, // 暴露注册函数，由父组件在连接后调用
        unregisterAllSshHandlers, // 暴露注销函数，在断开或卸载时调用
    };
}
