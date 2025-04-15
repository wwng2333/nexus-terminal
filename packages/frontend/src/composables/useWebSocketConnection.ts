import { ref, shallowRef, onUnmounted, computed, type Ref, readonly } from 'vue';
import { useI18n } from 'vue-i18n';
// 从类型文件导入 WebSocket 相关类型
import type { ConnectionStatus, MessagePayload, WebSocketMessage, MessageHandler } from '../types/websocket.types';

// --- 类型定义 (已移至 websocket.types.ts) ---
// export type ConnectionStatus = ...;
// export type MessagePayload = ...;
// export interface WebSocketMessage { ... }
// export type MessageHandler = ...;

// --- Singleton State within the module scope ---
// This ensures only one WebSocket connection and state is managed across the app.
const ws = shallowRef<WebSocket | null>(null); // Use shallowRef for the WebSocket object itself
const connectionStatus = ref<ConnectionStatus>('disconnected');
const statusMessage = ref<string>('');
const connectionIdForSession = ref<string | null>(null); // Store the connectionId used for the current session
const isSftpReady = ref<boolean>(false); // Track SFTP readiness

// Registry for message handlers
const messageHandlers = new Map<string, Set<MessageHandler>>();
// --- End Singleton State ---


export function useWebSocketConnection() {
    const { t } = useI18n(); // Get t function for status messages

    // Helper to get status text safely
    const getStatusText = (statusKey: string, params?: Record<string, unknown>): string => {
        try {
            // Use a fallback key or message if translation is missing
            const translated = t(`workspace.status.${statusKey}`, params || {});
            // Check if the key itself was returned (indicating missing translation)
            return translated === `workspace.status.${statusKey}` ? statusKey : translated;
        } catch (e) {
            console.warn(`[i18n] Error getting translation for workspace.status.${statusKey}:`, e);
            return statusKey; // Fallback to the key itself
        }
    };

    // Function to dispatch a message to all registered handlers for its type
    const dispatchMessage = (type: string, payload: MessagePayload, fullMessage: WebSocketMessage) => {
        if (messageHandlers.has(type)) {
            messageHandlers.get(type)?.forEach(handler => {
                try {
                    handler(payload, fullMessage);
                } catch (e) {
                    console.error(`[WebSocket] Error in message handler for type "${type}":`, e);
                }
            });
        }
    };


    const connect = (url: string, connId: string) => {
        // Prevent multiple connections or connection attempts
        if (ws.value && (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING)) {
            // If it's the same connection ID and already open/connecting, do nothing
            if (connectionIdForSession.value === connId) {
                 console.warn(`[WebSocket] Connection for ${connId} already open or connecting.`);
                 return;
            }
            // If different connection ID, close the old one first
            console.log(`[WebSocket] Closing existing connection for ${connectionIdForSession.value} before connecting to ${connId}`);
            disconnect(); // Ensure cleanup before new connection
        }

        console.log(`[WebSocket] Attempting to connect to: ${url} for connection ${connId}`);
        connectionIdForSession.value = connId;
        statusMessage.value = getStatusText('connectingWs', { url });
        connectionStatus.value = 'connecting';

        try {
            ws.value = new WebSocket(url);

            ws.value.onopen = () => {
                console.log('[WebSocket] Connection opened.');
                statusMessage.value = getStatusText('wsConnected');
                // Status remains 'connecting' until ssh:connected is received
                // Send the initial connection message required by the backend
                sendMessage({ type: 'ssh:connect', payload: { connectionId: connId } });
                // Dispatch an internal event if needed
                // dispatchMessage('internal:opened', {}, { type: 'internal:opened' });
            };

            ws.value.onmessage = (event: MessageEvent) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    // console.debug('[WebSocket] Received:', message.type); // Less verbose logging

                    // --- Update Global Connection Status based on specific messages ---
                    if (message.type === 'ssh:connected') {
                        if (connectionStatus.value !== 'connected') {
                            console.log('[WebSocket] SSH session connected.');
                            connectionStatus.value = 'connected';
                            statusMessage.value = getStatusText('connected');
                        }
                    } else if (message.type === 'ssh:disconnected') {
                         if (connectionStatus.value !== 'disconnected') {
                            console.log('[WebSocket] SSH session disconnected.');
                            connectionStatus.value = 'disconnected';
                            statusMessage.value = getStatusText('disconnected', { reason: message.payload || 'Unknown reason' });
                         }
                    } else if (message.type === 'ssh:error' || message.type === 'error') { // Handle generic backend errors too
                        if (connectionStatus.value !== 'disconnected' && connectionStatus.value !== 'error') {
                            console.error('[WebSocket] Received error message:', message.payload);
                            connectionStatus.value = 'error';
                            let errorMsg = message.payload || 'Unknown error';
                            if (typeof errorMsg === 'object' && errorMsg.message) errorMsg = errorMsg.message;
                            statusMessage.value = getStatusText('error', { message: errorMsg });
                            isSftpReady.value = false; // Reset SFTP status on error
                        }
                    } else if (message.type === 'sftp_ready') {
                        console.log('[WebSocket] SFTP session ready.');
                        isSftpReady.value = true;
                    }
                    // --- End Status Update ---

                    // Dispatch message to specific handlers
                    dispatchMessage(message.type, message.payload, message);

                } catch (e) {
                    console.error('[WebSocket] Error processing message:', e, 'Raw data:', event.data);
                    // Optionally dispatch raw data if needed by some handler
                    // dispatchMessage('internal:raw', event.data, { type: 'internal:raw' });
                }
            };

            ws.value.onerror = (event) => {
                console.error('[WebSocket] Connection error:', event);
                if (connectionStatus.value !== 'disconnected') { // Avoid overwriting disconnect status
                    connectionStatus.value = 'error';
                    statusMessage.value = getStatusText('wsError');
                }
                dispatchMessage('internal:error', event, { type: 'internal:error' });
                isSftpReady.value = false; // Reset SFTP status on WS error
                ws.value = null; // Clean up on error
                connectionIdForSession.value = null;
            };

            ws.value.onclose = (event) => {
                console.log(`[WebSocket] Connection closed: Code=${event.code}, Reason=${event.reason}`);
                // Update status only if not already handled by ssh:disconnected or error
                if (connectionStatus.value !== 'disconnected' && connectionStatus.value !== 'error') {
                    connectionStatus.value = 'disconnected';
                    statusMessage.value = getStatusText('wsClosed', { code: event.code });
                }
                dispatchMessage('internal:closed', { code: event.code, reason: event.reason }, { type: 'internal:closed' });
                isSftpReady.value = false; // Reset SFTP status on close
                ws.value = null; // Clean up reference
                connectionIdForSession.value = null;
                // Optionally clear handlers on close? Depends on desired behavior.
                // messageHandlers.clear();
            };
        } catch (err) {
             console.error('[WebSocket] Failed to create WebSocket instance:', err);
             connectionStatus.value = 'error';
             statusMessage.value = getStatusText('wsError'); // Or a more specific creation error
             isSftpReady.value = false; // Reset SFTP status on creation error
             ws.value = null;
             connectionIdForSession.value = null;
        }
    };

    const disconnect = () => {
        if (ws.value) {
            console.log('[WebSocket] Closing connection manually...');
            // Set status immediately to prevent race conditions with onclose
            if (connectionStatus.value !== 'disconnected') {
                 connectionStatus.value = 'disconnected';
                 statusMessage.value = getStatusText('disconnected', { reason: 'Manual disconnect' });
            }
             ws.value.close(1000, 'Client initiated disconnect'); // Use standard code and reason
             ws.value = null;
             connectionIdForSession.value = null;
             isSftpReady.value = false; // Reset SFTP status on manual disconnect
            // messageHandlers.clear(); // Clear handlers on manual disconnect
        }
    };

    const sendMessage = (message: WebSocketMessage) => {
        if (ws.value && ws.value.readyState === WebSocket.OPEN) {
            try {
                const messageString = JSON.stringify(message);
                // console.debug('[WebSocket] Sending:', message.type); // Less verbose
                ws.value.send(messageString);
            } catch (e) {
                console.error('[WebSocket] Failed to stringify or send message:', e, message);
            }
        } else {
            console.warn(`[WebSocket] Cannot send message, connection not open. State: ${connectionStatus.value}, ReadyState: ${ws.value?.readyState}`);
        }
    };

    // Register a handler for a specific message type
    const onMessage = (type: string, handler: MessageHandler) => {
        if (!messageHandlers.has(type)) {
            messageHandlers.set(type, new Set());
        }
        const handlersSet = messageHandlers.get(type);
        if (handlersSet) {
             handlersSet.add(handler);
             console.debug(`[WebSocket] Handler registered for type: ${type}`);
        }


        // Return an unregister function
        return () => {
            const currentSet = messageHandlers.get(type);
            if (currentSet) {
                currentSet.delete(handler);
                console.debug(`[WebSocket] Handler unregistered for type: ${type}`);
                if (currentSet.size === 0) {
                    messageHandlers.delete(type);
                }
            }
        };
    };

    // Cleanup logic: The singleton nature means disconnect should be called explicitly
    // when the connection is no longer needed (e.g., when WorkspaceView unmounts).
    // onUnmounted is generally tied to the component instance using the composable.
    // If useWebSocketConnection is called in WorkspaceView's setup, its onUnmounted
    // will trigger disconnect, which is the desired behavior.

    return {
        // State (Exported as readonly refs where appropriate)
        isConnected: computed(() => connectionStatus.value === 'connected'),
        isSftpReady: readonly(isSftpReady), // Expose SFTP readiness state
        connectionStatus: readonly(connectionStatus),
        statusMessage: readonly(statusMessage),

        // Methods
        connect,
        disconnect,
        sendMessage,
        onMessage,
    };
}
