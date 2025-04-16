import { defineStore } from 'pinia';
import { ref } from 'vue';

// 定义通知对象的接口
export interface UINotification {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number; // 可选的自动关闭超时时间 (毫秒)
}

export const useUiNotificationsStore = defineStore('uiNotifications', () => {
  const notifications = ref<UINotification[]>([]);
  let nextId = 0;

  /**
   * 添加一个新通知
   * @param notification - 通知对象 (至少包含 type 和 message)
   */
  const addNotification = (notification: Omit<UINotification, 'id'>) => {
    const id = nextId++;
    const newNotification: UINotification = { ...notification, id };
    notifications.value.push(newNotification);

    // 如果设置了超时，则在超时后自动移除通知
    if (notification.timeout) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.timeout);
    }
  };

  /**
   * 移除一个通知
   * @param id - 要移除的通知的 ID
   */
  const removeNotification = (id: number) => {
    notifications.value = notifications.value.filter(n => n.id !== id);
  };

  // 便捷方法
  const showError = (message: string, options: { timeout?: number } = {}) => {
    addNotification({ type: 'error', message, timeout: options.timeout ?? 5000 }); // 默认 5 秒超时
  };

  const showSuccess = (message: string, options: { timeout?: number } = {}) => {
    addNotification({ type: 'success', message, timeout: options.timeout ?? 3000 }); // 默认 3 秒超时
  };

  const showInfo = (message: string, options: { timeout?: number } = {}) => {
    addNotification({ type: 'info', message, timeout: options.timeout ?? 3000 });
  };

  const showWarning = (message: string, options: { timeout?: number } = {}) => {
    addNotification({ type: 'warning', message, timeout: options.timeout ?? 5000 });
  };


  return {
    notifications,
    addNotification,
    removeNotification,
    showError,
    showSuccess,
    showInfo,
    showWarning,
  };
});
