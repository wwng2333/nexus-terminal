<script setup lang="ts">
import { ref, computed, PropType } from 'vue'; // 导入 ref 和 computed
import { useI18n } from 'vue-i18n'; // 导入 i18n
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
import WorkspaceConnectionListComponent from './WorkspaceConnectionList.vue'; // 导入连接列表组件
import { useSessionStore } from '../stores/session.store'; // 导入 session store
import { useLayoutStore, type PaneName } from '../stores/layout.store'; // 导入布局 store 和类型
// 导入会话状态类型
import type { SessionTabInfoWithStatus } from '../stores/session.store'; // 导入更新后的类型

// --- Setup ---
const { t } = useI18n(); // 初始化 i18n
const layoutStore = useLayoutStore(); // 初始化布局 store
const { paneVisibility } = storeToRefs(layoutStore); // 修正：使用 storeToRefs 获取响应式状态

// 定义 Props
const props = defineProps({
  sessions: {
    type: Array as PropType<SessionTabInfoWithStatus[]>, // 使用更新后的类型
    required: true,
  },
  activeSessionId: {
    type: String as PropType<string | null>,
    required: true,
  },
});

// 定义事件
const emit = defineEmits(['activate-session', 'close-session']);

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

// 定义面板名称到显示文本的映射 (恢复 commandBar)
const paneLabels: Record<PaneName, string> = {
  connections: t('layout.pane.connections'),
  terminal: t('layout.pane.terminal'),
  commandBar: t('layout.pane.commandBar'), // 恢复
  fileManager: t('layout.pane.fileManager'),
  editor: t('layout.pane.editor'),
  statusMonitor: t('layout.pane.statusMonitor'),
};

// 获取所有可控制的面板名称
const availablePanes = computed(() => Object.keys(paneVisibility.value) as PaneName[]); // 修正：使用 .value

// 处理菜单项点击
const handleTogglePane = (paneName: PaneName) => {
  layoutStore.togglePaneVisibility(paneName);
  // 可以选择点击后关闭菜单，或者保持打开
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
    <!-- 布局菜单按钮容器（推到最右侧） -->
    <div class="layout-menu-container">
      <button class="layout-menu-button" @click="toggleLayoutMenu" title="调整布局">
        <i class="fas fa-bars"></i> <!-- 使用 Font Awesome bars 图标 -->
      </button>
      <!-- 布局菜单下拉列表 (保持不变) -->
        <div v-if="showLayoutMenu" class="layout-menu-dropdown">
          <ul>
            <li v-for="pane in availablePanes" :key="pane" @click="handleTogglePane(pane)">
              <span class="checkmark">{{ paneVisibility[pane] ? '✓' : '' }}</span>
              {{ paneLabels[pane] || pane }}
            </li>
          </ul>
        </div>
      </div>
    <!-- 移除多余的结束标签 -->
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
  background-color: #e0e0e0; /* 标签栏背景色 */
  border-bottom: 1px solid #bdbdbd;
  white-space: nowrap;
  height: 2.5rem; /* 固定标签栏高度 */
  box-sizing: border-box; /* 确保 padding 不会增加总高度 */
  /* justify-content: space-between; */ /* 移除，让内容自然靠左 */
  overflow: hidden; /* 恢复：防止标签过多时破坏布局 */
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
  border-right: 1px solid #bdbdbd;
  box-sizing: border-box;
  background-color: #f0f0f0; /* 未激活标签背景 */
  color: #616161; /* 未激活标签文字颜色 */
  transition: background-color 0.2s ease, color 0.2s ease;
  /* max-width: 200px; */ /* 移除最大宽度限制 */
  position: relative; /* 保持相对定位，以防万一需要定位子元素 */
}

.tab-item:hover {
  background-color: #e0e0e0; /* 悬停时背景 */
}

.tab-item.active {
  background-color: #ffffff; /* 激活标签背景 */
  color: #333333; /* 激活标签文字颜色 */
  /* 移除所有可能影响高度的边框或伪元素 */
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
  /* 恢复简单布局 */
  background: none;
  border: none;
  color: #9e9e9e;
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
  background-color: #bdbdbd;
  color: #ffffff;
}

.tab-item.active .close-tab-button {
    color: #757575;
}
.tab-item.active .close-tab-button:hover {
    background-color: #e0e0e0;
    color: #333333;
}

/* 添加新标签按钮样式 */
.add-tab-button {
  background: none;
  border: none;
  border-left: 1px solid #bdbdbd; /* 恢复左侧分隔线 */
  padding: 0 0.8rem;
  cursor: pointer;
  font-size: 1.1em;
  color: #616161;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0; /* 防止按钮被压缩 */
}
.add-tab-button:hover {
  background-color: #d0d0d0;
}
.add-tab-button i {
  line-height: 1; /* 确保图标垂直居中 */
}

/* 移除 action-buttons-container 样式 */

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
  background-color: white;
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
  color: #aaa;
  line-height: 1;
}
.popup-close-button:hover {
  color: #333;
}

.popup-content h3 {
  margin-top: 0;
  margin-bottom: 15px;
  text-align: center;
  color: #333;
}

.popup-connection-list {
  flex-grow: 1; /* 让列表占据剩余空间 */
  overflow-y: auto; /* 列表内容滚动 */
  /* 可能需要覆盖 WorkspaceConnectionList 的一些默认样式 */
  border: 1px solid #eee;
  border-radius: 4px;
}
/* 覆盖 WorkspaceConnectionList 内部样式（如果需要） */
/* :deep(.popup-connection-list .search-add-bar) { */
  /* display: none; */ /* 不再隐藏搜索栏 */
/* } */
:deep(.popup-connection-list .connection-list-area) {
  padding: 0; /* 保持移除内边距 */
}

/* 新增：布局菜单样式 */
.layout-menu-container {
  position: relative; /* 用于定位下拉菜单 */
  display: flex; /* 确保按钮垂直居中 */
  align-items: center;
  height: 100%;
  margin-left: auto; /* 保持：将布局按钮推到最右侧 */
  border-left: 1px solid #bdbdbd; /* 确保布局按钮左侧有分隔线 */
  flex-shrink: 0; /* 保持：防止被压缩 */
}

.layout-menu-button {
  background: none;
  border: none;
  /* border-left: 1px solid #bdbdbd; */ /* 移除按钮左侧分隔线 */
  padding: 0 0.8rem;
  cursor: pointer;
  font-size: 1.1em;
  color: #616161;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-shrink: 0;
}
.layout-menu-button:hover {
  background-color: #d0d0d0;
}
.layout-menu-button i {
  line-height: 1;
}

.layout-menu-dropdown {
  position: absolute; /* 恢复绝对定位 */
  top: 100%; /* 定位在按钮下方 */
  right: 0; /* 对齐到右侧 */
  background-color: lightblue; /* 临时调试背景色 */
  min-height: 20px; /* 临时调试最小高度 */
  border: 1px solid #ccc;
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
}

.layout-menu-dropdown li:hover {
  background-color: #f0f0f0;
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
