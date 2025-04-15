import { ref, readonly, type Ref, onUnmounted } from 'vue';
import { useWebSocketConnection } from './useWebSocketConnection'; // 只导入 hook
import { useI18n } from 'vue-i18n';
// 确保从类型文件导入所有需要的类型
import type { FileListItem, FileAttributes, EditorFileContent } from '../types/sftp.types';
import type { WebSocketMessage, MessagePayload } from '../types/websocket.types'; // 从类型文件导入

// --- 接口定义 (已移至 sftp.types.ts) ---

// Helper function (Copied from FileManager.vue)
const generateRequestId = (): string => {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Helper function (Copied from FileManager.vue)
const joinPath = (base: string, name: string): string => {
    if (base === '/') return `/${name}`;
    // Handle cases where base might end with '/' already
    if (base.endsWith('/')) return `${base}${name}`;
    return `${base}/${name}`;
};

// Helper function (Copied from FileManager.vue)
const sortFiles = (a: FileListItem, b: FileListItem): number => {
    if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
    if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
    return a.filename.localeCompare(b.filename);
};


export function useSftpActions(currentPathRef: Ref<string>) {
    const { t } = useI18n();
    // Import isSftpReady along with other needed functions/state
    const { sendMessage, onMessage, isConnected, isSftpReady } = useWebSocketConnection();

    const fileList = ref<FileListItem[]>([]);
    const isLoading = ref<boolean>(false);
    const error = ref<string | null>(null);

    // --- Action Methods ---

    const loadDirectory = (path: string) => {
        // Check if SFTP is ready first
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady'); // Use a specific error message
            isLoading.value = false;
            fileList.value = []; // Clear list if not ready
            console.warn(`[useSftpActions] Attempted to load directory ${path} but SFTP is not ready.`);
            return;
        }
        // Original isConnected check might still be relevant as a fallback, but isSftpReady implies isConnected
        // if (!isConnected.value) { ... } // Can likely be removed if isSftpReady logic is robust

        console.log(`[useSftpActions] Loading directory: ${path}`);
        isLoading.value = true;
        error.value = null;
        currentPathRef.value = path; // Update the external ref passed in
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:readdir', requestId: requestId, payload: { path } });
        // Response handled by onSftpReaddirSuccess/Error
    };

    const createDirectory = (newDirName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[useSftpActions] Attempted to create directory ${newDirName} but SFTP is not ready.`);
            return;
        }
        const newFolderPath = joinPath(currentPathRef.value, newDirName);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:mkdir', requestId: requestId, payload: { path: newFolderPath } });
        // Response handled by onSftpMkdirSuccess/Error
    };

    const createFile = (newFileName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[useSftpActions] Attempted to create file ${newFileName} but SFTP is not ready.`);
            return;
        }
        const newFilePath = joinPath(currentPathRef.value, newFileName);
        const requestId = generateRequestId();
        sendMessage({
            type: 'sftp:writefile',
            requestId: requestId,
            payload: { path: newFilePath, content: '', encoding: 'utf8' } // Create by writing empty content
        });
        // Response handled by onSftpWriteFileSuccess/Error (will trigger refresh)
    };

    const deleteItems = (items: FileListItem[]) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[useSftpActions] Attempted to delete items but SFTP is not ready.`);
            return;
        }
        if (items.length === 0) return;
        items.forEach(item => {
            const targetPath = joinPath(currentPathRef.value, item.filename);
            const actionType = item.attrs.isDirectory ? 'sftp:rmdir' : 'sftp:unlink';
            const requestId = generateRequestId();
            sendMessage({ type: actionType, requestId: requestId, payload: { path: targetPath } });
        });
        // Responses handled by onSftpRmdirSuccess/Error, onSftpUnlinkSuccess/Error (will trigger refresh)
    };

    const renameItem = (item: FileListItem, newName: string) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[useSftpActions] Attempted to rename item ${item.filename} but SFTP is not ready.`);
            return;
        }
        if (!newName || item.filename === newName) return;
        const oldPath = joinPath(currentPathRef.value, item.filename);
        const newPath = joinPath(currentPathRef.value, newName);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:rename', requestId: requestId, payload: { oldPath, newPath } });
        // Response handled by onSftpRenameSuccess/Error (will trigger refresh)
    };

    const changePermissions = (item: FileListItem, mode: number) => {
        if (!isSftpReady.value) {
            error.value = t('fileManager.errors.sftpNotReady');
            console.warn(`[useSftpActions] Attempted to change permissions for ${item.filename} but SFTP is not ready.`);
            return;
        }
        const targetPath = joinPath(currentPathRef.value, item.filename);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:chmod', requestId: requestId, payload: { path: targetPath, mode: mode } });
        // Response handled by onSftpChmodSuccess/Error (will trigger refresh)
    };

    // 注意: readFile 和 writeFile 的核心逻辑将由 useFileEditor 管理,
    // 但 useSftpActions 可以提供基础的发送/接收机制（如果其他地方需要），
    // 或者 useFileEditor 可以直接调用 sendMessage。暂时保留这些方法在这里。

    const readFile = (path: string): Promise<EditorFileContent> => { // 使用导入的 EditorFileContent 类型
        return new Promise((resolve, reject) => {
            if (!isSftpReady.value) {
                console.warn(`[useSftpActions] Attempted to read file ${path} but SFTP is not ready.`);
                return reject(new Error(t('fileManager.errors.sftpNotReady')));
            }
            const requestId = generateRequestId();

            const unregisterSuccess = onMessage('sftp:readfile:success', (payload, message) => {
                if (message.requestId === requestId && message.path === path) {
                    unregisterSuccess?.();
                    unregisterError?.();
                    resolve({ content: payload.content, encoding: payload.encoding });
                }
            });

            const unregisterError = onMessage('sftp:readfile:error', (payload, message) => {
                if (message.requestId === requestId && message.path === path) {
                    unregisterSuccess?.();
                    unregisterError?.();
                    reject(new Error(payload || 'Failed to read file'));
                }
            });

            sendMessage({ type: 'sftp:readfile', requestId: requestId, payload: { path } });

            // Timeout for the request
            setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                reject(new Error(t('fileManager.errors.readFileTimeout')));
            }, 20000); // 20 second timeout
        });
    };

     const writeFile = (path: string, content: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!isSftpReady.value) {
                 console.warn(`[useSftpActions] Attempted to write file ${path} but SFTP is not ready.`);
                return reject(new Error(t('fileManager.errors.sftpNotReady')));
            }
            const requestId = generateRequestId();
            const encoding: 'utf8' | 'base64' = 'utf8'; // Assuming always sending utf8

            const unregisterSuccess = onMessage('sftp:writefile:success', (payload, message) => {
                if (message.requestId === requestId && message.path === path) {
                    unregisterSuccess?.();
                    unregisterError?.();
                    resolve();
                }
            });

            const unregisterError = onMessage('sftp:writefile:error', (payload, message) => {
                if (message.requestId === requestId && message.path === path) {
                    unregisterSuccess?.();
                    unregisterError?.();
                    reject(new Error(payload || 'Failed to write file'));
                }
            });

            sendMessage({
                type: 'sftp:writefile',
                requestId: requestId,
                payload: { path, content, encoding }
            });

             // Timeout for the request
             setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                reject(new Error(t('fileManager.errors.saveTimeout')));
            }, 20000); // 20 second timeout
        });
    };


    // --- Message Handlers ---

    const onSftpReaddirSuccess = (payload: FileListItem[], message: WebSocketMessage) => {
        // Only update if the path matches the current path this composable instance is tracking
        if (message.path === currentPathRef.value) {
            console.log(`[useSftpActions] Received file list for ${message.path}`);
            fileList.value = payload.sort(sortFiles);
            isLoading.value = false;
            error.value = null;
        } else {
             console.log(`[useSftpActions] Ignoring readdir success for ${message.path} (current: ${currentPathRef.value})`);
        }
    };

    const onSftpReaddirError = (payload: string, message: WebSocketMessage) => {
        if (message.path === currentPathRef.value) {
            console.error(`[useSftpActions] Error loading directory ${message.path}:`, payload);
            error.value = payload;
            isLoading.value = false;
            fileList.value = []; // Clear list on error
        }
    };

    // Generic handler for actions that should trigger a refresh on success
    const onActionSuccessRefresh = (payload: MessagePayload, message: WebSocketMessage) => {
        // Simplify: Always refresh the current directory on any relevant success action.
        // This avoids potential issues with path comparison logic.
        console.log(`[useSftpActions] Action ${message.type} successful. Refreshing current directory: ${currentPathRef.value}`);
        loadDirectory(currentPathRef.value); // Refresh the current directory
        error.value = null; // Clear previous errors on success
    };

    // Generic handler for action errors
    const onActionError = (payload: string, message: WebSocketMessage) => {
        console.error(`[useSftpActions] Action ${message.type} failed:`, payload);
        // Display a generic error or use specific messages based on type
        const actionTypeMap: Record<string, string> = {
            'sftp:mkdir:error': t('fileManager.errors.createFolderFailed'),
            'sftp:rmdir:error': t('fileManager.errors.deleteFailed'),
            'sftp:unlink:error': t('fileManager.errors.deleteFailed'),
            'sftp:rename:error': t('fileManager.errors.renameFailed'),
            'sftp:chmod:error': t('fileManager.errors.chmodFailed'),
            'sftp:writefile:error': t('fileManager.errors.saveFailed'), // Added writefile error
        };
        const prefix = actionTypeMap[message.type] || t('fileManager.errors.generic');
        error.value = `${prefix}: ${payload}`;
        // Optionally stop loading indicator if one was active for this action
    };

    // --- Register Handlers ---
    const unregisterReaddirSuccess = onMessage('sftp:readdir:success', onSftpReaddirSuccess);
    const unregisterReaddirError = onMessage('sftp:readdir:error', onSftpReaddirError);

    // Register generic handlers for actions that trigger refresh on success
    const unregisterMkdirSuccess = onMessage('sftp:mkdir:success', onActionSuccessRefresh);
    const unregisterRmdirSuccess = onMessage('sftp:rmdir:success', onActionSuccessRefresh);
    const unregisterUnlinkSuccess = onMessage('sftp:unlink:success', onActionSuccessRefresh);
    const unregisterRenameSuccess = onMessage('sftp:rename:success', onActionSuccessRefresh);
    const unregisterChmodSuccess = onMessage('sftp:chmod:success', onActionSuccessRefresh);
    const unregisterWritefileSuccess = onMessage('sftp:writefile:success', onActionSuccessRefresh); // Refresh on successful write too

    // Register generic error handlers
    const unregisterMkdirError = onMessage('sftp:mkdir:error', onActionError);
    const unregisterRmdirError = onMessage('sftp:rmdir:error', onActionError);
    const unregisterUnlinkError = onMessage('sftp:unlink:error', onActionError);
    const unregisterRenameError = onMessage('sftp:rename:error', onActionError);
    const unregisterChmodError = onMessage('sftp:chmod:error', onActionError);
    const unregisterWritefileError = onMessage('sftp:writefile:error', onActionError); // Handle writefile error display

    // Unregister handlers when the composable's scope is destroyed
    onUnmounted(() => {
        console.log('[useSftpActions] Unmounting and unregistering handlers.');
        unregisterReaddirSuccess?.();
        unregisterReaddirError?.();
        unregisterMkdirSuccess?.();
        unregisterRmdirSuccess?.();
        unregisterUnlinkSuccess?.();
        unregisterRenameSuccess?.();
        unregisterChmodSuccess?.();
        unregisterWritefileSuccess?.();
        unregisterMkdirError?.();
        unregisterRmdirError?.();
        unregisterUnlinkError?.();
        unregisterRenameError?.();
        unregisterChmodError?.();
        unregisterWritefileError?.();
        // Note: readFile/writeFile promise handlers are unregistered within the promise logic
    });

    return {
        // State
        fileList: readonly(fileList),
        isLoading: readonly(isLoading),
        error: readonly(error),
        // currentPath: readonly(currentPath), // Path is managed via the passed ref

        // Methods
        loadDirectory,
        createDirectory,
        createFile,
        deleteItems,
        renameItem,
        changePermissions,
        readFile, // Expose if needed by editor composable
        writeFile, // Expose if needed by editor composable
        joinPath, // Expose helper if needed externally
    };
}
