<script setup lang="ts">
import { reactive } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import { useAuthStore } from '../stores/auth.store';

const { t } = useI18n(); // 获取 t 函数
const authStore = useAuthStore();
const { isLoading, error } = storeToRefs(authStore); // 获取加载和错误状态

// 表单数据
const credentials = reactive({
  username: '',
  password: '',
});

// 处理登录提交
const handleLogin = async () => {
  await authStore.login(credentials);
  // 登录成功会自动重定向 (在 store action 中处理)
  // 登录失败会在模板中显示错误信息
};
</script>

<template>
  <div class="login-view">
    <div class="login-form-container">
      <h2>{{ t('login.title') }}</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">{{ t('login.username') }}:</label>
          <input type="text" id="username" v-model="credentials.username" required :disabled="isLoading" />
        </div>
        <div class="form-group">
          <label for="password">{{ t('login.password') }}:</label>
          <input type="password" id="password" v-model="credentials.password" required :disabled="isLoading" />
        </div>

        <div v-if="error" class="error-message">
          <!-- 可以直接显示后端返回的错误，或者映射到特定的 i18n key -->
          {{ error }} <!-- 保持显示后端错误，或者 t('login.error') -->
        </div>

        <button type="submit" :disabled="isLoading">
          {{ isLoading ? t('login.loggingIn') : t('login.loginButton') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 150px); /* Adjust based on header/footer height */
  padding: 2rem;
}

.login-form-container {
  background-color: #fff;
  padding: 2rem 3rem;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

h2 {
  text-align: center;
  margin-bottom: 1.5rem;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #555;
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 1rem;
}

input:disabled {
    background-color: #eee;
    cursor: not-allowed;
}

.error-message {
  color: red;
  margin-bottom: 1rem;
  text-align: center;
  font-size: 0.9rem;
}

button[type="submit"] {
  width: 100%;
  padding: 0.8rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

button[type="submit"]:hover {
  background-color: #0056b3;
}

button:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}
</style>
