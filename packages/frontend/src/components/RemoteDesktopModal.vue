<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Props (可以稍后添加，例如接收连接信息)
// const props = defineProps<{
//   connection?: ConnectionInfo; // 假设有 ConnectionInfo 类型
// }>();

// Emits (用于通知父组件关闭模态框)
const emit = defineEmits(['close']);

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"> <!-- Changed background class -->
    <div class="bg-background text-foreground rounded-lg shadow-xl w-11/12 max-w-4xl h-5/6 flex flex-col overflow-hidden border border-border">
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <h3 class="text-lg font-semibold">
          <!-- 可以根据 props.connection?.name 动态显示标题 -->
          {{ t('remoteDesktopModal.titlePlaceholder') }}
        </h3>
        <button
          @click="closeModal"
          class="text-text-secondary hover:text-foreground transition-colors duration-150"
          :title="t('common.close')"
        >
          <i class="fas fa-times fa-lg"></i>
        </button>
      </div>

      <!-- Modal Body (Placeholder) -->
      <div class="flex-grow p-4 overflow-y-auto">
        <div class="flex items-center justify-center h-full text-text-secondary text-center">
          <div>
            <i class="fas fa-desktop fa-3x mb-4"></i>
            <p>{{ t('remoteDesktopModal.contentPlaceholder') }}</p>
            <!-- 这里将来会是 Guacamole 或其他 RDP 客户端的容器 -->
          </div>
        </div>
      </div>

      <!-- Modal Footer (Optional) -->
      <!-- <div class="p-4 border-t border-border flex-shrink-0 text-right">
        <button @click="closeModal" class="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark">
          {{ t('common.close') }}
        </button>
      </div> -->
    </div>
  </div>
</template>

<style scoped>
/* 如果需要，可以在这里添加特定的样式 */
</style>