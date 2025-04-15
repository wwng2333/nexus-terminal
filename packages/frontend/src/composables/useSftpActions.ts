import { ref, readonly, type Ref, type ComputedRef } from 'vue'; // Removed onUnmounted, added ComputedRef
import type { FileListItem, EditorFileContent } from '../types/sftp.types';
import type { WebSocketMessage, MessagePayload, MessageHandler } from '../types/websocket.types'; // 从类型文件导入

/**
 * @interface WebSocketDependencies
 * @description Defines the necessary functions and state required from a WebSocket manager instance.
 */
export interface WebSocketDependencies {
    sendMessage: (message: WebSocketMessage) => void;
    onMessage: (type: string, handler: MessageHandler) => () => void;
    isConnected: ComputedRef<boolean>;
    isSftpReady: Readonly<Ref<boolean>>;
}

// Helper function
const generateRequestId = (): string => `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Helper function
const joinPath = (base: string, name: string): string => {
    if (base === '/') return `/${name}`;
    return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
};

// Helper function
const sortFiles = (a: FileListItem, b: FileListItem): number => {
    if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
    if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
    return a.filename.localeCompare(b.filename);
};

/**
 * 创建并管理单个 SFTP 会话的操作。
 * 每个实例对应一个会话 (Session) 并依赖于一个 WebSocket 管理器实例。
 *
 * @param {string} sessionId - 此 SFTP 管理器关联的会话 ID (用于日志记录)。
 * @param {Ref<string>} currentPathRef - 一个外部 ref，用于跟踪和更新当前目录路径。
 * @param {WebSocketDependencies} wsDeps - 从对应的 WebSocket 管理器实例注入的依赖项。
 * @param {Function} t - i18n 翻译函数，从父组件传入
 * @returns 一个包含状态、方法和清理函数的 SFTP 操作管理器对象。
 */
export function createSftpActionsManager(
    sessionId: string,
    currentPathRef: Ref<string>,
    wsDeps: WebSocketDependencies,
    t: Function
) {
    const { sendMessage, onMessage, isConnected, isSftpReady } = wsDeps; // 使用注入的依赖

    const fileList = ref<FileListItem[]>([]);
    const isLoading = ref<boolean>(false);
    const error = ref<string | null>(null);
    const instanceSessionId = sessionId; // 保存会话 ID 用于日志

    // 用于存储注销函数的数组
    const unregisterCallbacks: (() => void)[] = [];

    // 清理函数，用于注销所有消息处理器
    const cleanup = () => {
        console.log(`[SFTP ${instanceSessionId}] Cleaning up message handlers.`);
        unregisterCallbacks.forEach(cb => cb());
        unregisterCallbacks.length = 0; // 清空数组
    };

    // 清除错误状态的函数
    const clearSftpError = () => {
        error.value = null;
    };

    // --- Action Methods ---

    const loadDirectory = (path: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            isLoading.value = false;
            fileList.value = [];
            console.warn(`[SFTP ${instanceSessionId}] Attempted to load directory ${path} but SFTP is not ready.`);
            return;
        }

        console.log(`[SFTP ${instanceSessionId}] Loading directory: ${path}`);
        isLoading.value = true;
        error.value = null;
        currentPathRef.value = path; // 更新外部 ref
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:readdir', requestId: requestId, payload: { path } });
    };

    const createDirectory = (newDirName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[SFTP ${instanceSessionId}] Attempted to create directory ${newDirName} but SFTP is not ready.`);
            return;
        }
        const newFolderPath = joinPath(currentPathRef.value, newDirName);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:mkdir', requestId: requestId, payload: { path: newFolderPath } });
    };

    const createFile = (newFileName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[SFTP ${instanceSessionId}] Attempted to create file ${newFileName} but SFTP is not ready.`);
            return;
        }
        const newFilePath = joinPath(currentPathRef.value, newFileName);
        const requestId = generateRequestId();
        sendMessage({
            type: 'sftp:writefile',
            requestId: requestId,
            payload: { path: newFilePath, content: '', encoding: 'utf8' }
        });
    };

    const deleteItems = (items: FileListItem[]) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[SFTP ${instanceSessionId}] Attempted to delete items but SFTP is not ready.`);
            return;
        }
        if (items.length === 0) return;
        items.forEach(item => {
            const targetPath = joinPath(currentPathRef.value, item.filename);
            const actionType = item.attrs.isDirectory ? 'sftp:rmdir' : 'sftp:unlink';
            const requestId = generateRequestId();
            sendMessage({ type: actionType, requestId: requestId, payload: { path: targetPath } });
        });
    };

    const renameItem = (item: FileListItem, newName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[SFTP ${instanceSessionId}] Attempted to rename item ${item.filename} but SFTP is not ready.`);
            return;
        }
        if (!newName || item.filename === newName) return;
        const oldPath = joinPath(currentPathRef.value, item.filename);
        const newPath = joinPath(currentPathRef.value, newName);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:rename', requestId: requestId, payload: { oldPath, newPath } });
    };

    const changePermissions = (item: FileListItem, mode: number) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[SFTP ${instanceSessionId}] Attempted to change permissions for ${item.filename} but SFTP is not ready.`);
            return;
        }
        const targetPath = joinPath(currentPathRef.value, item.filename);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:chmod', requestId: requestId, payload: { path: targetPath, mode: mode } });
    };

    // readFile 和 writeFile 仍然返回 Promise，并在内部处理自己的消息监听器注销
    const readFile = (path: string): Promise<EditorFileContent> => {
        return new Promise((resolve, reject) => {
            if (!isSftpReady.value) {
                console.warn(`[SFTP ${instanceSessionId}] Attempted to read file ${path} but SFTP is not ready.`);
                return reject(new Error(t('fileManager.errors.sftpNotReady')));
            }
            const requestId = generateRequestId();
            let unregisterSuccess: (() => void) | null = null;
            let unregisterError: (() => void) | null = null;

            const timeoutId = setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                reject(new Error(t('fileManager.errors.readFileTimeout')));
            }, 20000); // 20 秒超时

            unregisterSuccess = onMessage('sftp:readfile:success', (payload: MessagePayload, message: WebSocketMessage) => {
                // 确保 payload 是期望的类型
                const successPayload = payload as { content: string; encoding: 'utf8' | 'base64' };
                if (message.requestId === requestId && message.path === path) {
                    clearTimeout(timeoutId);
                    unregisterSuccess?.();
                    unregisterError?.();
                    resolve({ content: successPayload.content, encoding: successPayload.encoding });
                }
            });

            unregisterError = onMessage('sftp:readfile:error', (payload: MessagePayload, message: WebSocketMessage) => {
                 // 确保 payload 是期望的类型 (string)
                 const errorPayload = payload as string;
                if (message.requestId === requestId && message.path === path) {
                    clearTimeout(timeoutId);
                    unregisterSuccess?.();
                    unregisterError?.();
                    reject(new Error(errorPayload || 'Failed to read file'));
                }
            });

            sendMessage({ type: 'sftp:readfile', requestId: requestId, payload: { path } });
        });
    };

     const writeFile = (path: string, content: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!isSftpReady.value) {
                 console.warn(`[SFTP ${instanceSessionId}] Attempted to write file ${path} but SFTP is not ready.`);
                return reject(new Error(t('fileManager.errors.sftpNotReady')));
            }
            const requestId = generateRequestId();
            const encoding: 'utf8' | 'base64' = 'utf8'; // 假设总是 utf8
            let unregisterSuccess: (() => void) | null = null;
            let unregisterError: (() => void) | null = null;

            const timeoutId = setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                reject(new Error(t('fileManager.errors.saveTimeout')));
            }, 20000); // 20 秒超时

            unregisterSuccess = onMessage('sftp:writefile:success', (payload: MessagePayload, message: WebSocketMessage) => {
                if (message.requestId === requestId && message.path === path) {
                    clearTimeout(timeoutId);
                    unregisterSuccess?.();
                    unregisterError?.();
                    resolve();
                }
            });

            unregisterError = onMessage('sftp:writefile:error', (payload: MessagePayload, message: WebSocketMessage) => {
                // 确保 payload 是期望的类型 (string)
                const errorPayload = payload as string;
                if (message.requestId === requestId && message.path === path) {
                    clearTimeout(timeoutId);
                    unregisterSuccess?.();
                    unregisterError?.();
                    reject(new Error(errorPayload || 'Failed to write file'));
                }
            });

            sendMessage({
                type: 'sftp:writefile',
                requestId: requestId,
                payload: { path, content, encoding }
            });
        });
    };


    // --- Message Handlers ---

    const onSftpReaddirSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        // 类型断言，因为我们知道 readdir:success 的 payload 是 FileListItem[]
        const fileListPayload = payload as FileListItem[];
        if (message.path === currentPathRef.value) {
            console.log(`[SFTP ${instanceSessionId}] Received file list for ${message.path}`);
            fileList.value = fileListPayload.sort(sortFiles);
            isLoading.value = false;
            error.value = null;
        } else {
             console.log(`[SFTP ${instanceSessionId}] Ignoring readdir success for ${message.path} (current: ${currentPathRef.value})`);
        }
    };

    const onSftpReaddirError = (payload: MessagePayload, message: WebSocketMessage) => {
        // 类型断言，因为我们知道 readdir:error 的 payload 是 string
        const errorPayload = payload as string;
        if (message.path === currentPathRef.value) {
            console.error(`[SFTP ${instanceSessionId}] Error loading directory ${message.path}:`, errorPayload);
            error.value = errorPayload;
            isLoading.value = false;
        }
    };

    const onActionSuccessRefresh = (payload: MessagePayload, message: WebSocketMessage) => {
        console.log(`[SFTP ${instanceSessionId}] Action ${message.type} successful. Refreshing current directory: ${currentPathRef.value}`);
        loadDirectory(currentPathRef.value);
        error.value = null;
    };

    const onActionError = (payload: MessagePayload, message: WebSocketMessage) => {
        // 类型断言，因为我们知道这些错误的 payload 是 string
        const errorPayload = payload as string;
        console.error(`[SFTP ${instanceSessionId}] Action ${message.type} failed:`, errorPayload);
        const actionTypeMap: Record<string, string> = {
            'sftp:mkdir:error': t('fileManager.errors.createFolderFailed'),
            'sftp:rmdir:error': t('fileManager.errors.deleteFailed'),
            'sftp:unlink:error': t('fileManager.errors.deleteFailed'),
            'sftp:rename:error': t('fileManager.errors.renameFailed'),
            'sftp:chmod:error': t('fileManager.errors.chmodFailed'),
            'sftp:writefile:error': t('fileManager.errors.saveFailed'),
        };
        const prefix = actionTypeMap[message.type] || t('fileManager.errors.generic');
        error.value = `${prefix}: ${errorPayload}`;
    };

    // --- Register Handlers & Store Unregister Callbacks ---
    unregisterCallbacks.push(onMessage('sftp:readdir:success', onSftpReaddirSuccess));
    unregisterCallbacks.push(onMessage('sftp:readdir:error', onSftpReaddirError));
    unregisterCallbacks.push(onMessage('sftp:mkdir:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:rmdir:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:unlink:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:rename:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:chmod:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:writefile:success', onActionSuccessRefresh));
    unregisterCallbacks.push(onMessage('sftp:mkdir:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:rmdir:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:unlink:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:rename:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:chmod:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:writefile:error', onActionError));

    // 移除 onUnmounted 块

    return {
        // State
        fileList: readonly(fileList),
        isLoading: readonly(isLoading),
        error: readonly(error),

        // Methods
        loadDirectory,
        createDirectory,
        createFile,
        deleteItems,
        renameItem,
        changePermissions,
        readFile,
        writeFile,
        joinPath, // 暴露辅助函数
        clearSftpError,

        // Cleanup function
        cleanup,
    };
}
