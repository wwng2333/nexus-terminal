<script setup lang="ts">
import { type PropType } from 'vue';
import type { ContextMenuItem } from '../composables/file-manager/useFileManagerContextMenu'; // 导入菜单项类型

defineProps({
  isVisible: {
    type: Boolean,
    required: true,
  },
  position: {
    type: Object as PropType<{ x: number; y: number }>,
    required: true,
  },
  items: {
    type: Array as PropType<ContextMenuItem[]>,
    required: true,
  },
});

// 隐藏菜单的逻辑由 useFileManagerContextMenu 中的全局点击监听器处理
// 但我们仍然需要触发菜单项的 action，并通知父组件关闭菜单
const emit = defineEmits(['item-click', 'close-request']); // 添加 close-request

const handleItemClick = (item: ContextMenuItem) => {
  if (!item.disabled) {
    item.action(); // 直接执行 action
    emit('close-request'); // <-- 发出关闭请求
    // 不需要 emit('item-click', item) 了
  }
};
</script>

<template>
  <div
    v-if="isVisible"
    class="context-menu"
    :style="{ top: `${position.y}px`, left: `${position.x}px` }"
    @click.stop
  >
    <ul>
      <li
        v-for="(menuItem, index) in items"
        :key="index"
        @click.stop="handleItemClick(menuItem)"
        :class="{ disabled: menuItem.disabled }"
      >
        {{ menuItem.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 从 FileManager.vue 移动过来的样式 */
.context-menu {
  position: fixed;
  background-color: var(--app-bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
  z-index: 1002;
  min-width: 150px;
  border-radius: 4px;
}
.context-menu ul {
  list-style: none;
  padding: var(--base-margin, 0.5rem) 0; /* 使用 CSS 变量 */
  margin: 0;
}
.context-menu li {
  padding: 0.6rem var(--base-padding, 1rem); /* 使用 CSS 变量 */
  cursor: pointer;
  color: var(--text-color);
  font-size: 0.9em;
  display: flex;
  align-items: center;
  transition: background-color 0.15s ease; /* 添加过渡效果 */
}
.context-menu li:hover:not(.disabled) { /* 仅在非禁用时应用悬停效果 */
  background-color: var(--header-bg-color);
}
.context-menu li.disabled {
  color: var(--text-color-secondary);
  cursor: not-allowed;
  background-color: var(--app-bg-color); /* 确保禁用项背景与菜单一致 */
  opacity: 0.6;
}
</style>