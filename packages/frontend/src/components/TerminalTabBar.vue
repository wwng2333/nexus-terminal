<script setup lang="ts">
import { ref, PropType } from 'vue'; // 导入 ref
import WorkspaceConnectionListComponent from './WorkspaceConnectionList.vue'; // 导入连接列表组件
import { useSessionStore } from '../stores/session.store'; // 导入 session store
// 导入会话状态类型
import type { SessionTabInfoWithStatus } from '../stores/session.store'; // 导入更新后的类型

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

// --- 新增：弹出窗口状态和处理 ---
const sessionStore = useSessionStore();
const showConnectionListPopup = ref(false);

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
</script>

<template>
  <div class="terminal-tab-bar">
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
    <!-- 新增 "+" 按钮 -->
    <button class="add-tab-button" @click="togglePopup" title="新建连接标签页">
      <i class="fas fa-plus"></i>
    </button>

    <!-- 新增：连接列表弹出窗口 -->
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
  overflow-x: auto; /* 如果标签过多则允许水平滚动 */
  white-space: nowrap;
  /* padding: 0 0.5rem; */ /* 移除左右内边距，让标签列表和按钮自己控制 */
  padding-right: 0.5rem; /* 只保留右侧内边距给按钮 */
  height: 2.5rem; /* 固定标签栏高度 */
  box-sizing: border-box; /* 确保 padding 不会增加总高度 */
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
  padding: 0; /* 确保列表无内边距 */
  margin: 0; /* 确保列表无外边距 */
  display: flex;
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
  max-width: 200px; /* 限制标签最大宽度 */
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
  /* margin-right: 1.5rem; */ /* 调整右边距，因为关闭按钮现在是 flex item */
  line-height: normal; /* 默认行高 */
  flex-grow: 1; /* 允许名称伸展 */
  margin-left: 4px; /* 在状态点和名称之间添加一点间距 */
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
  margin-left: auto; /* 推到右侧 */
  /* 移除绝对定位 */
  /* position: absolute; */
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
  border-left: 1px solid #bdbdbd; /* 左侧分隔线 */
  padding: 0 0.8rem;
  /* margin-left: 0.5rem; */ /* 移除左外边距 */
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

</style>
