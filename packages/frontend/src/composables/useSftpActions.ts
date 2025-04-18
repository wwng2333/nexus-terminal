import { ref, readonly, type Ref, type ComputedRef } from 'vue';
import type { FileListItem, EditorFileContent } from '../types/sftp.types';
import type { WebSocketMessage, MessagePayload, MessageHandler } from '../types/websocket.types';
// 导入 UI 通知 store
import { useUiNotificationsStore } from '../stores/uiNotifications.store'; // 更正导入

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
    // const error = ref<string | null>(null); // 不再使用本地 error ref
    const instanceSessionId = sessionId; // 保存会话 ID 用于日志
    const uiNotificationsStore = useUiNotificationsStore(); // 初始化 UI 通知 store

    // 用于存储注销函数的数组
    const unregisterCallbacks: (() => void)[] = [];

    // *** 新增：缓存定义 ***
    const directoryCache = new Map<string, { list: FileListItem[], timestamp: number }>();
    const CACHE_EXPIRY_MS = 5000; // 缓存 5 秒

    // 清理函数，用于注销所有消息处理器
    const cleanup = () => {
        console.log(`[SFTP ${instanceSessionId}] Cleaning up message handlers.`);
        unregisterCallbacks.forEach(cb => cb());
        unregisterCallbacks.length = 0; // 清空数组
    };

    // 不再需要 clearSftpError 函数
    // const clearSftpError = () => { ... };

    // --- Action Methods ---

    const loadDirectory = (path: string) => {
        // *** 新增：检查缓存 ***
        const cachedData = directoryCache.get(path);
        const now = Date.now();
        if (cachedData && (now - cachedData.timestamp < CACHE_EXPIRY_MS)) {
            console.log(`[SFTP ${instanceSessionId}] 使用缓存加载目录: ${path}`);
            fileList.value = cachedData.list; // 直接使用缓存数据
            isLoading.value = false;
            currentPathRef.value = path; // 确保当前路径更新
            return; // 从缓存加载，不再发送请求
        }

        if (!isSftpReady.value) {
            // 使用通知 store 显示错误
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            isLoading.value = false;
            fileList.value = []; // 清空列表，因为 SFTP 未就绪
            console.warn(`[SFTP ${instanceSessionId}] 尝试加载目录 ${path} 但 SFTP 未就绪。`); // 日志改为中文
            return;
        }
        // *** 新增：如果已经在加载，则阻止新的加载请求 ***
        if (isLoading.value) {
            console.warn(`[SFTP ${instanceSessionId}] 尝试加载目录 ${path} 但已在加载中。`);
            return;
        }

        console.log(`[SFTP ${instanceSessionId}] 正在加载目录: ${path}`); // 日志改为中文
        isLoading.value = true;
        // error.value = null; // 不再需要
        currentPathRef.value = path; // 更新外部 ref
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:readdir', requestId: requestId, payload: { path } });
    };

    const createDirectory = (newDirName: string) => {
        if (!isSftpReady.value) {
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            console.warn(`[SFTP ${instanceSessionId}] 尝试创建目录 ${newDirName} 但 SFTP 未就绪。`); // 日志改为中文
            return;
        }
        const newFolderPath = joinPath(currentPathRef.value, newDirName);
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:mkdir', requestId: requestId, payload: { path: newFolderPath } });
    };

    const createFile = (newFileName: string) => {
        if (!isSftpReady.value) {
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            console.warn(`[SFTP ${instanceSessionId}] 尝试创建文件 ${newFileName} 但 SFTP 未就绪。`); // 日志改为中文
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
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            console.warn(`[SFTP ${instanceSessionId}] 尝试删除项目但 SFTP 未就绪。`); // 日志改为中文
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
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            console.warn(`[SFTP ${instanceSessionId}] 尝试重命名项目 ${item.filename} 但 SFTP 未就绪。`); // 日志改为中文
            return;
        }
        if (!newName || item.filename === newName) return;
        const oldPath = joinPath(currentPathRef.value, item.filename);
        // 检查 newName 是否已经是绝对路径 (来自拖拽移动)
        const newPath = newName.startsWith('/')
            ? newName // 如果是绝对路径，直接使用
            : joinPath(currentPathRef.value, newName); // 否则，视为相对路径并拼接
        const requestId = generateRequestId();
        sendMessage({ type: 'sftp:rename', requestId: requestId, payload: { oldPath, newPath } });
    };

    const changePermissions = (item: FileListItem, mode: number) => {
        if (!isSftpReady.value) {
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            console.warn(`[SFTP ${instanceSessionId}] 尝试修改 ${item.filename} 的权限但 SFTP 未就绪。`); // 日志改为中文
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
                const errMsg = t('fileManager.errors.sftpNotReady');
                console.warn(`[SFTP ${instanceSessionId}] 尝试读取文件 ${path} 但 SFTP 未就绪。`); // 日志改为中文
                uiNotificationsStore.showError(errMsg, { timeout: 5000 }); // 使用 uiNotificationsStore
                return reject(new Error(errMsg));
            }
            const requestId = generateRequestId();
            let unregisterSuccess: (() => void) | null = null;
            let unregisterError: (() => void) | null = null;

            const timeoutId = setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                const errMsg = t('fileManager.errors.readFileTimeout');
                uiNotificationsStore.showError(errMsg, { timeout: 5000 }); // 使用 uiNotificationsStore
                reject(new Error(errMsg));
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
                    const errorMsg = errorPayload || t('fileManager.errors.readFileFailed'); // 使用 i18n
                    uiNotificationsStore.showError(`${t('fileManager.errors.readFileError')}: ${errorMsg}`, { timeout: 5000 }); // 使用 uiNotificationsStore
                    reject(new Error(errorMsg));
                }
            });

            sendMessage({ type: 'sftp:readfile', requestId: requestId, payload: { path } });
        });
    };

     const writeFile = (path: string, content: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!isSftpReady.value) {
                 const errMsg = t('fileManager.errors.sftpNotReady');
                 console.warn(`[SFTP ${instanceSessionId}] 尝试写入文件 ${path} 但 SFTP 未就绪。`); // 日志改为中文
                 uiNotificationsStore.showError(errMsg, { timeout: 5000 }); // 使用 uiNotificationsStore
                return reject(new Error(errMsg));
            }
            const requestId = generateRequestId();
            const encoding: 'utf8' | 'base64' = 'utf8'; // 假设总是 utf8
            let unregisterSuccess: (() => void) | null = null;
            let unregisterError: (() => void) | null = null;

            const timeoutId = setTimeout(() => {
                unregisterSuccess?.();
                unregisterError?.();
                const errMsg = t('fileManager.errors.saveTimeout');
                uiNotificationsStore.showError(errMsg, { timeout: 5000 }); // 使用 uiNotificationsStore
                reject(new Error(errMsg));
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
                    const errorMsg = errorPayload || t('fileManager.errors.saveFailed'); // 使用 i18n
                    uiNotificationsStore.showError(errorMsg, { timeout: 5000 }); // 使用 uiNotificationsStore
                    reject(new Error(errorMsg));
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
            console.log(`[SFTP ${instanceSessionId}] 收到目录 ${message.path} 的文件列表`);
            const newList = fileListPayload.sort(sortFiles); // 先排序

            // *** 新增：更新缓存 ***
            directoryCache.set(message.path, { list: newList, timestamp: Date.now() });

            // *** 新增：增量更新逻辑 ***
            const oldList = fileList.value; // 当前显示的列表
            const newListMap = new Map(newList.map(item => [item.filename, item]));
            const oldListMap = new Map(oldList.map(item => [item.filename, item]));

            // 1. 找出需要删除的项
            const itemsToRemove: number[] = []; // 存储要删除的索引
            for (let i = oldList.length - 1; i >= 0; i--) {
                if (!newListMap.has(oldList[i].filename)) {
                    itemsToRemove.push(i);
                }
            }
            // 从后往前删除，避免索引错乱
            itemsToRemove.forEach(index => oldList.splice(index, 1));

            // 2. 找出需要更新和添加的项
            for (let i = 0; i < newList.length; i++) {
                const newItem = newList[i];
                const oldItem = oldListMap.get(newItem.filename);

                if (oldItem) {
                    // 更新现有项 (比较关键属性，避免不必要的更新)
                    const oldIndex = oldList.findIndex(item => item.filename === newItem.filename);
                    // 简单比较 attrs 的 JSON 字符串，如果不同则更新
                    if (oldIndex !== -1 && JSON.stringify(oldList[oldIndex].attrs) !== JSON.stringify(newItem.attrs)) {
                         oldList.splice(oldIndex, 1, newItem); // 使用 splice 替换，确保响应性
                         console.log(`[SFTP ${instanceSessionId}] 更新文件: ${newItem.filename}`);
                    }
                } else {
                    // 添加新项 (找到合适的插入位置以保持排序)
                    let insertIndex = 0;
                    while (insertIndex < oldList.length && sortFiles(newItem, oldList[insertIndex]) > 0) {
                        insertIndex++;
                    }
                    oldList.splice(insertIndex, 0, newItem);
                    console.log(`[SFTP ${instanceSessionId}] 添加文件: ${newItem.filename}`);
                }
            }

            isLoading.value = false;
        } else {
             console.log(`[SFTP ${instanceSessionId}] 忽略目录 ${message.path} 的 readdir 成功消息 (当前: ${currentPathRef.value})`);
        }
    };

    const onSftpReaddirError = (payload: MessagePayload, message: WebSocketMessage) => {
        // 类型断言，因为我们知道 readdir:error 的 payload 是 string
        const errorPayload = payload as string;
        if (message.path === currentPathRef.value) {
            console.error(`[SFTP ${instanceSessionId}] 加载目录 ${message.path} 出错:`, errorPayload); // 日志改为中文
            // error.value = errorPayload; // 使用通知
            uiNotificationsStore.showError(`${t('fileManager.errors.loadDirectoryFailed')}: ${errorPayload}`, { timeout: 5000 }); // 使用 uiNotificationsStore, 添加 i18n key
            isLoading.value = false;
        }
    };

    // 移除通用的 onActionSuccessRefresh

    // *** 新增：具体操作成功后的处理函数 ***

    // 使缓存失效的辅助函数
    const invalidateCache = (path: string) => {
        if (directoryCache.has(path)) {
            directoryCache.delete(path);
            console.log(`[SFTP ${instanceSessionId}] 目录缓存已失效: ${path}`);
        }
    };

    // 处理创建目录成功
    const onMkdirSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const newItem = payload as FileListItem | null; // 后端现在会发送 FileListItem 或 null
        const parentPath = message.path?.substring(0, message.path.lastIndexOf('/')) || '/';

        console.log(`[SFTP ${instanceSessionId}] 创建目录成功: ${message.path}`);

        if (parentPath === currentPathRef.value) {
            if (newItem) {
                // 将新项插入排序列表
                let insertIndex = 0;
                while (insertIndex < fileList.value.length && sortFiles(newItem, fileList.value[insertIndex]) > 0) {
                    insertIndex++;
                }
                fileList.value.splice(insertIndex, 0, newItem);
                console.log(`[SFTP ${instanceSessionId}] 直接添加新目录到列表: ${newItem.filename}`);
                // 更新缓存
                directoryCache.set(currentPathRef.value, { list: [...fileList.value], timestamp: Date.now() });
            } else {
                // 如果后端未能提供新项信息，则刷新
                console.warn(`[SFTP ${instanceSessionId}] Mkdir success for ${message.path} but no item details received. Reloading.`);
                invalidateCache(currentPathRef.value);
                loadDirectory(currentPathRef.value);
            }
        } else {
            // 如果创建在其他目录，只需使那个目录的缓存失效
            invalidateCache(parentPath);
        }
    };

    // 处理删除目录/文件成功
    const onRemoveSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const removedPath = message.path;
        const parentPath = removedPath?.substring(0, removedPath.lastIndexOf('/')) || '/';
        const removedFilename = removedPath?.substring(removedPath.lastIndexOf('/') + 1);

        console.log(`[SFTP ${instanceSessionId}] 删除成功: ${removedPath}`);
        if (parentPath === currentPathRef.value && removedFilename) {
            const index = fileList.value.findIndex(item => item.filename === removedFilename);
            if (index !== -1) {
                fileList.value.splice(index, 1);
                console.log(`[SFTP ${instanceSessionId}] 从列表中移除: ${removedFilename}`);
            }
            invalidateCache(currentPathRef.value); // 使当前目录缓存失效
        } else {
            // 如果删除的是其他目录的内容，只需使那个目录的缓存失效
            invalidateCache(parentPath);
        }
    };

    // 处理重命名成功
    const onRenameSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        // 后端现在发送 { oldPath: string, newPath: string, newItem: FileListItem | null }
        const renamePayload = payload as { oldPath: string, newPath: string, newItem: FileListItem | null };
        const oldParentPath = renamePayload.oldPath.substring(0, renamePayload.oldPath.lastIndexOf('/')) || '/';
        const newParentPath = renamePayload.newPath.substring(0, renamePayload.newPath.lastIndexOf('/')) || '/';
        const oldFilename = renamePayload.oldPath.substring(renamePayload.oldPath.lastIndexOf('/') + 1);
        const newItem = renamePayload.newItem;

        console.log(`[SFTP ${instanceSessionId}] 重命名成功: ${renamePayload.oldPath} -> ${renamePayload.newPath}`);

        if (oldParentPath === currentPathRef.value && newParentPath === currentPathRef.value) {
            const oldIndex = fileList.value.findIndex(item => item.filename === oldFilename);
            if (oldIndex !== -1) {
                fileList.value.splice(oldIndex, 1); // 先移除旧项
                if (newItem) {
                    // 插入新项到正确位置
                    let insertIndex = 0;
                    while (insertIndex < fileList.value.length && sortFiles(newItem, fileList.value[insertIndex]) > 0) {
                        insertIndex++;
                    }
                    fileList.value.splice(insertIndex, 0, newItem);
                    console.log(`[SFTP ${instanceSessionId}] 直接更新重命名项: ${oldFilename} -> ${newItem.filename}`);
                    // 更新缓存
                    directoryCache.set(currentPathRef.value, { list: [...fileList.value], timestamp: Date.now() });
                } else {
                    // 如果后端未能提供新项信息，则刷新
                    console.warn(`[SFTP ${instanceSessionId}] Rename success for ${renamePayload.newPath} but no item details received. Reloading.`);
                    invalidateCache(currentPathRef.value);
                    loadDirectory(currentPathRef.value);
                }
            } else {
                 // 旧文件不在当前列表，可能列表已过时，刷新
                 console.warn(`[SFTP ${instanceSessionId}] Rename success but old item ${oldFilename} not found in list. Reloading.`);
                 invalidateCache(currentPathRef.value);
                 loadDirectory(currentPathRef.value);
            }
        } else {
            // 如果涉及不同目录，使两个目录的缓存都失效
            invalidateCache(oldParentPath);
            invalidateCache(newParentPath);
            // 如果当前目录是其中之一，则刷新
            if (currentPathRef.value === oldParentPath || currentPathRef.value === newParentPath) {
                loadDirectory(currentPathRef.value);
            }
        }
    };

     // 处理修改权限成功
    const onChmodSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const updatedItem = payload as FileListItem | null; // 后端现在会发送 FileListItem 或 null
        const targetPath = message.path;
        const parentPath = targetPath?.substring(0, targetPath.lastIndexOf('/')) || '/';
        const filename = targetPath?.substring(targetPath.lastIndexOf('/') + 1);

        console.log(`[SFTP ${instanceSessionId}] 修改权限成功: ${targetPath}`);

        if (parentPath === currentPathRef.value && filename) {
            if (updatedItem) {
                const index = fileList.value.findIndex(item => item.filename === filename);
                if (index !== -1) {
                    fileList.value.splice(index, 1, updatedItem); // 使用 splice 替换以确保响应性
                    console.log(`[SFTP ${instanceSessionId}] 直接更新权限: ${filename}`);
                    // 更新缓存
                    directoryCache.set(currentPathRef.value, { list: [...fileList.value], timestamp: Date.now() });
                } else {
                    // 文件不在列表，可能列表已过时，刷新
                    console.warn(`[SFTP ${instanceSessionId}] Chmod success but item ${filename} not found in list. Reloading.`);
                    invalidateCache(currentPathRef.value);
                    loadDirectory(currentPathRef.value);
                }
            } else {
                 // 如果后端未能提供更新信息，则刷新
                 console.warn(`[SFTP ${instanceSessionId}] Chmod success for ${targetPath} but no item details received. Reloading.`);
                 invalidateCache(currentPathRef.value);
                 loadDirectory(currentPathRef.value);
            }
        } else {
            // 如果修改的是其他目录的内容，只需使那个目录的缓存失效
            invalidateCache(parentPath);
        }
    };

    // 处理写入文件成功 (新建或修改)
    const onWriteFileSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const updatedItem = payload as FileListItem | null; // 后端现在会发送 FileListItem 或 null
        const filePath = message.path;
        const parentPath = filePath?.substring(0, filePath.lastIndexOf('/')) || '/';
        const filename = filePath?.substring(filePath.lastIndexOf('/') + 1);

        console.log(`[SFTP ${instanceSessionId}] 写入文件成功: ${filePath}`);

        if (parentPath === currentPathRef.value && filename) {
            if (updatedItem) {
                const index = fileList.value.findIndex(item => item.filename === filename);
                if (index !== -1) {
                    // 文件已存在，替换
                    fileList.value.splice(index, 1, updatedItem);
                    console.log(`[SFTP ${instanceSessionId}] 直接更新文件信息: ${filename}`);
                } else {
                    // 文件是新建的，插入
                    let insertIndex = 0;
                    while (insertIndex < fileList.value.length && sortFiles(updatedItem, fileList.value[insertIndex]) > 0) {
                        insertIndex++;
                    }
                    fileList.value.splice(insertIndex, 0, updatedItem);
                    console.log(`[SFTP ${instanceSessionId}] 直接添加新文件到列表: ${filename}`);
                }
                // 更新缓存
                directoryCache.set(currentPathRef.value, { list: [...fileList.value], timestamp: Date.now() });
            } else {
                 // 如果后端未能提供更新信息，则刷新
                 console.warn(`[SFTP ${instanceSessionId}] WriteFile success for ${filePath} but no item details received. Reloading.`);
                 invalidateCache(currentPathRef.value);
                 loadDirectory(currentPathRef.value);
            }
        } else {
            // 如果写入的是其他目录的内容，只需使那个目录的缓存失效
            invalidateCache(parentPath);
        }
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
        // error.value = `${prefix}: ${errorPayload}`; // 使用通知
        uiNotificationsStore.showError(`${prefix}: ${errorPayload}`, { timeout: 5000 }); // 使用 uiNotificationsStore
    };

    // --- Register Handlers & Store Unregister Callbacks ---
    unregisterCallbacks.push(onMessage('sftp:readdir:success', onSftpReaddirSuccess));
    unregisterCallbacks.push(onMessage('sftp:readdir:error', onSftpReaddirError));
    // *** 修改：绑定到新的具体处理函数 ***
    unregisterCallbacks.push(onMessage('sftp:mkdir:success', onMkdirSuccess));
    unregisterCallbacks.push(onMessage('sftp:rmdir:success', onRemoveSuccess)); // 使用 onRemoveSuccess
    unregisterCallbacks.push(onMessage('sftp:unlink:success', onRemoveSuccess)); // 使用 onRemoveSuccess
    unregisterCallbacks.push(onMessage('sftp:rename:success', onRenameSuccess));
    unregisterCallbacks.push(onMessage('sftp:chmod:success', onChmodSuccess));
    unregisterCallbacks.push(onMessage('sftp:writefile:success', onWriteFileSuccess)); // 使用 onWriteFileSuccess
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
        // error: readonly(error), // 移除 error

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
        // clearSftpError, // 移除 clearSftpError

        // Cleanup function
        currentPath: readonly(currentPathRef), // 暴露只读的当前路径 ref

        // Cleanup function
        // Cleanup function
        cleanup,
    };
}

