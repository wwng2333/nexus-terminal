import { ref, computed, shallowRef, type Ref } from 'vue'; // 导入 shallowRef
import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, type ConnectionInfo } from './connections.store';
// 导入文件编辑器相关的类型
import type { FileTab, FileInfo } from './fileEditor.store'; // 导入 FileTab 和 FileInfo

// 导入管理器工厂函数 (用于创建实例)
// 导入 WsConnectionStatus 类型
import { createWebSocketConnectionManager, type WsConnectionStatus } from '../composables/useWebSocketConnection';
import { createSftpActionsManager, type WebSocketDependencies } from '../composables/useSftpActions';
import { createSshTerminalManager, type SshTerminalDependencies } from '../composables/useSshTerminal';
import { createStatusMonitorManager, type StatusMonitorDependencies } from '../composables/useStatusMonitor';

// --- 辅助函数 ---
function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// 辅助函数：根据文件名获取语言 (从 fileEditor.store 迁移过来)
const getLanguageFromFilename = (filename: string): string => {
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
        case 'bat': return 'bat';
        case 'dockerfile': return 'dockerfile';
        default: return 'plaintext';
    }
};


// --- 类型定义 (导出以便其他模块使用) ---
export type WsManagerInstance = ReturnType<typeof createWebSocketConnectionManager>;
export type SftpManagerInstance = ReturnType<typeof createSftpActionsManager>;
export type SshTerminalInstance = ReturnType<typeof createSshTerminalManager>;
export type StatusMonitorInstance = ReturnType<typeof createStatusMonitorManager>;

export interface SessionState {
  sessionId: string;
  connectionId: string; // 数据库中的连接 ID
  connectionName: string; // 用于显示
  wsManager: WsManagerInstance;
  sftpManager: SftpManagerInstance;
  terminalManager: SshTerminalInstance;
  statusMonitorManager: StatusMonitorInstance;
  currentSftpPath: Ref<string>; // SFTP 当前路径
  // --- 新增：独立编辑器状态 ---
  editorTabs: Ref<FileTab[]>; // 编辑器标签页列表
  activeEditorTabId: Ref<string | null>; // 当前活动的编辑器标签页 ID
}

// 为标签栏定义包含状态的类型
export interface SessionTabInfoWithStatus {
  sessionId: string;
  connectionName: string;
  status: WsConnectionStatus; // 添加状态字段
}


export const useSessionStore = defineStore('session', () => {
  // --- 依赖 ---
  const { t } = useI18n();
  const connectionsStore = useConnectionsStore();

  // --- State ---
  // 使用 shallowRef 避免深度响应性问题，保留管理器实例内部的响应性
  const sessions = shallowRef<Map<string, SessionState>>(new Map());
  const activeSessionId = ref<string | null>(null);

  // --- Getters ---
  const sessionTabs = computed(() => {
    return Array.from(sessions.value.values()).map(session => ({
      sessionId: session.sessionId,
      connectionName: session.connectionName,
    }));
  });

  // 新增：包含状态的标签页信息
  const sessionTabsWithStatus = computed((): SessionTabInfoWithStatus[] => {
    return Array.from(sessions.value.values()).map(session => ({
      sessionId: session.sessionId,
      connectionName: session.connectionName,
      status: session.wsManager.connectionStatus.value, // 从 wsManager 获取状态
    }));
  });


  const activeSession = computed((): SessionState | null => {
    if (!activeSessionId.value) return null;
    return sessions.value.get(activeSessionId.value) || null;
  });

  // --- Actions ---

  /**
   * 根据连接 ID 查找连接信息
   */
  const findConnectionInfo = (connectionId: number | string): ConnectionInfo | undefined => {
    return connectionsStore.connections.find(c => c.id === Number(connectionId));
  };

  /**
   * 打开一个新的会话标签页
   */
  const openNewSession = (connectionId: number | string) => {
    console.log(`[SessionStore] 请求打开新会话: ${connectionId}`);
    const connInfo = findConnectionInfo(connectionId);
    if (!connInfo) {
      console.error(`[SessionStore] 无法打开新会话：找不到 ID 为 ${connectionId} 的连接信息。`);
      // TODO: 向用户显示错误
      return;
    }

    const newSessionId = generateSessionId();
    const dbConnId = String(connInfo.id);

    // 1. 创建管理器实例 (从 WorkspaceView 迁移)
    const wsManager = createWebSocketConnectionManager(newSessionId, dbConnId, t);
    const currentSftpPath = ref<string>('.'); // SFTP 路径状态
    const wsDeps: WebSocketDependencies = {
        sendMessage: wsManager.sendMessage,
        onMessage: wsManager.onMessage,
        isConnected: wsManager.isConnected,
        isSftpReady: wsManager.isSftpReady,
    };
    const sftpManager = createSftpActionsManager(newSessionId, currentSftpPath, wsDeps, t);
    const sshTerminalDeps: SshTerminalDependencies = {
        sendMessage: wsManager.sendMessage,
        onMessage: wsManager.onMessage,
        isConnected: wsManager.isConnected,
    };
    const terminalManager = createSshTerminalManager(newSessionId, sshTerminalDeps, t);
    const statusMonitorDeps: StatusMonitorDependencies = {
        onMessage: wsManager.onMessage,
        isConnected: wsManager.isConnected,
    };
    const statusMonitorManager = createStatusMonitorManager(newSessionId, statusMonitorDeps);

    // 2. 创建 SessionState 对象
    const newSession: SessionState = {
        sessionId: newSessionId,
        connectionId: dbConnId,
        connectionName: connInfo.name || connInfo.host,
        wsManager: wsManager,
        sftpManager: sftpManager,
        terminalManager: terminalManager,
        statusMonitorManager: statusMonitorManager,
        currentSftpPath: currentSftpPath,
        // --- 初始化编辑器状态 ---
        editorTabs: ref([]), // 初始化为空数组
        activeEditorTabId: ref(null), // 初始化为 null
    };

    // 3. 添加到 Map 并激活 (需要创建 Map 的新实例以触发 shallowRef 更新)
    const newSessionsMap = new Map(sessions.value);
    newSessionsMap.set(newSessionId, newSession);
    sessions.value = newSessionsMap; // 触发 shallowRef 更新
    activeSessionId.value = newSessionId;
    console.log(`[SessionStore] 已创建新会话实例: ${newSessionId} for connection ${dbConnId}`);

    // 4. 启动 WebSocket 连接
    const wsUrl = `ws://${window.location.hostname}:3001`; // TODO: 从配置获取 URL
    wsManager.connect(wsUrl);
    console.log(`[SessionStore] 已为会话 ${newSessionId} 启动 WebSocket 连接。`);
  };

  /**
   * 激活指定 ID 的会话标签页
   */
  const activateSession = (sessionId: string) => {
    if (sessions.value.has(sessionId)) {
      if (activeSessionId.value !== sessionId) {
        activeSessionId.value = sessionId;
        console.log(`[SessionStore] 已激活会话: ${sessionId}`);
        // TODO: 可能需要 nextTick 来聚焦终端?
      } else {
        console.log(`[SessionStore] 会话 ${sessionId} 已经是活动状态。`);
      }
    } else {
      console.warn(`[SessionStore] 尝试激活不存在的会话 ID: ${sessionId}`);
    }
  };

  /**
   * 更新指定会话中编辑器标签页的内容
   */
  const updateFileContentInSession = (sessionId: string, tabId: string, newContent: string) => {
    const session = sessions.value.get(sessionId);
    if (!session) {
      console.error(`[SessionStore] 尝试在不存在的会话 ${sessionId} 中更新标签页 ${tabId} 内容`);
      return;
    }
    const tab = session.editorTabs.value.find(t => t.id === tabId);
    if (tab && !tab.isLoading) {
      tab.content = newContent;
      // 检查是否修改
      tab.isModified = tab.content !== tab.originalContent;
      // 当用户编辑时，重置保存状态
      if (tab.saveStatus === 'success' || tab.saveStatus === 'error') {
          tab.saveStatus = 'idle';
          tab.saveError = null;
      }
    } else if (tab) {
        console.warn(`[SessionStore] 尝试更新正在加载的标签页 ${tabId} 的内容`);
    } else {
        console.warn(`[SessionStore] 尝试更新会话 ${sessionId} 中不存在的标签页 ${tabId} 的内容`);
    }
  };

  /**
   * 保存指定会话中的编辑器标签页
   */
  const saveFileInSession = async (sessionId: string, tabId: string) => {
    const session = sessions.value.get(sessionId);
    if (!session) {
      console.error(`[SessionStore] 尝试在不存在的会话 ${sessionId} 中保存标签页 ${tabId}`);
      return;
    }
    const tab = session.editorTabs.value.find(t => t.id === tabId);
    if (!tab) {
      console.warn(`[SessionStore] 尝试保存在会话 ${sessionId} 中不存在的标签页 ${tabId}`);
      return;
    }

    if (tab.isSaving || tab.isLoading || tab.loadingError || !tab.isModified) {
      console.warn(`[SessionStore] 保存条件不满足 for ${tab.filePath} (会话 ${sessionId})，无法保存。`, { tab });
      return;
    }

    // 检查会话连接状态
    if (!session.wsManager.isConnected.value || !session.wsManager.isSftpReady.value) {
      console.error(`[SessionStore] 保存失败：会话 ${sessionId} 无效或未连接/SFTP 未就绪。`);
      tab.saveStatus = 'error';
      tab.saveError = t('fileManager.errors.sessionInvalidOrNotReady');
      setTimeout(() => { if (tab.saveStatus === 'error') { tab.saveStatus = 'idle'; tab.saveError = null; } }, 5000);
      return;
    }

    const sftpManager = session.sftpManager;
    console.log(`[SessionStore] 开始保存文件: ${tab.filePath} (会话 ${sessionId}, Tab ID: ${tab.id})`);
    tab.isSaving = true;
    tab.saveStatus = 'saving';
    tab.saveError = null;

    const contentToSave = tab.content;

    try {
      await sftpManager.writeFile(tab.filePath, contentToSave);
      console.log(`[SessionStore] 文件 ${tab.filePath} (会话 ${sessionId}) 保存成功。`);
      tab.isSaving = false;
      tab.saveStatus = 'success';
      tab.saveError = null;
      tab.originalContent = contentToSave; // 更新原始内容
      tab.isModified = false; // 重置修改状态
      setTimeout(() => { if (tab.saveStatus === 'success') { tab.saveStatus = 'idle'; } }, 2000);
    } catch (err: any) {
      console.error(`[SessionStore] 保存文件 ${tab.filePath} (会话 ${sessionId}) 失败:`, err);
      tab.isSaving = false;
      tab.saveStatus = 'error';
      tab.saveError = `${t('fileManager.errors.saveFailed')}: ${err.message || err}`;
      setTimeout(() => { if (tab.saveStatus === 'error') { tab.saveStatus = 'idle'; tab.saveError = null; } }, 5000);
    }
  };


  /**
   * 关闭指定 ID 的会话标签页
   */
  const closeSession = (sessionId: string) => {
    console.log(`[SessionStore] 请求关闭会话 ID: ${sessionId}`);
    const sessionToClose = sessions.value.get(sessionId);
    if (!sessionToClose) {
      console.warn(`[SessionStore] 尝试关闭不存在的会话 ID: ${sessionId}`);
      return;
    }

    // 1. 调用实例上的清理和断开方法 (从 WorkspaceView 迁移)
    sessionToClose.wsManager.disconnect();
    console.log(`[SessionStore] 已为会话 ${sessionId} 调用 wsManager.disconnect()`);
    sessionToClose.sftpManager.cleanup();
    console.log(`[SessionStore] 已为会话 ${sessionId} 调用 sftpManager.cleanup()`);
    sessionToClose.terminalManager.cleanup();
    console.log(`[SessionStore] 已为会话 ${sessionId} 调用 terminalManager.cleanup()`);
    sessionToClose.statusMonitorManager.cleanup();
    console.log(`[SessionStore] 已为会话 ${sessionId} 调用 statusMonitorManager.cleanup()`);
    // TODO: 清理编辑器相关资源？例如提示保存未保存的文件

    // 2. 从 Map 中移除会话 (需要创建 Map 的新实例以触发 shallowRef 更新)
    const newSessionsMap = new Map(sessions.value);
    newSessionsMap.delete(sessionId);
    sessions.value = newSessionsMap; // 触发 shallowRef 更新
    console.log(`[SessionStore] 已从 Map 中移除会话: ${sessionId}`);

    // 3. 切换活动标签页
    if (activeSessionId.value === sessionId) {
      const remainingSessions = Array.from(sessions.value.keys());
      const nextActiveId = remainingSessions.length > 0 ? remainingSessions[remainingSessions.length - 1] : null;
      activeSessionId.value = nextActiveId;
      console.log(`[SessionStore] 关闭活动会话后，切换到: ${nextActiveId}`);
    }
  };

  /**
   * 处理连接列表的左键点击（如果点击的是当前活动标签且断开则重连，否则总是新建标签）
   */
  const handleConnectRequest = (connectionId: number | string) => {
    const connIdStr = String(connectionId);
    console.log(`[SessionStore] handleConnectRequest called for ID: ${connIdStr}`);

    let existingSession: SessionState | null = null;
    let existingSessionId: string | null = null;
    // 查找是否存在对应 connectionId 的会话
    for (const [sessionId, session] of sessions.value.entries()) {
      if (session.connectionId === connIdStr) {
        existingSession = session;
        existingSessionId = sessionId;
        break;
      }
    }

    // 检查点击的连接是否是当前活动的标签页
    if (existingSession && existingSessionId && existingSessionId === activeSessionId.value) {
      // 是当前活动标签页
      const currentStatus = existingSession.wsManager.connectionStatus.value;
      console.log(`[SessionStore] 点击的是当前活动会话 ${existingSessionId}，状态: ${currentStatus}`);
      if (currentStatus === 'disconnected' || currentStatus === 'error') {
        // 如果已断开或出错，则尝试重连
        console.log(`[SessionStore] 活动会话 ${existingSessionId} 已断开或出错，尝试重连...`);
        const wsUrl = `ws://${window.location.hostname}:3001`; // TODO: 从配置获取 URL
        existingSession.wsManager.connect(wsUrl);
        // 不需要再调用 activateSession，因为它已经是活动的
      } else {
        // 如果状态正常，则无需操作
         console.log(`[SessionStore] 活动会话 ${existingSessionId} 状态正常，无需操作。`);
       }
     } else if (existingSessionId && existingSession) {
       // 点击的是一个已存在但非活动的会话
       console.log(`[SessionStore] 点击的连接 ${connIdStr} 存在于非活动会话 ${existingSessionId} 中，将激活它。`);
       activateSession(existingSessionId);
       // 激活后检查状态并尝试重连 (如果需要)
       const currentStatus = existingSession.wsManager.connectionStatus.value;
       if (currentStatus === 'disconnected' || currentStatus === 'error') {
         console.log(`[SessionStore] 激活的会话 ${existingSessionId} 已断开或出错，尝试重连...`);
         const wsUrl = `ws://${window.location.hostname}:3001`; // TODO: 从配置获取 URL
         existingSession.wsManager.connect(wsUrl);
       }
     } else {
       // 点击的连接没有对应的会话，创建新会话
       console.log(`[SessionStore] 未找到 ID 为 ${connIdStr} 的现有会话，将打开新会话。`);
       openNewSession(connIdStr);
     }
   };

  /**
   * 处理连接列表的中键点击（总是打开新会话）
   */
  const handleOpenNewSession = (connectionId: number | string) => {
    console.log(`[SessionStore] handleOpenNewSession called for ID: ${connectionId}`);
    openNewSession(connectionId);
  };

  /**
   * 清理所有会话（例如在应用卸载时）
   */
  const cleanupAllSessions = () => {
    console.log('[SessionStore] 清理所有会话...');
    sessions.value.forEach((session, sessionId) => {
      closeSession(sessionId); // 调用单个会话的关闭逻辑
    });
    sessions.value.clear();
    activeSessionId.value = null;
  };

  // --- 新增：编辑器相关 Actions ---

  /**
   * 在指定会话中打开文件
   */
  const openFileInSession = (sessionId: string, fileInfo: FileInfo) => {
    const session = sessions.value.get(sessionId);
    if (!session) {
      console.error(`[SessionStore] 尝试在不存在的会话 ${sessionId} 中打开文件`);
      return;
    }

    // 检查标签页是否已存在 (使用 filePath)
    const existingTab = session.editorTabs.value.find(tab => tab.filePath === fileInfo.fullPath);
    if (existingTab) {
      // 如果标签页已存在，则激活它
      session.activeEditorTabId.value = existingTab.id;
      console.log(`[SessionStore] 会话 ${sessionId} 中已存在文件 ${fileInfo.fullPath} 的标签页，已激活: ${existingTab.id}`);
    } else {
      // 创建新标签页
      const newTab: FileTab = {
        id: generateSessionId(), // 复用会话 ID 生成逻辑创建唯一标签页 ID
        filename: fileInfo.name, // 使用 filename 匹配 FileTab 接口
        filePath: fileInfo.fullPath, // 使用 filePath 匹配 FileTab 接口
        // content, originalContent, language, encoding 将在 FileEditorContainer 或 fileEditor.store 中处理
        content: '', // 初始内容为空
        originalContent: '', // 初始原始内容为空
        language: 'plaintext', // 初始语言，稍后会根据文件名更新
        encoding: 'utf8', // 默认编码
        isModified: false, // 使用 isModified 匹配 FileTab 接口
        isLoading: false, // 初始化为 boolean
        loadingError: null, // 使用 loadingError 匹配 FileTab 接口
        // --- 编辑器状态相关 ---
        isSaving: false,
        saveStatus: 'idle',
        saveError: null,
        // --- 关联会话 ID ---
        sessionId: sessionId, // 记录此标签页属于哪个会话
      };
      // session.editorTabs.value.push(newTab); // 移除重复的 push
      session.editorTabs.value.push(newTab);
      session.activeEditorTabId.value = newTab.id;
      console.log(`[SessionStore] 已在会话 ${sessionId} 中为文件 ${fileInfo.fullPath} 创建新标签页: ${newTab.id}`);

      // --- 新增：异步加载文件内容 ---
      const loadContent = async () => {
        const tabToLoad = session.editorTabs.value.find(t => t.id === newTab.id);
        if (!tabToLoad) return; // Tab might have been closed quickly

        tabToLoad.isLoading = true;
        tabToLoad.loadingError = null;

        try {
          const sftpManager = session.sftpManager; // 获取当前会话的 sftpManager
          const fileData = await sftpManager.readFile(fileInfo.fullPath);
          console.log(`[SessionStore ${sessionId}] 文件 ${fileInfo.fullPath} 读取成功。编码: ${fileData.encoding}`);

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
                  const decoder = new TextDecoder('utf-8');
                  decodedContent = decoder.decode(bytes);
              } catch (decodeError) {
                  console.error(`[SessionStore ${sessionId}] Base64 解码错误 for ${fileInfo.fullPath}:`, decodeError);
                  tabToLoad.loadingError = t('fileManager.errors.fileDecodeError');
                  decodedContent = `// ${tabToLoad.loadingError}\n// Original Base64 content:\n${fileData.content}`;
              }
          } else {
              finalEncoding = 'utf8';
              decodedContent = fileData.content;
              if (decodedContent.includes('\uFFFD')) {
                  console.warn(`[SessionStore ${sessionId}] 文件 ${fileInfo.fullPath} 内容可能包含无效字符。`);
              }
          }

          // 更新标签页状态
          tabToLoad.content = decodedContent;
          tabToLoad.originalContent = decodedContent;
          tabToLoad.encoding = finalEncoding;
          tabToLoad.language = getLanguageFromFilename(fileInfo.name); // 根据文件名设置语言
          tabToLoad.isModified = false;

        } catch (err: any) {
            console.error(`[SessionStore ${sessionId}] 读取文件 ${fileInfo.fullPath} 失败:`, err);
            tabToLoad.loadingError = `${t('fileManager.errors.readFileFailed')}: ${err.message || err}`;
            tabToLoad.content = `// ${tabToLoad.loadingError}`;
        } finally {
            tabToLoad.isLoading = false;
        }
      };

      loadContent(); // 启动内容加载
    }
  };

  /**
   * 关闭指定会话中的编辑器标签页
   */
  const closeEditorTabInSession = (sessionId: string, tabId: string) => {
    const session = sessions.value.get(sessionId);
    if (!session) {
      console.error(`[SessionStore] 尝试在不存在的会话 ${sessionId} 中关闭标签页 ${tabId}`);
      return;
    }

    const tabIndex = session.editorTabs.value.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.warn(`[SessionStore] 尝试关闭会话 ${sessionId} 中不存在的标签页 ID: ${tabId}`);
      return;
    }

    // TODO: 检查 isDirty 状态，提示保存？

    session.editorTabs.value.splice(tabIndex, 1);
    console.log(`[SessionStore] 已从会话 ${sessionId} 中移除标签页: ${tabId}`);

    // 如果关闭的是当前活动标签页，则切换到前一个或 null
    if (session.activeEditorTabId.value === tabId) {
      const remainingTabs = session.editorTabs.value;
      const nextActiveTabId = remainingTabs.length > 0
        ? remainingTabs[Math.max(0, tabIndex - 1)].id // 尝试激活前一个，或第一个
        : null;
      session.activeEditorTabId.value = nextActiveTabId;
      console.log(`[SessionStore] 会话 ${sessionId} 关闭活动标签页后，切换到: ${nextActiveTabId}`);
    }
  };

  /**
   * 激活指定会话中的编辑器标签页
   */
  const setActiveEditorTabInSession = (sessionId: string, tabId: string) => {
    const session = sessions.value.get(sessionId);
    if (!session) {
      console.error(`[SessionStore] 尝试在不存在的会话 ${sessionId} 中激活标签页 ${tabId}`);
      return;
    }

    if (session.editorTabs.value.some(tab => tab.id === tabId)) {
      if (session.activeEditorTabId.value !== tabId) {
        session.activeEditorTabId.value = tabId;
        console.log(`[SessionStore] 已在会话 ${sessionId} 中激活标签页: ${tabId}`);
      }
    } else {
      console.warn(`[SessionStore] 尝试激活会话 ${sessionId} 中不存在的标签页 ID: ${tabId}`);
    }
  };


  return {
    // State
    sessions,
    activeSessionId,
    // Getters
    sessionTabs,
    sessionTabsWithStatus, // 导出新的 getter
    activeSession,
    // Actions
    openNewSession,
    activateSession,
    closeSession,
    handleConnectRequest,
    handleOpenNewSession,
    cleanupAllSessions,
    // --- 新增：导出编辑器相关 Actions ---
    openFileInSession,
    closeEditorTabInSession,
    setActiveEditorTabInSession,
    updateFileContentInSession, // 导出更新内容 Action
    saveFileInSession,          // 导出保存文件 Action
  };
});
