import { ref, computed, shallowRef, type Ref } from 'vue'; // 导入 shallowRef
import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, type ConnectionInfo } from './connections.store';

// 导入管理器工厂函数 (用于创建实例)
import { createWebSocketConnectionManager } from '../composables/useWebSocketConnection';
import { createSftpActionsManager, type WebSocketDependencies } from '../composables/useSftpActions';
import { createSshTerminalManager, type SshTerminalDependencies } from '../composables/useSshTerminal';
import { createStatusMonitorManager, type StatusMonitorDependencies } from '../composables/useStatusMonitor';

// --- 辅助函数 ---
function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

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
  currentSftpPath: Ref<string>; // SFTP 当前路径 (可能需要保留在此处或移至 SftpManager 内部)
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
   * 处理连接列表的左键点击（连接或激活）
   */
  const handleConnectRequest = (connectionId: number | string) => {
    const connIdStr = String(connectionId);
    console.log(`[SessionStore] 处理连接请求: ${connIdStr}`);

    let existingSessionId: string | null = null;
    for (const [sessionId, session] of sessions.value.entries()) {
      if (session.connectionId === connIdStr) {
        existingSessionId = sessionId;
        break;
      }
    }

    if (existingSessionId) {
      if (activeSessionId.value !== existingSessionId) {
        console.log(`[SessionStore] 激活已存在的会话: ${existingSessionId}`);
        activateSession(existingSessionId);
      } else {
        console.log(`[SessionStore] 点击的连接 ${connIdStr} 已在活动会话 ${existingSessionId} 中，无需操作。`);
      }
    } else {
      // 当前行为：替换当前活动会话（如果存在）
      if (activeSession.value) {
        console.log(`[SessionStore] 替换当前会话 ${activeSessionId.value} 为新连接 ${connIdStr}`);
        closeSession(activeSessionId.value!); // 确保 activeSessionId 存在
        openNewSession(connIdStr);
      } else {
        console.log(`[SessionStore] 当前无活动会话，打开新会话: ${connIdStr}`);
        openNewSession(connIdStr);
      }
      // 备选行为：总是打开新标签页？需要调整 openNewSession 逻辑
    }
  };

  /**
   * 处理连接列表的中键点击（总是打开新会话）
   */
  const handleOpenNewSession = (connectionId: number | string) => {
    console.log(`[SessionStore] 处理打开新会话请求: ${connectionId}`);
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

  return {
    // State
    sessions,
    activeSessionId,
    // Getters
    sessionTabs,
    activeSession,
    // Actions
    openNewSession,
    activateSession,
    closeSession,
    handleConnectRequest,
    handleOpenNewSession,
    cleanupAllSessions,
  };
});
