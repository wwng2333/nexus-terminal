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
  <div class="flex justify-center items-center min-h-[calc(100vh-150px)] p-8 bg-background">
    <div class="bg-dialog text-dialog-text p-8 md:p-12 rounded-lg shadow-lg w-full max-w-md">
      <h2 class="text-center text-2xl font-semibold mb-6 text-foreground">{{ t('login.title') }}</h2>
      <form @submit.prevent="handleSubmit">
        <!-- Regular Login Fields -->
        <div v-if="!loginRequires2FA">
          <div class="mb-6">
            <label for="username" class="block mb-2 font-bold text-text-secondary">{{ t('login.username') }}:</label>
            <input type="text" id="username" v-model="credentials.username" required :disabled="isLoading"
                   class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed" />
          </div>
          <div class="mb-6">
            <label for="password" class="block mb-2 font-bold text-text-secondary">{{ t('login.password') }}:</label>
            <input type="password" id="password" v-model="credentials.password" required :disabled="isLoading"
                   class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed" />
          </div>
          <!-- Remember Me Checkbox -->
          <div class="flex items-center mb-6">
            <input type="checkbox" id="rememberMe" v-model="rememberMe" :disabled="isLoading"
                   class="w-4 h-4 mr-2 accent-primary disabled:cursor-not-allowed" />
            <label for="rememberMe" class="text-sm text-text-secondary cursor-pointer">{{ t('login.rememberMe', '记住我') }}</label>
          </div>
        </div>

        <!-- 2FA Token Input -->
        <div v-if="loginRequires2FA" class="mb-6">
          <label for="twoFactorToken" class="block mb-2 font-bold text-text-secondary">{{ t('login.twoFactorPrompt') }}</label>
          <input type="text" id="twoFactorToken" v-model="twoFactorToken" required :disabled="isLoading" pattern="\d{6}" title="请输入 6 位数字验证码"
                 class="w-full px-4 py-3 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150 disabled:bg-gray-200 disabled:cursor-not-allowed" />
        </div>

        <div v-if="error" class="text-error text-center text-sm mb-4">
          {{ error }}
        </div>

        <button type="submit" :disabled="isLoading"
                class="w-full py-3 px-4 bg-primary text-white border-none rounded text-base cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed">
          {{ isLoading ? t('login.loggingIn') : (loginRequires2FA ? t('login.verifyButton') : t('login.loginButton')) }}
        </button>
      </form>
    </div>
  </div>
</template>

