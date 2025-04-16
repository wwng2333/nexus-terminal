<script setup lang="ts">
import { PropType } from 'vue';
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
    <!-- 可以添加一个 "+" 按钮来打开新标签/连接 -->
    <!-- <button class="add-tab-button">+</button> -->
  </div>
</template>

<style scoped>
.terminal-tab-bar {
  display: flex;
  background-color: #e0e0e0; /* 标签栏背景色 */
  border-bottom: 1px solid #bdbdbd;
  overflow-x: auto; /* 如果标签过多则允许水平滚动 */
  white-space: nowrap;
  padding: 0 0.5rem; /* 左右留出一点空间 */
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
  padding: 0;
  margin: 0;
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

/* 可选：添加新标签按钮样式 */
/*
.add-tab-button {
  background: none;
  border: none;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
  font-size: 1.2em;
  color: #616161;
}
.add-tab-button:hover {
  background-color: #d0d0d0;
}
*/
</style>
