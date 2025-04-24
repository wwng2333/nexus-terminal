<template>
  <div class="flex justify-center items-center min-h-[calc(100vh-150px)] p-8 bg-background">
    <div class="bg-background text-foreground p-8 md:p-12 rounded-lg shadow-lg w-full max-w-md border border-border"> <!-- Changed bg-dialog to bg-background, text-dialog-text to text-foreground -->
      <!-- Logo -->
      <div class="flex justify-center mb-6">
        <img src="../assets/logo.png" alt="Project Logo" class="h-20 w-auto"> <!-- 增大 logo 高度 -->
      </div>
      <h2 class="text-center text-2xl font-semibold mb-4 text-foreground">{{ $t('setup.title') }}</h2>
      <p class="text-center text-sm text-text-secondary mb-6">
        {{ $t('setup.description') }}
      </p>
      <form @submit.prevent="handleSetup">
        <div class="mb-6">
          <label for="username" class="block mb-2 font-bold text-text-secondary">{{ $t('setup.username') }}:</label>
          <input
            id="username"
            v-model="username"
            name="username"
            type="text"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.usernamePlaceholder')"
            class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
          />
        </div>
        <div class="mb-6">
          <label for="password" class="block mb-2 font-bold text-text-secondary">{{ $t('setup.password') }}:</label>
          <input
            id="password"
            v-model="password"
            name="password"
            type="password"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.passwordPlaceholder')"
            class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
          />
        </div>
        <div class="mb-6">
          <label for="confirmPassword" class="block mb-2 font-bold text-text-secondary">{{ $t('setup.confirmPassword') }}:</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.confirmPasswordPlaceholder')"
            class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
          />
        </div>

        <div v-if="error" class="text-error bg-error/10 border border-error/20 px-5 py-3 mb-4 rounded text-center text-sm">
          {{ error }}
        </div>
         <div v-if="successMessage" class="text-success bg-success/10 border border-success/20 px-5 py-3 mb-4 rounded text-center text-sm">
          {{ successMessage }}
        </div>

        <button type="submit" :disabled="isLoading"
                class="w-full py-3 px-4 bg-primary text-white border-none rounded text-base cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-dark disabled:bg-gray-400 disabled:opacity-65 disabled:cursor-not-allowed">
          <span v-if="isLoading">{{ $t('setup.settingUp') }}</span>
          <span v-else>{{ $t('setup.submitButton') }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth.store'; // *** 新增：导入 Auth Store ***

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore(); // *** 新增：获取 Auth Store 实例 ***

const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const handleSetup = async () => {
  error.value = null;
  successMessage.value = null;

  if (password.value !== confirmPassword.value) {
    error.value = t('setup.error.passwordsDoNotMatch');
    return;
  }

  if (!username.value || !password.value) {
      error.value = t('setup.error.fieldsRequired');
      return;
  }

  isLoading.value = true;

  try {
    // 确保调用正确的后端 API 端点
    await apiClient.post('/auth/setup', { // 使用 apiClient 并移除 base URL
      username: username.value,
      password: password.value,
      confirmPassword: confirmPassword.value
    });
    successMessage.value = t('setup.success');
    // *** 新增：手动更新 needsSetup 状态 ***
    authStore.needsSetup = false;
    // *** 新增：重置认证状态，因为设置完成后需要重新登录 ***
    authStore.isAuthenticated = false;
    authStore.user = null;
    // 禁用表单或按钮，防止重复提交
    isLoading.value = true; // Keep loading state to disable button
    // Redirect to login immediately after showing success message (removed setTimeout)
    // The success message will be briefly visible before navigation.
    router.push('/login');
  } catch (err: any) {
    console.error('Setup failed:', err);
    if (err.response?.data?.message) {
      // 尝试从后端响应中获取更具体的错误信息
      error.value = err.response.data.message;
    } else if (err.message) {
       error.value = err.message;
    } else {
       error.value = t('setup.error.generic');
    }
     isLoading.value = false; // Re-enable button on error
  }
  // Removed finally block setting isLoading to false on success to keep button disabled
};
</script>

<!-- Copied styles from LoginView.vue -->