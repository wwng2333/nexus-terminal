<script setup lang="ts">
import { reactive, ref } from 'vue'; // 导入 ref
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth.store';

const { t } = useI18n();
const authStore = useAuthStore();
// 获取 loginRequires2FA 状态
const { isLoading, error, loginRequires2FA } = storeToRefs(authStore);

// 表单数据
const credentials = reactive({
  username: '',
  password: '',
});
const twoFactorToken = ref(''); // 用于存储 2FA 验证码
const rememberMe = ref(false); // 新增：记住我状态，默认为 false

// 处理登录或 2FA 验证提交
const handleSubmit = async () => {
  if (loginRequires2FA.value) {
    // 如果需要 2FA，则调用 2FA 验证 action
    await authStore.verifyLogin2FA(twoFactorToken.value);
  } else {
    // 否则，调用常规登录 action，并传递 rememberMe 状态
    await authStore.login({ ...credentials, rememberMe: rememberMe.value });
  }
  // 成功后的重定向由 store action 处理
  // 失败会更新 error 状态并在模板中显示
};
</script>

<template>
  <div class="login-view">
    <div class="login-form-container">
      <h2>{{ t('login.title') }}</h2>
      <form @submit.prevent="handleSubmit">
        <!-- 常规登录字段 -->
        <div v-if="!loginRequires2FA">
          <div class="form-group">
            <label for="username">{{ t('login.username') }}:</label>
            <input type="text" id="username" v-model="credentials.username" required :disabled="isLoading" />
          </div>
          <div class="form-group">
            <label for="password">{{ t('login.password') }}:</label>
            <input type="password" id="password" v-model="credentials.password" required :disabled="isLoading" />
          </div>
          <!-- 新增：记住我复选框 -->
          <div class="form-group form-group-checkbox">
            <input type="checkbox" id="rememberMe" v-model="rememberMe" :disabled="isLoading" />
            <label for="rememberMe">{{ t('login.rememberMe') }}</label>
          </div>
        </div>

        <!-- 2FA 验证码输入 -->
        <div v-if="loginRequires2FA" class="form-group">
          <label for="twoFactorToken">{{ t('login.twoFactorPrompt') }}</label>
          <input type="text" id="twoFactorToken" v-model="twoFactorToken" required :disabled="isLoading" pattern="\d{6}" title="请输入 6 位数字验证码" />
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <button type="submit" :disabled="isLoading">
          {{ isLoading ? t('login.loggingIn') : (loginRequires2FA ? t('login.verifyButton') : t('login.loginButton')) }}
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

/* Specific style for checkbox group */
.form-group-checkbox {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem; /* Keep consistent margin */
}

.form-group-checkbox input[type="checkbox"] {
  width: auto; /* Override default width */
  margin-right: 0.5rem; /* Space between checkbox and label */
  accent-color: #007bff; /* Optional: Style the checkmark color */
}

.form-group-checkbox label {
  margin-bottom: 0; /* Remove bottom margin for inline label */
  font-weight: normal; /* Optional: Make label less bold */
  cursor: pointer; /* Indicate it's clickable */
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
