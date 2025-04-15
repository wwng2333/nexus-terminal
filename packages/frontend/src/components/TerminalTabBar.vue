<script setup lang="ts">
import { PropType } from 'vue';

// 定义会话状态的简化接口 (仅包含标签栏需要的信息)
interface SessionTabInfo {
  sessionId: string;
  connectionName: string; // 显示在标签上的名称
}

// 定义 Props
const props = defineProps({
  sessions: {
    type: Array as PropType<SessionTabInfo[]>,
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
}

.tab-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
  border-right: 1px solid #bdbdbd;
  background-color: #f0f0f0; /* 未激活标签背景 */
  color: #616161; /* 未激活标签文字颜色 */
  transition: background-color 0.2s ease, color 0.2s ease;
  max-width: 200px; /* 限制标签最大宽度 */
  position: relative; /* 为了关闭按钮定位 */
}

.tab-item:hover {
  background-color: #e0e0e0; /* 悬停时背景 */
}

.tab-item.active {
  background-color: #ffffff; /* 激活标签背景 */
  color: #333333; /* 激活标签文字颜色 */
  border-bottom: 1px solid #ffffff; /* 覆盖底部边框，使其看起来与下方内容区域连接 */
  position: relative;
  z-index: 1; /* 确保激活标签在上方 */
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 0.8rem; /* 与关闭按钮的间距 */
}

.close-tab-button {
  background: none;
  border: none;
  color: #9e9e9e;
  cursor: pointer;
  font-size: 1.1em;
  padding: 0 0.3rem;
  line-height: 1;
  border-radius: 50%;
  margin-left: auto; /* 将按钮推到右侧 */
}

.close-tab-button:hover {
  background-color: #bdbdbd;
  color: #ffffff;
}

.tab-item.active .close-tab-button {
    color: #757575; /* 激活标签上的关闭按钮颜色 */
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
