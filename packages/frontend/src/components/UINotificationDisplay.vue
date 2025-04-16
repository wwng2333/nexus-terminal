<script setup lang="ts">
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { storeToRefs } from 'pinia';

const notificationsStore = useUiNotificationsStore();
const { notifications } = storeToRefs(notificationsStore);

const getIconClass = (type: string) => {
  switch (type) {
    case 'success': return 'fas fa-check-circle';
    case 'error': return 'fas fa-times-circle';
    case 'info': return 'fas fa-info-circle';
    case 'warning': return 'fas fa-exclamation-triangle';
    default: return '';
  }
};

const getContainerClass = (type: string) => {
  return `notification-item notification-${type}`;
};
</script>

<template>
  <div class="notification-container">
    <transition-group name="notification-fade" tag="div">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="getContainerClass(notification.type)"
      >
        <i :class="['notification-icon', getIconClass(notification.type)]"></i>
        <span class="notification-message">{{ notification.message }}</span>
        <button
          class="notification-close-btn"
          @click="notificationsStore.removeNotification(notification.id)"
        >
          &times;
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 1rem; /* 距离顶部 */
  right: 1rem; /* 距离右侧 */
  z-index: 1100; /* 比其他元素层级高 */
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* 从右侧对齐 */
}

.notification-item {
  background-color: #fff;
  color: #fff;
  padding: 0.8rem 1.2rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  min-width: 250px; /* 最小宽度 */
  max-width: 400px; /* 最大宽度 */
  opacity: 0.95;
  transition: all 0.5s ease; /* 添加过渡效果 */
}

.notification-success { background-color: #28a745; } /* 绿色 */
.notification-error { background-color: #dc3545; } /* 红色 */
.notification-info { background-color: #17a2b8; } /* 蓝色 */
.notification-warning { background-color: #ffc107; color: #333; } /* 黄色，文字用深色 */

.notification-icon {
  margin-right: 0.8rem;
  font-size: 1.2em;
}

.notification-message {
  flex-grow: 1;
  word-wrap: break-word; /* 允许长单词换行 */
}

.notification-close-btn {
  background: none;
  border: none;
  color: inherit; /* 继承父元素颜色 */
  opacity: 0.7;
  cursor: pointer;
  font-size: 1.2em;
  margin-left: 1rem;
  padding: 0 0.3rem;
}
.notification-close-btn:hover {
  opacity: 1;
}

/* 过渡动画 */
.notification-fade-enter-active,
.notification-fade-leave-active {
  transition: all 0.5s ease;
}
.notification-fade-enter-from,
.notification-fade-leave-to {
  opacity: 0;
  transform: translateX(30px); /* 从右侧滑入 */
}
</style>
