<template>
  <div class="login-view"> <!-- Use class from LoginView -->
    <div class="login-form-container"> <!-- Use class from LoginView -->
      <h2>{{ $t('setup.title') }}</h2>
      <p class="text-center text-sm text-gray-600 dark:text-gray-400 mb-6"> <!-- Added margin bottom -->
        {{ $t('setup.description') }}
      </p>
      <form @submit.prevent="handleSetup">
        <div class="form-group"> <!-- Use class from LoginView -->
          <label for="username">{{ $t('setup.username') }}:</label>
          <input
            id="username"
            v-model="username"
            name="username"
            type="text"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.usernamePlaceholder')"
          />
        </div>
        <div class="form-group"> <!-- Use class from LoginView -->
          <label for="password">{{ $t('setup.password') }}:</label>
          <input
            id="password"
            v-model="password"
            name="password"
            type="password"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.passwordPlaceholder')"
          />
        </div>
        <div class="form-group"> <!-- Use class from LoginView -->
          <label for="confirmPassword">{{ $t('setup.confirmPassword') }}:</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            :disabled="isLoading"
            :placeholder="$t('setup.confirmPasswordPlaceholder')"
          />
        </div>

        <!-- Use error-message class from LoginView -->
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
         <!-- Use success-message styling similar to error -->
         <div v-if="successMessage" class="success-message">
          {{ successMessage }}
        </div>

        <button type="submit" :disabled="isLoading">
          <span v-if="isLoading">{{ $t('setup.settingUp') }}</span>
          <span v-else>{{ $t('setup.submitButton') }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
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
    await axios.post('/api/v1/auth/setup', {
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
<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 150px); /* Adjust based on header/footer height */
  padding: 2rem;
  /* Inherit background from body or set explicitly if needed */
   background-color: var(--app-bg-color, #f8f9fa); /* Use CSS variable or fallback */
}

.login-form-container {
  background-color: var(--card-bg-color, #fff); /* Use CSS variable or fallback */
  color: var(--text-color, #333); /* Use CSS variable */
  padding: 2rem 3rem;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color, #ccc); /* Use CSS variable */
  width: 100%;
  max-width: 400px;
}

/* Dark mode adjustments (assuming body has a dark class) */
.dark .login-form-container {
  background-color: var(--card-bg-color-dark, #2d3748); /* Dark card background */
  color: var(--text-color-dark, #f7fafc); /* Dark text */
  border-color: var(--border-color-dark, #4a5568); /* Dark border */
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}


h2 {
  text-align: center;
  margin-bottom: 1.5rem;
  /* color: #333; */ /* Inherit from container */
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  /* color: #555; */ /* Inherit */
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid var(--border-color, #ccc); /* Use CSS variable */
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 1rem;
  background-color: var(--input-bg-color, #fff); /* Use CSS variable */
  color: var(--input-text-color, #333); /* Use CSS variable */
}

.dark input[type="text"],
.dark input[type="password"] {
   border-color: var(--border-color-dark, #4a5568);
   background-color: var(--input-bg-color-dark, #4a5568);
   color: var(--input-text-color-dark, #f7fafc);
}


input:disabled {
    background-color: var(--input-disabled-bg-color, #eee); /* Use CSS variable */
    cursor: not-allowed;
    opacity: 0.7;
}
.dark input:disabled {
     background-color: var(--input-disabled-bg-color-dark, #4a5568);
}


.error-message {
  color: #dc3545; /* Bootstrap danger color */
  background-color: rgba(220, 53, 69, 0.1); /* Light red background */
  border: 1px solid rgba(220, 53, 69, 0.2);
  padding: 0.75rem 1.25rem;
  margin-bottom: 1rem;
  border-radius: 4px;
  text-align: center;
  font-size: 0.9rem;
}
.success-message {
  color: #28a745; /* Bootstrap success color */
   background-color: rgba(40, 167, 69, 0.1);
   border: 1px solid rgba(40, 167, 69, 0.2);
   padding: 0.75rem 1.25rem;
   margin-bottom: 1rem;
   border-radius: 4px;
   text-align: center;
   font-size: 0.9rem;
}


button[type="submit"] {
  width: 100%;
  padding: 0.8rem;
  background-color: var(--primary-color, #007bff); /* Use CSS variable */
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

button[type="submit"]:hover:not(:disabled) {
  background-color: var(--primary-hover-color, #0056b3); /* Use CSS variable */
}

button:disabled {
  background-color: var(--button-disabled-bg-color, #a0cfff); /* Use CSS variable */
  cursor: not-allowed;
  opacity: 0.65;
}
</style>