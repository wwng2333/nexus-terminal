<template>
  <div class="settings-view">
    <h1>{{ $t('settings.title') }}</h1>

    <div class="settings-section">
      <h2>{{ $t('settings.changePassword.title') }}</h2>
      <form @submit.prevent="handleChangePassword">
        <div class="form-group">
          <label for="currentPassword">{{ $t('settings.changePassword.currentPassword') }}</label>
          <input type="password" id="currentPassword" v-model="currentPassword" required>
        </div>
        <div class="form-group">
          <label for="newPassword">{{ $t('settings.changePassword.newPassword') }}</label>
          <input type="password" id="newPassword" v-model="newPassword" required>
        </div>
        <div class="form-group">
          <label for="confirmPassword">{{ $t('settings.changePassword.confirmPassword') }}</label>
          <input type="password" id="confirmPassword" v-model="confirmPassword" required>
        </div>
        <button type="submit" :disabled="loading">{{ loading ? $t('common.loading') : $t('settings.changePassword.submit') }}</button>
        <p v-if="message" :class="{ 'success-message': isSuccess, 'error-message': !isSuccess }">{{ message }}</p>
      </form>
    </div>

    <!-- 其他设置项可以在这里添加 -->

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth.store';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const authStore = useAuthStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const message = ref('');
const isSuccess = ref(false);

const handleChangePassword = async () => {
  message.value = ''; // 清除之前的消息
  isSuccess.value = false;

  if (newPassword.value !== confirmPassword.value) {
    message.value = t('settings.changePassword.error.passwordsDoNotMatch');
    return;
  }

  // 可选：添加前端密码复杂度校验

  loading.value = true;
  try {
    await authStore.changePassword(currentPassword.value, newPassword.value);
    message.value = t('settings.changePassword.success');
    isSuccess.value = true;
    // 清空表单
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error: any) {
    console.error('修改密码失败:', error);
    message.value = error.message || t('settings.changePassword.error.generic');
    isSuccess.value = false;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.settings-view {
  padding: 20px;
}

.settings-section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
}

input[type="password"] {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

button {
  padding: 10px 15px;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.success-message {
  color: green;
  margin-top: 10px;
}

.error-message {
  color: red;
  margin-top: 10px;
}
</style>
