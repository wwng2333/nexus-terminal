<script setup lang="ts">
import { ref, computed, PropType } from 'vue'; // 导入 ref 和 computed
import { useI18n } from 'vue-i18n'; // 导入 i18n
// import { storeToRefs } from 'pinia'; // 移除 storeToRefs 导入，因为 paneVisibility 不再使用
import WorkspaceConnectionListComponent from './WorkspaceConnectionList.vue'; // 导入连接列表组件
import { useSessionStore } from '../stores/session.store'; // 导入 session store
import { useLayoutStore, type PaneName } from '../stores/layout.store'; // 导入布局 store 和类型
// 导入会话状态类型
import type { SessionTabInfoWithStatus } from '../stores/session.store'; // 导入更新后的类型

// --- Setup ---
const { t } = useI18n(); // 初始化 i18n
const layoutStore = useLayoutStore(); // 初始化布局 store
// const { paneVisibility } = storeToRefs(layoutStore); // 移除：paneVisibility 不再存在

// 定义 Props
const props = defineProps({
  sessions: {
    type: Array as PropType<SessionTabInfoWithStatus[]>, // 使用更新后的类型
    required: true,
  },
  activeSessionId: {
    type: String as PropType<string | null>, // 类型已包含 null
    required: false, // 改为非必需，允许初始为 null
    default: null,   // 提供默认值 null
  },
});

// 定义事件
const emit = defineEmits(['activate-session', 'close-session', 'open-layout-configurator']); // 添加新事件

const activateSession = (sessionId: string) => {
  if (sessionId !== props.activeSessionId) {
    emit('activate-session', sessionId);
  }
};

const closeSession = (event: MouseEvent, sessionId: string) => {
  event.stopPropagation(); // 阻止事件冒泡到标签点击事件
  emit('close-session', sessionId);
};

// --- 本地状态 ---
const sessionStore = useSessionStore(); // Session store 保持不变
const showConnectionListPopup = ref(false); // 连接列表弹出状态
const showLayoutMenu = ref(false); // 新增：布局菜单弹出状态

const togglePopup = () => {
  showConnectionListPopup.value = !showConnectionListPopup.value;
};

// 处理从弹出列表中选择连接的事件
const handlePopupConnect = (connectionId: number) => {
  console.log(`[TabBar] Popup connect request for ID: ${connectionId}`);
  // 使用 sessionStore 的方法来处理连接请求（它现在总是新建标签）
  sessionStore.handleConnectRequest(connectionId);
  showConnectionListPopup.value = false; // 关闭弹出窗口
};

// --- 新增：布局菜单处理 ---
const toggleLayoutMenu = () => {
  console.log('Toggling layout menu visibility. Current state:', showLayoutMenu.value); // 添加日志
  showLayoutMenu.value = !showLayoutMenu.value;
  console.log('New state:', showLayoutMenu.value); // 添加日志
};

// 新增：处理打开布局配置器的事件
const openLayoutConfigurator = () => {
  console.log('[TabBar] Emitting open-layout-configurator event');
  emit('open-layout-configurator'); // 发出事件
};

// --- 旧的布局菜单相关代码 (暂时保留，但功能已失效) ---
// 定义面板名称到显示文本的映射 (保留用于旧菜单显示)
const paneLabels: Record<PaneName, string> = {
  connections: t('layout.pane.connections'),
  terminal: t('layout.pane.terminal'),
  commandBar: t('layout.pane.commandBar'),
  fileManager: t('layout.pane.fileManager'),
  editor: t('layout.pane.editor'),
  statusMonitor: t('layout.pane.statusMonitor'),
  commandHistory: t('layout.pane.commandHistory', '命令历史'),
  quickCommands: t('layout.pane.quickCommands', '快捷指令'),
};

// 获取所有理论上的面板名称 (用于旧菜单显示)
const allPanesForMenu = computed(() => layoutStore.allPossiblePanes); // 使用新的 allPossiblePanes

// 处理旧菜单项点击 (功能已失效，仅打印日志)
const handleTogglePane = (paneName: PaneName) => {
  console.warn(`[TabBar] 旧的 handleTogglePane 被调用，但 togglePaneVisibility 已移除。面板: ${paneName}`);
  // layoutStore.togglePaneVisibility(paneName); // 此方法已不存在
  // showLayoutMenu.value = false;
};

</script>

<template>
  <div class="terminal-tab-bar">
    <div class="tabs-and-add-button"> <!-- 新容器包裹标签和+按钮 -->
      <ul class="tab-list">
        <li
          v-for="session in sessions"
        :key="session.sessionId"
        :class="['tab-item', { active: session.sessionId === activeSessionId }]"
        @click="activateSession(session.sessionId)"
        :title="session.connectionName"
      >
        <!-- 添加状态点 -->
        <span :class="['status-dot', `status-${session.status}`]"></span>
        <span class="tab-name">{{ session.connectionName }}</span>
        <button class="close-tab-button" @click="closeSession($event, session.sessionId)" title="关闭标签页">
          &times; <!-- 使用 HTML 实体 '×' -->
        </button>
        </li>
      </ul>
      <!-- "+" 按钮紧随标签列表 -->
      <button class="add-tab-button" @click="togglePopup" title="新建连接标签页">
        <i class="fas fa-plus"></i>
      </button>
    </div>
    <!-- 按钮容器（推到最右侧） -->
    <div class="action-buttons-container">
      <!-- 新增：布局配置器按钮 -->
      <button class="layout-config-button" @click="openLayoutConfigurator" title="配置工作区布局">
        <i class="fas fa-th-large"></i> <!-- 网格布局图标 -->
      </button>
      <!-- 保留旧的布局菜单按钮 -->
      <div class="layout-menu-container">
        <button class="layout-menu-button" @click="toggleLayoutMenu" title="切换面板可见性 (旧)">
          <i class="fas fa-bars"></i> <!-- 汉堡菜单图标 -->
        </button>
        <!-- 旧布局菜单下拉列表 (显示所有面板，但勾选状态和点击功能失效) -->
          <div v-if="showLayoutMenu" class="layout-menu-dropdown">
            <ul>
              <!-- 使用 allPanesForMenu 迭代 -->
              <li v-for="pane in allPanesForMenu" :key="pane" @click="handleTogglePane(pane)">
                <!-- 移除基于 paneVisibility 的勾选 -->
                <span class="checkmark"></span> <!-- 占位符保持对齐 -->
                {{ paneLabels[pane] || pane }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    <!-- 连接列表弹出窗口 (保持不变) -->
    <div v-if="showConnectionListPopup" class="connection-list-popup" @click.self="togglePopup">
      <div class="popup-content">
        <button class="popup-close-button" @click="togglePopup">&times;</button>
        <h3>选择要连接的服务器</h3>
        <WorkspaceConnectionListComponent
          @connect-request="handlePopupConnect"
          @open-new-session="handlePopupConnect"
          class="popup-connection-list"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-tab-bar {
  display: flex;
  background-color: var(--header-bg-color, #e0e0e0); /* 使用变量 */
  /* border-bottom: 1px solid var(--border-color, #bdbdbd); */ /* 移除底部边框，让主内容区处理 */
  border: 1px solid var(--border-color, #bdbdbd); /* 添加完整边框 */
  border-bottom: none; /* 明确移除底部边框 */
  white-space: nowrap;
  height: 2.5rem; /* 固定标签栏高度 */
  box-sizing: border-box; /* 确保 padding 不会增加总高度 */
  border-radius: 5px 5px 0 0; /* Top-left, Top-right, Bottom-right, Bottom-left */
  margin: 0 var(--base-margin, 0.5rem); /* Add horizontal margin to match content area */
  margin-top: var(--base-margin, 0.5rem); /* Add top margin */
  overflow: hidden; /* Clip content to rounded corners */
}

/* 包裹标签和+按钮的容器 */
.tabs-and-add-button {
  display: flex;
  align-items: center;
  overflow-x: auto; /* 允许标签和+按钮区域滚动 */
  /* flex-grow: 1; */ /* 移除：让其自然宽度 */
  /* max-width: calc(100% - 50px); */ /* 移除宽度限制 */
  flex-shrink: 1; /* 允许在空间不足时收缩 */
  min-width: 0; /* 允许收缩到0 */
  height: 100%; /* 确保高度与父元素相同，消除上下间距 */
}

/* 状态点样式 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0; /* 防止被压缩 */
}
.status-dot.status-disconnected { background-color: #dc3545; } /* 红色 */
.status-dot.status-connecting { background-color: #ffc107; } /* 黄色 */
.status-dot.status-connected { background-color: #28a745; } /* 绿色 */
.status-dot.status-error { background-color: #6c757d; } /* 灰色 (或其他表示错误的颜色) */


.tab-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-shrink: 0; /* 防止标签列表被压缩 */
  height: 100%; /* 确保占满整个高度 */
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0 0.8rem; /* 基础内边距 */
  height: 100%;
  cursor: pointer;
  border-right: 1px solid var(--border-color, #bdbdbd); /* 使用变量 */
  box-sizing: border-box;
  background-color: var(--app-bg-color, #f0f0f0); /* 使用变量 - 未激活标签背景 */
  color: var(--text-color-secondary, #616161); /* 使用变量 - 未激活标签文字颜色 */
  transition: background-color 0.2s ease, color 0.2s ease;
  position: relative; /* 保持相对定位，以防万一需要定位子元素 */
}

.tab-item:hover {
  background-color: var(--header-bg-color, #e0e0e0); /* 使用变量 - 悬停时背景 */
}

.tab-item.active {
  background-color: var(--app-bg-color, #ffffff); /* 使用变量 - 激活标签背景 */
  color: var(--text-color, #333333); /* 使用变量 - 激活标签文字颜色 */
  border-bottom-color: transparent; /* 隐藏激活标签的底部边框，模拟连接效果 */
  position: relative;
  z-index: 1;
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* margin-right: 1.5rem; */ /* 移除 */
  line-height: normal; /* 默认行高 */
  flex-grow: 1; /* 保持：允许名称伸展 */
  margin-left: 4px; /* 在状态点和名称之间添加一点间距 */
  text-align: left; /* 保持文本左对齐 */
}

.close-tab-button {
  background: none;
  border: none;
  color: var(--text-color-secondary, #9e9e9e); /* 使用变量 */
  cursor: pointer;
  font-size: 1.1em;
  padding: 0 0.3rem;
  line-height: 1;
  border-radius: 50%;
  margin-left: auto; /* 保持 auto 将按钮推到最右侧 */
  flex-shrink: 0; /* 防止按钮被压缩 */
  /* 移除绝对定位 */
  /* top: 50%; */
  /* right: 0.5rem; */
  /* transform: translateY(-50%); */
}

.close-tab-button:hover {
  background-color: var(--border-color, #bdbdbd); /* 使用变量 */
  color: var(--app-bg-color, #ffffff); /* 使用变量 */
}

.tab-item.active .close-tab-button {
    color: var(--text-color-secondary, #757575); /* 使用变量 */
}
.tab-item.active .close-tab-button:hover {
    background-color: var(--header-bg-color, #e0e0e0); /* 使用变量 */
    color: var(--text-color, #333333); /* 使用变量 */
}

/* 添加新标签按钮样式 */
.add-tab-button {
  background: none;
  border: none;
  border-left: 1px solid var(--border-color, #bdbdbd); /* 使用变量 */
  padding: 0 0.8rem;
  cursor: pointer;
  font-size: 1.1em;
  color: var(--text-color-secondary, #616161); /* 使用变量 */
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0; /* 防止按钮被压缩 */
}
.add-tab-button:hover {
  background-color: var(--header-bg-color, #d0d0d0); /* 使用变量 */
}
.add-tab-button i {
  line-height: 1; /* 确保图标垂直居中 */
}

/* 新增：包裹右侧操作按钮的容器 */
.action-buttons-container {
  display: flex;
  align-items: center;
  margin-left: auto; /* 将整个容器推到右侧 */
  height: 100%;
  flex-shrink: 0; /* 防止被压缩 */
}

/* 新增：布局配置器按钮样式 */
.layout-config-button {
  background: none;
  border: none;
  border-left: 1px solid var(--border-color, #bdbdbd); /* 使用变量 */
  padding: 0 0.8rem;
  cursor: pointer;
  font-size: 1.1em; /* 与其他按钮一致 */
  color: var(--text-color-secondary, #616161); /* 使用变量 */
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0;
}
.layout-config-button:hover {
  background-color: var(--header-bg-color, #d0d0d0); /* 使用变量 */
}
.layout-config-button i {
  line-height: 1;
}


/* 弹出窗口样式 */
.connection-list-popup {
  position: fixed; /* 固定定位，覆盖整个屏幕 */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5); /* 半透明背景 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* 确保在最上层 */
}

.popup-content {
  background-color: var(--app-bg-color, white); /* 使用变量 */
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  width: 80%;
  max-width: 500px; /* 限制最大宽度 */
  max-height: 80vh; /* 限制最大高度 */
  display: flex;
  flex-direction: column;
  position: relative; /* 为了关闭按钮定位 */
}

.popup-close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-color-secondary, #aaa); /* 使用变量 */
  line-height: 1;
}
.popup-close-button:hover {
  color: var(--text-color, #333); /* 使用变量 */
}

.popup-content h3 {
  margin-top: 0;
  margin-bottom: 15px;
  text-align: center;
  color: var(--text-color, #333); /* 使用变量 */
}

.popup-connection-list {
  flex-grow: 1; /* 让列表占据剩余空间 */
  overflow-y: auto; /* 列表内容滚动 */
  /* 可能需要覆盖 WorkspaceConnectionList 的一些默认样式 */
  border: 1px solid var(--border-color); /* Use theme variable */
  border-radius: 4px;
}
/* 覆盖 WorkspaceConnectionList 内部样式（如果需要） */
/* :deep(.popup-connection-list .search-add-bar) { */
  /* display: none; */ /* 不再隐藏搜索栏 */
/* } */
:deep(.popup-connection-list .connection-list-area) {
  padding: 0; /* 保持移除内边距 */
  background-color: var(--app-bg-color); /* 确保列表背景 */
}

/* 调整：旧布局菜单容器样式 */
.layout-menu-container {
  position: relative; /* 用于定位下拉菜单 */
  display: flex; /* 确保按钮垂直居中 */
  align-items: center;
  height: 100%;
  /* margin-left: auto; */ /* 移除：由父容器 .action-buttons-container 控制 */
  border-left: 1px solid var(--border-color, #bdbdbd); /* 使用变量 */
  flex-shrink: 0; /* 保持：防止被压缩 */
}

/* 调整：旧布局菜单按钮样式 */
.layout-menu-button {
  background: none;
  border: none;
  /* border-left: 1px solid var(--border-color, #bdbdbd); */ /* 移除按钮左侧分隔线 */
  padding: 0 0.8rem;
  cursor: pointer;
  font-size: 1.1em;
  color: var(--text-color-secondary, #616161); /* 使用变量 */
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0;
}
.layout-menu-button:hover {
  background-color: var(--header-bg-color, #d0d0d0); /* 使用变量 */
}
.layout-menu-button i {
  line-height: 1;
}

.layout-menu-dropdown {
  position: absolute; /* 恢复绝对定位 */
  top: 100%; /* 定位在按钮下方 */
  right: 0; /* 对齐到右侧 */
  background-color: var(--app-bg-color, white); /* 使用变量 */
  /* min-height: 20px; */ /* 移除临时调试最小高度 */
  border: 1px solid var(--border-color, #ccc); /* 使用变量 */
  box-shadow: 0 2px 5px rgba(0,0,0,0.15);
  z-index: 9999; /* 保持高 z-index */
  min-width: 150px; /* 最小宽度 */
  padding: 5px 0;
  border-radius: 4px;
}

.layout-menu-dropdown ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.layout-menu-dropdown li {
  padding: 8px 15px;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  color: var(--text-color); /* 使用变量 */
}

.layout-menu-dropdown li:hover {
  background-color: var(--header-bg-color, #f0f0f0); /* 使用变量 */
}

.layout-menu-dropdown .checkmark {
  display: inline-block;
  width: 20px; /* 固定宽度以便对齐 */
  text-align: center;
  margin-right: 5px;
  font-weight: bold;
  color: #28a745; /* 勾选标记颜色 */
}

</style>
