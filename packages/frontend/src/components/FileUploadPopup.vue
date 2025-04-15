<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UploadItem } from '../types/upload.types'; // 导入上传项类型

const props = defineProps<{
  uploads: Record<string, UploadItem>; // 接收上传任务字典
}>();

const emit = defineEmits<{
  (e: 'cancel-upload', uploadId: string): void; // 定义取消上传事件
}>();

const { t } = useI18n();

// 计算是否有可见的上传任务（非已完成或已取消的）
const hasVisibleUploads = computed(() => {
  return Object.values(props.uploads).some(
    upload => upload.status !== 'success' && upload.status !== 'cancelled'
  );
});

// 计算显示的上传列表（可以过滤掉已完成/取消的，或者全部显示）
// 这里选择全部显示，让用户能看到最终状态
const uploadList = computed(() => Object.values(props.uploads));

const handleCancel = (uploadId: string) => {
  emit('cancel-upload', uploadId);
};
</script>

<template>
  <!-- 仅当有上传任务时显示 -->
  <div v-if="uploadList.length > 0" class="upload-popup">
    <h4>{{ t('fileManager.uploadTasks') }}:</h4>
    <ul>
      <li v-for="upload in uploadList" :key="upload.id">
        <span>{{ upload.filename }} ({{ t(`fileManager.uploadStatus.${upload.status}`) }})</span>
        <progress v-if="upload.status === 'uploading' || upload.status === 'pending'" :value="upload.progress" max="100"></progress>
        <span v-if="upload.status === 'uploading'"> {{ upload.progress }}%</span>
        <span v-if="upload.status === 'error'" class="error"> {{ t('fileManager.errors.generic') }}: {{ upload.error }}</span>
        <span v-if="upload.status === 'success'"> ✅</span>
        <span v-if="upload.status === 'cancelled'"> ❌ {{ t('fileManager.uploadStatus.cancelled') }}</span>
        <!-- 只有在可取消状态时显示取消按钮 -->
        <button v-if="['pending', 'uploading', 'paused'].includes(upload.status)" @click="handleCancel(upload.id)" class="cancel-btn">{{ t('fileManager.actions.cancel') }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 样式从 FileManager.vue 迁移并保持一致 */
.upload-popup {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  padding: 0.8rem;
  max-width: 300px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1001; /* 确保在文件列表之上 */
  font-size: 0.9rem; /* 保持字体大小一致 */
}
.upload-popup h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.3rem;
}
.upload-popup ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.upload-popup li {
  margin-bottom: 0.4rem;
  font-size: 0.85em;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem; /* 添加一些间隙 */
}
.upload-popup progress {
  /* margin: 0 0.5rem; */ /* 使用 gap 代替 */
  width: 80px;
  height: 0.8em;
  flex-shrink: 0; /* 防止进度条被压缩 */
}
.upload-popup .error {
  color: red;
  /* margin-left: 0.5rem; */ /* 使用 gap 代替 */
  flex-basis: 100%; /* 错误信息换行 */
  font-size: 0.8em;
}
.upload-popup .cancel-btn {
  margin-left: auto; /* 将按钮推到右侧 */
  padding: 0.1rem 0.4rem;
  font-size: 0.8em;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
  cursor: pointer;
  border-radius: 3px;
}
.upload-popup .cancel-btn:hover {
    background-color: #f5c6cb;
}
</style>
