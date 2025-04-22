import { ref, computed, readonly, watch, nextTick } from 'vue'; // Import nextTick
import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from './session.store'; // 导入会话 Store
import type { EditorFileContent, SaveStatus } from '../types/sftp.types'; // 保持导入 SaveStatus

// --- 类型定义 ---
// 文件信息，用于打开文件操作
export interface FileInfo {
  name: string;
  fullPath: string;
}

// 编辑器标签页状态
export interface FileTab {
    id: string; // 唯一标识符，例如 `${sessionId}:${filePath}`
    sessionId: string;
    filePath: string;
    filename: string; // 文件名，用于标签显示
    content: string; // 当前编辑器内容
    originalContent: string; // 加载或上次保存时的内容
    language: string;
    encoding: 'utf8' | 'base64'; // 原始编码
    isLoading: boolean;
    loadingError: string | null;
    isSaving: boolean;
    saveStatus: SaveStatus;
    saveError: string | null;
    isModified: boolean; // 内容是否已修改
    // 添加 sessionId 以便在共享模式下区分来源 (虽然此 store 主要用于共享模式)
    // 或者在独立模式下，此 store 可能不被使用或以不同方式使用
    // sessionId: string; // 暂时不加，因为 session.store 已处理独立模式
}

// --- 辅助函数 (移到外部并导出) ---
export const getLanguageFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'js': return 'javascript';
        case 'ts': return 'typescript';
        case 'json': return 'json';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'scss': return 'scss';
        case 'less': return 'less';
        case 'py': return 'python';
        case 'java': return 'java';
        case 'c': return 'c';
        case 'cpp': return 'cpp';
        case 'cs': return 'csharp';
        case 'go': return 'go';
        case 'php': return 'php';
        case 'rb': return 'ruby';
        case 'rs': return 'rust';
        case 'sql': return 'sql';
        case 'sh': return 'shell';
        case 'yaml': case 'yml': return 'yaml';
        case 'md': return 'markdown';
        case 'xml': return 'xml';
        case 'ini': return 'ini';
        case 'conf': return 'ini';
        case 'bat': return 'bat';
        case 'dockerfile': return 'dockerfile';
        default: return 'plaintext';
    }
};

export const getFilenameFromPath = (filePath: string): string => {
    return filePath.split('/').pop() || filePath;
};
// --- End Helper Functions ---

export const useFileEditorStore = defineStore('fileEditor', () => {
    const { t } = useI18n();
    const sessionStore = useSessionStore();

    // --- 多标签状态 ---
    const tabs = ref(new Map<string, FileTab>()); // 存储所有打开的标签页 (使用 FileTab)
    const activeTabId = ref<string | null>(null); // 当前激活的标签页 ID
    // const editorVisibleState = ref<'visible' | 'minimized' | 'closed'>('closed'); // 移除，面板可见性由布局控制
    const popupTrigger = ref(0); // 新增：用于触发弹窗显示的信号
    const popupFileInfo = ref<{ filePath: string; sessionId: string } | null>(null); // 新增：存储弹窗文件信息

    // --- 计算属性 ---
    const orderedTabs = computed(() => Array.from(tabs.value.values())); // 获取标签页数组，用于渲染
    const activeTab = computed(() => {
        if (!activeTabId.value) return null;
        return tabs.value.get(activeTabId.value) || null;
    });
    // 提供给 MonacoEditor 的内容绑定
    const activeEditorContent = computed({
        get: () => activeTab.value?.content ?? '',
        set: (value) => {
            if (activeTab.value) {
                // 调用新的 updateFileContent action，并传递 tabId
                updateFileContent(activeTab.value.id, value);
            }
        },
    });

    // --- 核心方法 ---

    // 修改：triggerPopup 接收文件信息并存储
    const triggerPopup = (filePath: string, sessionId: string) => {
        console.log(`[文件编辑器 Store] Triggering popup for ${filePath} in session ${sessionId}.`);
        popupFileInfo.value = { filePath, sessionId };
        popupTrigger.value++; // 增加触发器值以通知监听者
    };

    // 移除内部的 getSftpManager 辅助函数，将直接使用 sessionStore.getOrCreateSftpManager
    // const getSftpManager = (sessionId: string | null) => { ... };

    // 移除 setEditorVisibility 方法
    // const setEditorVisibility = ...

    // 打开或切换到文件标签页
    // 修改：添加 instanceId 参数
    const openFile = async (targetFilePath: string, sessionId: string, instanceId: string) => {
        // 在共享模式下，我们仍然需要 sessionId 来构建唯一的 tabId
        // 并与 SFTP 管理器关联
        const tabId = `${sessionId}:${targetFilePath}`; // Tab ID 仍然基于 sessionId 和 filePath 保持唯一性
        console.log(`[文件编辑器 Store - 共享模式] 尝试打开文件: ${targetFilePath} (会话: ${sessionId}, 实例: ${instanceId}, Tab ID: ${tabId})`);

        // 移除确保编辑器可见的逻辑
        // if (editorVisibleState.value === 'closed') {
        //     setEditorVisibility('visible');
        // }

        // 如果标签页已存在，则激活它
        if (tabs.value.has(tabId)) {
            console.log(`[文件编辑器 Store] 标签页 ${tabId} 已存在，激活它。`);
            setActiveTab(tabId);
            // 触发弹窗 (如果设置允许)
            popupTrigger.value++;
            return;
        }

        // 创建新标签页
        const newTab: FileTab = {
            id: tabId,
            sessionId: sessionId,
            filePath: targetFilePath,
            filename: getFilenameFromPath(targetFilePath),
            content: '', // 初始为空
            originalContent: '', // 初始为空
            language: getLanguageFromFilename(targetFilePath),
            encoding: 'utf8', // 默认为 utf8
            isLoading: true, // 开始加载
            loadingError: null,
            isSaving: false,
            saveStatus: 'idle',
            saveError: null,
            isModified: false,
            // sessionId: sessionId, // 记录来源会话
        };
        tabs.value.set(tabId, newTab);
        // setActiveTab(tabId); // 移除同步激活

        // 使用 nextTick 延迟激活，给 DOM 更新留出时间
        nextTick(() => {
            setActiveTab(tabId);
        });

        // 不再在这里触发弹窗
        // popupTrigger.value++;

        // 获取 SFTP 管理器 - 修改：使用 sessionStore.getOrCreateSftpManager 并传入 instanceId
        const sftpManager = sessionStore.getOrCreateSftpManager(sessionId, instanceId);
        if (!sftpManager) {
            // 错误消息保持不变，但现在知道是哪个实例找不到管理器
            console.error(`[文件编辑器 Store] 无法找到会话 ${sessionId} (实例 ${instanceId}) 的 SFTP 管理器。`);
            const tabToUpdate = tabs.value.get(tabId);
            if (tabToUpdate) {
                tabToUpdate.isLoading = false;
                tabToUpdate.loadingError = t('fileManager.errors.sftpManagerNotFound'); // 可以考虑添加 instanceId 到错误消息
            }
            return;
        }

        // 读取文件内容
        try {
            const fileData = await sftpManager.readFile(targetFilePath);
            console.log(`[文件编辑器 Store] 文件 ${targetFilePath} 读取成功。编码: ${fileData.encoding}`);

            let decodedContent = '';
            let finalEncoding: 'utf8' | 'base64' = 'utf8';

            if (fileData.encoding === 'base64') {
                finalEncoding = 'base64';
                try {
                    const binaryString = atob(fileData.content);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const decoder = new TextDecoder('utf-8'); // 显式使用 UTF-8
                    decodedContent = decoder.decode(bytes);
                    console.log(`[文件编辑器 Store] Base64 文件 ${targetFilePath} 已解码为 UTF-8。`);
                } catch (decodeError) {
                    console.error(`[文件编辑器 Store] Base64 或 UTF-8 解码错误 for ${targetFilePath}:`, decodeError);
                    const errorMsg = t('fileManager.errors.fileDecodeError');
                    decodedContent = `// ${errorMsg}\n// Original Base64 content:\n${fileData.content}`;
                    // 更新标签页状态以反映错误
                    const tabToUpdate = tabs.value.get(tabId);
                    if (tabToUpdate) {
                        tabToUpdate.loadingError = errorMsg;
                    }
                }
            } else {
                finalEncoding = 'utf8';
                decodedContent = fileData.content;
                console.log(`[文件编辑器 Store] 文件 ${targetFilePath} 已按 ${finalEncoding} 处理。`);
                if (decodedContent.includes('\uFFFD')) {
                    console.warn(`[文件编辑器 Store] 文件 ${targetFilePath} 内容可能包含无效字符，原始编码可能不是 UTF-8。`);
                }
            }

            // 更新标签页状态
            const tabToUpdate = tabs.value.get(tabId);
            if (tabToUpdate) {
                tabToUpdate.content = decodedContent;
                tabToUpdate.originalContent = decodedContent; // 设置初始内容
                tabToUpdate.encoding = finalEncoding;
                tabToUpdate.isLoading = false;
                tabToUpdate.isModified = false; // 初始未修改
            }

        } catch (err: any) {
            console.error(`[文件编辑器 Store] 读取文件 ${targetFilePath} 失败:`, err);
            const errorMsg = `${t('fileManager.errors.readFileFailed')}: ${err.message || err}`;
            const tabToUpdate = tabs.value.get(tabId);
            if (tabToUpdate) {
                tabToUpdate.isLoading = false;
                tabToUpdate.loadingError = errorMsg;
                tabToUpdate.content = `// ${errorMsg}`; // 在编辑器中显示错误
            }
        }
    };

    // 保存指定（或当前激活）标签页的文件
    const saveFile = async (tabIdToSave?: string) => {
        const targetTabId = tabIdToSave ?? activeTabId.value;
        if (!targetTabId) {
            console.warn('[文件编辑器 Store] 保存失败：没有活动的标签页。');
            return;
        }

        const tab = tabs.value.get(targetTabId);
        if (!tab) {
            console.warn(`[文件编辑器 Store] 保存失败：找不到标签页 ${targetTabId}。`);
            return;
        }

        if (tab.isSaving || tab.isLoading || tab.loadingError) {
            console.warn(`[文件编辑器 Store] 保存条件不满足 for ${tab.filePath}，无法保存。`, { tab });
            return;
        }

        // 检查会话是否存在且连接
        const session = sessionStore.sessions.get(tab.sessionId);
        if (!session || !session.wsManager.isConnected.value || !session.wsManager.isSftpReady.value) {
            console.error(`[文件编辑器 Store] 保存失败：会话 ${tab.sessionId} 无效或未连接/SFTP 未就绪。`);
            tab.saveStatus = 'error';
            tab.saveError = t('fileManager.errors.sessionInvalidOrNotReady'); // 需要添加新的翻译
             // 可以在这里添加一个短暂的错误提示
            setTimeout(() => {
                if (tab.saveStatus === 'error') {
                    tab.saveStatus = 'idle';
                    tab.saveError = null;
                }
            }, 5000);
            return;
        }

        // 修改：从 sftpManagers Map 获取第一个可用的管理器
        const sftpManagersMap = session.sftpManagers;
        if (!sftpManagersMap || sftpManagersMap.size === 0) {
             console.error(`[文件编辑器 Store] 保存失败：会话 ${tab.sessionId} 没有可用的 SFTP 管理器实例。`);
             tab.saveStatus = 'error';
             tab.saveError = t('fileManager.errors.sftpManagerNotFound'); // 复用错误消息
             // 添加短暂错误提示
             setTimeout(() => {
                 if (tab.saveStatus === 'error') {
                     tab.saveStatus = 'idle';
                     tab.saveError = null;
                 }
             }, 5000);
             return;
        }
        // 获取 Map 中的第一个管理器实例
        const sftpManager = sftpManagersMap.values().next().value;


        console.log(`[文件编辑器 Store] 开始保存文件: ${tab.filePath} (Tab ID: ${tab.id}) 使用实例 ${sftpManager.instanceId}`); // 添加实例 ID 日志
        tab.isSaving = true;
        tab.saveStatus = 'saving';
        tab.saveError = null;

        const contentToSave = tab.content;

        try {
            await sftpManager.writeFile(tab.filePath, contentToSave);
            console.log(`[文件编辑器 Store] 文件 ${tab.filePath} 保存成功。`);
            tab.isSaving = false;
            tab.saveStatus = 'success';
            tab.saveError = null;
            tab.originalContent = contentToSave; // 更新原始内容
            tab.isModified = false; // 重置修改状态

            setTimeout(() => {
                if (tab.saveStatus === 'success') {
                    tab.saveStatus = 'idle';
                }
            }, 2000);

        } catch (err: any) {
            console.error(`[文件编辑器 Store] 保存文件 ${tab.filePath} 失败:`, err);
            tab.isSaving = false;
            tab.saveStatus = 'error';
            tab.saveError = `${t('fileManager.errors.saveFailed')}: ${err.message || err}`;

            setTimeout(() => {
                if (tab.saveStatus === 'error') {
                    tab.saveStatus = 'idle';
                    tab.saveError = null;
                }
            }, 5000);
        }
    };

    // 关闭指定标签页
    const closeTab = (tabId: string) => {
        const tabToClose = tabs.value.get(tabId);
        if (!tabToClose) return;

        // 简单处理：如果修改过，提醒用户（实际应用可能需要更复杂的确认对话框）
        if (tabToClose.isModified) {
            // 这里可以集成 UI 通知库来提示
            console.warn(`[文件编辑器 Store] 标签页 ${tabId} (${tabToClose.filename}) 已修改但未保存。正在关闭...`);
            // alert(`文件 ${tabToClose.filename} 已修改但未保存。确定要关闭吗？`); // 简单的 alert 示例
            // if (!confirm(`文件 ${tabToClose.filename} 已修改但未保存。确定要关闭吗？`)) {
            //     return; // 用户取消关闭
            // }
        }

        console.log(`[文件编辑器 Store] 关闭标签页: ${tabId}`);
        tabs.value.delete(tabId);

        // 如果关闭的是当前激活的标签页，则切换到另一个标签页
        if (activeTabId.value === tabId) {
            const remainingTabs = Array.from(tabs.value.keys());
            if (remainingTabs.length > 0) {
                // 简单切换到最后一个标签页
                 setActiveTab(remainingTabs[remainingTabs.length - 1]);
             } else {
                 activeTabId.value = null; // 没有标签页了
                 // setEditorVisibility('closed'); // 移除：容器可见性由外部控制
             }
         }
         // 如果关闭的不是活动标签页，或者活动标签页已成功切换，检查是否需要关闭容器
         else if (tabs.value.size === 0) {
              // setEditorVisibility('closed'); // 移除：容器可见性由外部控制
         }
     };

    // 关闭所有标签页
    const closeAllTabs = () => {
        // 简单处理：直接关闭所有，不检查修改状态（实际应用需要确认）
         console.log('[文件编辑器 Store] 关闭所有标签页...');
         tabs.value.clear();
         activeTabId.value = null;
         // setEditorVisibility('closed'); // 移除：容器可见性由外部控制
     };

    // 设置当前激活的标签页
    const setActiveTab = (tabId: string) => {
        if (tabs.value.has(tabId)) {
            activeTabId.value = tabId;
            console.log(`[文件编辑器 Store] 激活标签页: ${tabId}`);
            // 移除：切换标签不应改变容器可见性状态
            // if (editorVisibleState.value === 'closed' || editorVisibleState.value === 'minimized') {
            //     setEditorVisibility('visible');
            // }
        } else {
            console.warn(`[文件编辑器 Store] 尝试激活不存在的标签页: ${tabId}`);
        }
    };

    // 更新指定标签页的内容 (由 FileEditorContainer 的 v-model 触发)
    const updateFileContent = (tabId: string, newContent: string) => {
        const tab = tabs.value.get(tabId);
        if (tab && !tab.isLoading) {
            tab.content = newContent;
            // 检查是否修改
            tab.isModified = tab.content !== tab.originalContent;
            // 当用户编辑时，重置保存状态
            if (tab.saveStatus === 'success' || tab.saveStatus === 'error') {
                tab.saveStatus = 'idle';
                tab.saveError = null;
            }
        }
    };

    // 移除旧的 updateContent，因为它只更新活动标签页
    // const updateContent = (newContent: string) => { ... };

    // 监听会话关闭事件，移除相关标签页
    watch(() => sessionStore.sessions, (newSessions, oldSessions) => {
        const closedSessionIds = new Set<string>();
        oldSessions.forEach((_, sessionId) => {
            if (!newSessions.has(sessionId)) {
                closedSessionIds.add(sessionId);
            }
        });

        if (closedSessionIds.size > 0) {
            console.log('[文件编辑器 Store] 检测到会话关闭:', Array.from(closedSessionIds));
            const tabsToRemove = Array.from(tabs.value.values()).filter(tab => closedSessionIds.has(tab.sessionId));
            tabsToRemove.forEach(tab => {
                console.log(`[文件编辑器 Store] 移除与已关闭会话 ${tab.sessionId} 相关的标签页: ${tab.id}`);
                // 这里不调用 closeTab 以避免潜在的修改提示，直接移除
                tabs.value.delete(tab.id);
                 // 如果移除的是活动标签页，需要重新设置活动标签页
                if (activeTabId.value === tab.id) {
                    const remainingTabs = Array.from(tabs.value.keys());
                    if (remainingTabs.length > 0) {
                        activeTabId.value = remainingTabs[remainingTabs.length - 1];
                    } else {
                        activeTabId.value = null;
                    }
                }
            });
             // 如果移除后没有标签页了
            if (tabs.value.size === 0) {
                // setEditorVisibility('closed'); // 移除：容器可见性由外部控制
            } else if (!activeTabId.value && tabs.value.size > 0) {
                 // 如果活动标签页被移除且没有自动设置新的，手动设置一个
                 activeTabId.value = Array.from(tabs.value.keys())[0];
            }
        }
    }, { deep: false }); // 只监听 Map 本身的增删


    return {
        // 状态
        tabs: readonly(tabs), // 只读 Map
        activeTabId: readonly(activeTabId),
        // editorVisibleState: readonly(editorVisibleState), // 移除
        popupTrigger: readonly(popupTrigger), // 暴露触发器 (只读)
        popupFileInfo: readonly(popupFileInfo), // 暴露弹窗文件信息 (只读)

        // 计算属性
        orderedTabs,
        activeTab, // 只读的当前激活标签页对象
        activeEditorContent, // 用于 v-model 绑定到 MonacoEditor

        // 方法
        openFile,
        saveFile,
        closeTab,
        closeAllTabs,
        setActiveTab,
        updateFileContent, // 暴露新的更新方法
        triggerPopup, // 暴露新的触发方法
        // setEditorVisibility, // 移除
    };
});
