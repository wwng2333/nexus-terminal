import { ref, readonly, reactive, computed, type Ref, type ComputedRef } from 'vue'; // 引入 reactive 和 computed
import type { FileListItem, FileAttributes, EditorFileContent } from '../types/sftp.types'; // 修正导入为 FileAttributes
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

// *** 新增：文件树节点接口 ***
export interface FileTreeNode {
    filename: string;
    longname: string; // 保留 longname 以便显示
    attrs: FileAttributes; // 使用正确的类型 FileAttributes
    children: FileTreeNode[] | null; // 子节点数组，null 表示未加载
    childrenLoaded: boolean; // 标记子节点是否已加载
    // 可以添加其他需要的状态，例如 isLoadingChildren
}

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

    // const fileList = ref<FileListItem[]>([]); // 不再直接使用 fileList ref
    const isLoading = ref<boolean>(false);
    // const error = ref<string | null>(null); // 不再使用本地 error ref
    const instanceSessionId = sessionId; // 保存会话 ID 用于日志
    const uiNotificationsStore = useUiNotificationsStore(); // 初始化 UI 通知 store

    // 用于存储注销函数的数组
    const unregisterCallbacks: (() => void)[] = [];

    // *** 新增：响应式文件树 ***
    const fileTree = reactive<FileTreeNode>({
        filename: '/', // 根节点代表根目录
        longname: '/',
        attrs: { // 模拟根目录的属性
            isDirectory: true,
            isFile: false,
            isSymbolicLink: false,
            size: 0,
            mtime: 0,
            atime: 0,
            uid: 0,
            gid: 0,
            mode: 0o755 // 典型目录权限
            // 移除不存在的 permissions 属性
        },
        children: null, // 初始时子节点未加载
        childrenLoaded: false,
    });

    // 清理函数，用于注销所有消息处理器
    const cleanup = () => {
        console.log(`[SFTP ${instanceSessionId}] Cleaning up message handlers.`);
        unregisterCallbacks.forEach(cb => cb());
        unregisterCallbacks.length = 0; // 清空数组
    };

    // 不再需要 clearSftpError 函数
    // const clearSftpError = () => { ... };

    // --- Action Methods ---

    // *** 修改：辅助函数 - 在文件树中查找节点，可选创建占位符 ***
    const findNodeByPath = (root: FileTreeNode, path: string, createIfMissing: boolean = false): FileTreeNode | null => {
        if (path === '/') return root;
        const parts = path.split('/').filter(p => p);
        let currentNode: FileTreeNode = root; // Start from root

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            let nextNode: FileTreeNode | undefined = undefined;

            // Check if children array exists and try to find the node
            if (currentNode.children) {
                nextNode = currentNode.children.find(child => child.filename === part);
                // If node not found in existing (potentially partial) children list
                if (!nextNode) {
                    if (!currentNode.childrenLoaded && !createIfMissing) {
                        // Parent not fully loaded, node not found in partial list, and not creating -> Fail
                        console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Node ${part} not found in partially loaded children of ${currentNode.filename}.`);
                        return null;
                    }
                    if (currentNode.childrenLoaded && !createIfMissing) {
                         // Parent fully loaded, node definitively not found, and not creating -> Fail
                         console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Node ${part} not found in fully loaded children of ${currentNode.filename}.`);
                         return null;
                    }
                    // If createIfMissing is true, we proceed to the creation block below.
                }
                // If nextNode was found, we will proceed with it after the 'if (!nextNode)' block.

            } else if (currentNode.children === null) {
                 // Children is null (definitely not loaded)
                 if (!createIfMissing) {
                     console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Children of ${currentNode.filename} are null, cannot find ${part}.`);
                     return null; // Cannot proceed without creating
                 }
                 // If creating is allowed, initialize children array for the placeholder
                 console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Children of ${currentNode.filename} are null, will create placeholder for ${part}.`);
                 currentNode.children = [];
                 // nextNode remains undefined here, so the creation block below will execute.

            } else if (!currentNode.attrs.isDirectory) { // currentNode.children might be [] for a file
                 // It's a file, cannot have children
                 console.warn(`[SFTP ${instanceSessionId}] findNodeByPath: Attempted to find child '${part}' under a file node '${currentNode.filename}'.`);
                 return null;
            }


            if (!nextNode) {
                // Node not found among loaded children, or children were null
                if (createIfMissing) {
                    // Create a placeholder node
                    const currentPath = '/' + parts.slice(0, i).join('/');
                    const placeholderAttrs: FileAttributes = { // Basic directory attributes
                        isDirectory: true, isFile: false, isSymbolicLink: false,
                        size: 0, mtime: 0, atime: 0, uid: 0, gid: 0, mode: 0o755
                    };
                    nextNode = reactive({ // Use reactive for placeholders too
                        filename: part,
                        longname: part, // Placeholder longname
                        attrs: placeholderAttrs,
                        children: null, // Placeholder children are null initially
                        childrenLoaded: false,
                    });
                    // Add the placeholder to the parent's children array
                    if (!currentNode.children) { // Should have been initialized above if null
                         currentNode.children = [];
                    }
                    // Add and sort (optional, but good practice)
                    currentNode.children.push(nextNode);
                    currentNode.children.sort((a, b) => sortFiles(a as any, b as any));
                    console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Created placeholder node for ${part} under ${currentNode.filename}`);
                } else {
                    // Not creating, and node not found
                    console.log(`[SFTP ${instanceSessionId}] findNodeByPath: Node ${part} not found under ${currentNode.filename} and createIfMissing is false.`);
                    return null;
                }
            }
             // Move to the next node (found or created)
             if (!nextNode) {
                 // Should not happen if createIfMissing is true and placeholder creation worked
                 console.error(`[SFTP ${instanceSessionId}] findNodeByPath: Logic error - nextNode is still undefined for part '${part}'.`);
                 return null;
             }
            currentNode = nextNode;
        }

        return currentNode; // Return the final node found or created
    };

    const loadDirectory = (path: string, forceRefresh: boolean = false) => { // 添加 forceRefresh 参数
        // *** 修改：检查文件树 ***
        const targetNode = findNodeByPath(fileTree, path);

        if (targetNode && targetNode.childrenLoaded && !forceRefresh) { // 检查 forceRefresh
            console.log(`[SFTP ${instanceSessionId}] 使用文件树缓存加载目录: ${path}`);
            // fileList 将通过 computed 属性更新，这里只需更新 currentPathRef
            isLoading.value = false;
            currentPathRef.value = path;
            return; // 子节点已加载且非强制刷新，无需请求
        }

        // If node doesn't exist, children not loaded, or forceRefresh is true, proceed to fetch from backend.
        // The onSftpReaddirSuccess handler will manage adding/updating the node in the tree.

        // 如果是强制刷新且节点存在，重置其加载状态
        if (forceRefresh && targetNode) {
            console.log(`[SFTP ${instanceSessionId}] 强制刷新，重置节点 ${path} 的 childrenLoaded 状态`);
            targetNode.childrenLoaded = false;
            // 可选：如果需要立即清除旧数据，可以设置 targetNode.children = null;
            // targetNode.children = null;
        }

        if (!isSftpReady.value) {
            // 使用通知 store 显示错误
            uiNotificationsStore.showError(t('fileManager.errors.sftpNotReady'), { timeout: 5000 }); // 使用 uiNotificationsStore
            isLoading.value = false;
            // 移除对只读 computed 属性的赋值
            // fileList.value = [];
            console.warn(`[SFTP ${instanceSessionId}] 尝试加载目录 ${path} 但 SFTP 未就绪。`); // 日志改为中文
            return;
        }
        // *** 新增：如果已经在加载，则阻止新的加载请求 ***
        if (isLoading.value) {
            console.warn(`[SFTP ${instanceSessionId}] 尝试加载目录 ${path} 但已在加载中。`);
            return;
        }

        console.log(`[SFTP ${instanceSessionId}] ${forceRefresh ? '强制' : ''}加载目录: ${path}`); // 日志改为中文，并标明是否强制
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
        const fileListPayload = payload as FileListItem[];
        const path = message.path; // e.g., /root

        if (!path) {
            console.error(`[SFTP ${instanceSessionId}] Received readdir success without path!`);
            isLoading.value = false;
            return;
        }

        console.log(`[SFTP ${instanceSessionId}] Received file list for directory ${path}`);

        // Find or create the node for the directory itself (e.g., /root)
        // Pass `true` to create placeholder nodes if the path doesn't fully exist yet.
        const targetNode = findNodeByPath(fileTree, path, true);

        // If findNodeByPath failed even with createIfMissing=true, something is wrong.
        if (!targetNode) {
            console.error(`[SFTP ${instanceSessionId}] Failed to find or create node for path ${path}. Cannot update tree.`);
            // Ensure loading state is reset if the current path failed
            if (path === currentPathRef.value) {
                 isLoading.value = false;
            }
            return;
        }

        // --- Merge Logic ---
        const existingChildren = targetNode.children || [];
        const newChildrenMap = new Map(fileListPayload.map(item => [item.filename, item]));
        const mergedChildren: FileTreeNode[] = [];
        const existingChildrenMap = new Map(existingChildren.map(node => [node.filename, node]));

        // Process items from the server payload
        for (const newItemData of fileListPayload) {
            const existingNode = existingChildrenMap.get(newItemData.filename);

            if (existingNode && existingNode.childrenLoaded && existingNode.attrs.isDirectory) {
                // Keep the existing node if it's a directory and its children are already loaded
                mergedChildren.push(existingNode);
                console.log(`[SFTP ${instanceSessionId}] Merging: Kept existing loaded node ${path}/${existingNode.filename}`);
            } else {
                // Otherwise, create/update node based on new data
                 const newNode: FileTreeNode = reactive({ // Ensure new nodes are reactive
                    filename: newItemData.filename,
                    longname: newItemData.longname,
                    attrs: newItemData.attrs,
                    // Preserve children if existingNode was a placeholder but somehow had children (edge case)
                    children: (existingNode && !existingNode.childrenLoaded && existingNode.children)
                              ? existingNode.children
                              : (newItemData.attrs.isDirectory ? null : []),
                    childrenLoaded: (existingNode && !existingNode.childrenLoaded && existingNode.children)
                                   ? existingNode.childrenLoaded // Preserve loaded status if reusing placeholder children
                                   : !newItemData.attrs.isDirectory,
                });
                mergedChildren.push(newNode);
                 if(existingNode && !existingNode.childrenLoaded) {
                     console.log(`[SFTP ${instanceSessionId}] Merging: Updated placeholder node ${path}/${newNode.filename}`);
                 } else if (!existingNode) {
                     console.log(`[SFTP ${instanceSessionId}] Merging: Added new node ${path}/${newNode.filename}`);
                 }
            }
        }

         // Add existing nodes that were not in the new payload ONLY if they were previously loaded placeholders
         // (This handles cases where a placeholder was created but the parent load didn't list it - might indicate an issue)
         // Typically, if an item is not in the new list, it means it was deleted on the server.
         // We rely on the server list as the source of truth for existence.

        // Sort the merged children
        mergedChildren.sort((a, b) => sortFiles(a as any, b as any));

        // Update the target node's children and mark as loaded
        targetNode.children = mergedChildren;
        targetNode.childrenLoaded = true;
        console.log(`[SFTP ${instanceSessionId}] File tree node ${path}'s children updated after merge.`);

        // If the updated path is the currently viewed path, stop loading
        if (path === currentPathRef.value) {
            isLoading.value = false;
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

    // *** 移除旧的 invalidateCache ***
    // const invalidateCache = (path: string) => { ... };

    // *** 新增：辅助函数 - 从文件树中移除节点 ***
    const removeNodeFromTree = (parentPath: string, filename: string): boolean => {
        const parentNode = findNodeByPath(fileTree, parentPath);
        if (parentNode && parentNode.children) {
            const index = parentNode.children.findIndex(node => node.filename === filename);
            if (index !== -1) {
                parentNode.children.splice(index, 1);
                console.log(`[SFTP ${instanceSessionId}] 从文件树 ${parentPath} 中移除节点: ${filename}`);
                return true;
            }
        }
        console.warn(`[SFTP ${instanceSessionId}] 尝试从文件树 ${parentPath} 移除节点 ${filename} 失败`);
        return false;
    };

    // *** 新增：辅助函数 - 向文件树添加或更新节点 ***
    const addOrUpdateNodeInTree = (parentPath: string, item: FileListItem): boolean => {
        const parentNode = findNodeByPath(fileTree, parentPath);
        if (parentNode && parentNode.childrenLoaded && parentNode.children) { // 确保父节点已加载子节点
             const newNode: FileTreeNode = {
                filename: item.filename,
                longname: item.longname,
                attrs: item.attrs,
                children: item.attrs.isDirectory ? null : [],
                childrenLoaded: !item.attrs.isDirectory,
            };

            const existingIndex = parentNode.children.findIndex(node => node.filename === item.filename);
            if (existingIndex !== -1) {
                // 更新现有节点
                parentNode.children.splice(existingIndex, 1, newNode);
                console.log(`[SFTP ${instanceSessionId}] 更新文件树节点: ${parentPath}/${item.filename}`);
            } else {
                // 添加新节点并保持排序
                let insertIndex = 0;
                while (insertIndex < parentNode.children.length && sortFiles(newNode as any, parentNode.children[insertIndex] as any) > 0) {
                    insertIndex++;
                }
                parentNode.children.splice(insertIndex, 0, newNode);
                console.log(`[SFTP ${instanceSessionId}] 添加文件树节点: ${parentPath}/${item.filename}`);
            }
            return true;
        } else if (parentNode && !parentNode.childrenLoaded) {
            // 父节点存在但子节点未加载，标记为需要重新加载
            parentNode.childrenLoaded = false; // 下次访问时会重新加载
            console.log(`[SFTP ${instanceSessionId}] 父节点 ${parentPath} 子节点未加载，标记为需要刷新`);
            // 可以在这里触发一次 loadDirectory(parentPath) 如果需要立即更新
        } else {
             console.warn(`[SFTP ${instanceSessionId}] 尝试向文件树 ${parentPath} 添加/更新节点 ${item.filename} 失败，父节点未找到或未加载`);
        }
        return false;
    };


    // 处理创建目录成功
    const onMkdirSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const newItem = payload as FileListItem | null; // 后端现在会发送 FileListItem 或 null
        const parentPath = message.path?.substring(0, message.path.lastIndexOf('/')) || '/';

        console.log(`[SFTP ${instanceSessionId}] 创建目录成功: ${message.path}`);

        // *** 修改：直接修改文件树 ***
        if (newItem) {
            addOrUpdateNodeInTree(parentPath, newItem);
        } else {
            // 如果后端未能提供新项信息，标记父节点需要重新加载
            const parentNode = findNodeByPath(fileTree, parentPath);
            if (parentNode) {
                parentNode.childrenLoaded = false; // 下次访问时会重新加载
                console.warn(`[SFTP ${instanceSessionId}] Mkdir success for ${message.path} but no item details received. Marking parent ${parentPath} for reload.`);
                // 如果创建发生在当前目录，可以触发一次刷新
                if (parentPath === currentPathRef.value) {
                    loadDirectory(currentPathRef.value);
                }
            }
        }
    };

    // 处理删除目录/文件成功
    const onRemoveSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const removedPath = message.path;
        const parentPath = removedPath?.substring(0, removedPath.lastIndexOf('/')) || '/';
        const removedFilename = removedPath?.substring(removedPath.lastIndexOf('/') + 1);

        console.log(`[SFTP ${instanceSessionId}] 删除成功: ${removedPath}`);
        // *** 修改：直接修改文件树 ***
        removeNodeFromTree(parentPath, removedFilename || '');
        // 如果删除的是一个目录，也需要考虑移除其在树中的子节点缓存（如果已加载）
        const removedNode = findNodeByPath(fileTree, removedPath || '');
        if (removedNode && removedNode.attrs.isDirectory) {
            // 理论上 removeNodeFromTree 已经移除了它，这里可以加日志或额外清理
            console.log(`[SFTP ${instanceSessionId}] 目录 ${removedPath} 已从树中移除`);
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

        // *** 修改：直接修改文件树 ***
        const removed = removeNodeFromTree(oldParentPath, oldFilename);

        if (newItem) {
            addOrUpdateNodeInTree(newParentPath, newItem);
        } else {
            // 如果后端没提供新项信息，且移动到了新目录，标记新父目录需要刷新
            if (oldParentPath !== newParentPath) {
                const newParentNode = findNodeByPath(fileTree, newParentPath);
                if (newParentNode) {
                    newParentNode.childrenLoaded = false;
                    console.warn(`[SFTP ${instanceSessionId}] Rename/Move success to ${renamePayload.newPath} but no item details. Marking parent ${newParentPath} for reload.`);
                    // 如果移入的是当前目录，触发刷新
                    if (newParentPath === currentPathRef.value) {
                         loadDirectory(currentPathRef.value);
                    }
                }
            } else if (removed) {
                 // 如果只是在同目录下重命名但没收到新项，也标记父目录刷新
                 const parentNode = findNodeByPath(fileTree, oldParentPath);
                 if (parentNode) {
                     parentNode.childrenLoaded = false;
                     console.warn(`[SFTP ${instanceSessionId}] Rename success in ${oldParentPath} but no item details. Marking parent for reload.`);
                     if (oldParentPath === currentPathRef.value) {
                         loadDirectory(currentPathRef.value);
                     }
                 }
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

        // *** 修改：直接修改文件树 ***
        if (updatedItem) {
            addOrUpdateNodeInTree(parentPath, updatedItem);
        } else {
            // 如果后端未能提供更新信息，标记父节点需要重新加载
            const parentNode = findNodeByPath(fileTree, parentPath);
            if (parentNode) {
                parentNode.childrenLoaded = false;
                console.warn(`[SFTP ${instanceSessionId}] Chmod success for ${targetPath} but no item details received. Marking parent ${parentPath} for reload.`);
                if (parentPath === currentPathRef.value) {
                    loadDirectory(currentPathRef.value);
                }
            }
        }
    };

    // 处理写入文件成功 (新建或修改)
    const onWriteFileSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const updatedItem = payload as FileListItem | null; // 后端现在会发送 FileListItem 或 null
        const filePath = message.path;
        const parentPath = filePath?.substring(0, filePath.lastIndexOf('/')) || '/';
        const filename = filePath?.substring(filePath.lastIndexOf('/') + 1);

        console.log(`[SFTP ${instanceSessionId}] 写入文件成功: ${filePath}`);

        // *** 修改：直接修改文件树 ***
        if (updatedItem) {
            addOrUpdateNodeInTree(parentPath, updatedItem);
        } else {
            // 如果后端未能提供更新信息，标记父节点需要重新加载
            const parentNode = findNodeByPath(fileTree, parentPath);
            if (parentNode) {
                parentNode.childrenLoaded = false;
                console.warn(`[SFTP ${instanceSessionId}] WriteFile success for ${filePath} but no item details received. Marking parent ${parentPath} for reload.`);
                if (parentPath === currentPathRef.value) {
                    loadDirectory(currentPathRef.value);
                }
            }
        }
    };

    // *** 新增：处理上传成功 ***
    const onUploadSuccess = (payload: MessagePayload, message: WebSocketMessage) => {
        const newItem = payload as FileListItem | null; // 后端应发送 FileListItem 或 null
        const parentPath = currentPathRef.value; // 上传总是发生在当前路径
        const filename = newItem?.filename; // 从 newItem 获取文件名

        console.log(`[SFTP ${instanceSessionId}] 上传文件成功: ${filename ? joinPath(parentPath, filename) : '(未知文件名)'}`); // 改进日志

        // *** 修改：直接修改文件树 ***
        if (newItem) {
            addOrUpdateNodeInTree(parentPath, newItem);
        } else {
            // 如果后端未能提供更新信息，标记父节点需要重新加载
            const parentNode = findNodeByPath(fileTree, parentPath);
            if (parentNode) {
                parentNode.childrenLoaded = false;
                console.warn(`[SFTP ${instanceSessionId}] Upload success for ${message.path || filename} but no item details received. Marking parent ${parentPath} for reload.`);
                // 上传总是在当前目录，所以直接触发刷新
                loadDirectory(currentPathRef.value);
            }
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
    unregisterCallbacks.push(onMessage('sftp:upload:success', onUploadSuccess)); // *** 新增：监听上传成功 ***
    unregisterCallbacks.push(onMessage('sftp:mkdir:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:rmdir:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:unlink:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:rename:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:chmod:error', onActionError));
    unregisterCallbacks.push(onMessage('sftp:writefile:error', onActionError));

    // 移除 onUnmounted 块

    // *** 新增：计算属性 fileList ***
    const fileList = computed<FileListItem[]>(() => {
        const node = findNodeByPath(fileTree, currentPathRef.value);
        if (node && node.childrenLoaded && node.children) {
            // 将 FileTreeNode 转换回 FileListItem 供视图使用
            return node.children.map(child => ({
                filename: child.filename,
                longname: child.longname,
                attrs: child.attrs,
            }));
        }
        return []; // 如果节点未找到或子节点未加载，返回空列表
    });


    return {
        // State
        fileList: readonly(fileList), // 暴露计算属性
        isLoading: readonly(isLoading),
        // error: readonly(error), // 移除 error
        fileTree: readonly(fileTree), // 可以选择性地暴露只读的文件树

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

