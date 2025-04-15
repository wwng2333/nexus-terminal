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
        <button type="submit" :disabled="changePasswordLoading">{{ changePasswordLoading ? $t('common.loading') : $t('settings.changePassword.submit') }}</button>
        <p v-if="changePasswordMessage" :class="{ 'success-message': changePasswordSuccess, 'error-message': !changePasswordSuccess }">{{ changePasswordMessage }}</p>
      </form>
    </div>

    <!-- 其他设置项可以在这里添加 -->

    <hr>

    <div class="settings-section">
      <h2>{{ $t('settings.twoFactor.title') }}</h2>

      <!-- 如果 2FA 已启用 -->
      <div v-if="twoFactorEnabled">
        <p class="success-message">{{ $t('settings.twoFactor.status.enabled') }}</p>
        <form @submit.prevent="handleDisable2FA">
          <div class="form-group">
            <label for="disablePassword">{{ $t('settings.twoFactor.disable.passwordPrompt') }}</label>
            <input type="password" id="disablePassword" v-model="disablePassword" required>
          </div>
          <button type="submit" :disabled="twoFactorLoading">{{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.disable.button') }}</button>
        </form>
      </div>

      <!-- 如果 2FA 未启用 -->
      <div v-else>
        <p>{{ $t('settings.twoFactor.status.disabled') }}</p>
        <!-- 如果不在设置流程中，显示启用按钮 -->
        <button v-if="!isSettingUp2FA" @click="handleSetup2FA" :disabled="twoFactorLoading">
          {{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.enable.button') }}
        </button>

        <!-- 如果正在设置中 -->
        <div v-if="isSettingUp2FA && setupData">
          <p>{{ $t('settings.twoFactor.setup.scanQrCode') }}</p>
          <img :src="setupData.qrCodeUrl" alt="QR Code">
          <p>{{ $t('settings.twoFactor.setup.orEnterSecret') }} <code>{{ setupData.secret }}</code></p>
          <form @submit.prevent="handleVerifyAndActivate2FA">
            <div class="form-group">
              <label for="verificationCode">{{ $t('settings.twoFactor.setup.enterCode') }}</label>
              <input type="text" id="verificationCode" v-model="verificationCode" required pattern="\d{6}" title="请输入 6 位数字验证码">
            </div>
            <button type="submit" :disabled="twoFactorLoading">{{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.setup.verifyButton') }}</button>
            <button type="button" @click="cancelSetup" :disabled="twoFactorLoading" style="margin-left: 10px;">{{ $t('common.cancel') }}</button>
          </form>
        </div>
      </div>

      <!-- 显示 2FA 操作的消息 -->
      <p v-if="twoFactorMessage" :class="{ 'success-message': twoFactorSuccess, 'error-message': !twoFactorSuccess }">{{ twoFactorMessage }}</p>
    </div>

    <hr>

    <div class="settings-section">
      <h2>{{ $t('settings.ipWhitelist.title') }}</h2>
      <p>{{ $t('settings.ipWhitelist.description') }}</p>
      <form @submit.prevent="handleUpdateIpWhitelist">
        <div class="form-group">
          <label for="ipWhitelist">{{ $t('settings.ipWhitelist.label') }}</label>
          <textarea id="ipWhitelist" v-model="ipWhitelistInput" rows="5"></textarea>
          <small>{{ $t('settings.ipWhitelist.hint') }}</small>
        </div>
        <button type="submit" :disabled="ipWhitelistLoading">{{ ipWhitelistLoading ? $t('common.loading') : $t('settings.ipWhitelist.saveButton') }}</button>
        <p v-if="ipWhitelistMessage" :class="{ 'success-message': ipWhitelistSuccess, 'error-message': !ipWhitelistSuccess }">{{ ipWhitelistMessage }}</p>
      </form>
    </div>

    <!-- 其他设置项可以在这里添加 -->

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'; // 导入 onMounted 和 computed
import { useAuthStore } from '../stores/auth.store';
import { useI18n } from 'vue-i18n';
import axios from 'axios'; // 需要 axios 来调用 API

const { t } = useI18n();
const authStore = useAuthStore();

// --- 修改密码状态 ---
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changePasswordLoading = ref(false);
const changePasswordMessage = ref('');
const changePasswordSuccess = ref(false);

// --- 2FA 状态 ---
const twoFactorEnabled = ref(false); // 用户当前的 2FA 状态
const twoFactorLoading = ref(false);
const twoFactorMessage = ref('');
const twoFactorSuccess = ref(false);
const setupData = ref<{ secret: string; qrCodeUrl: string } | null>(null); // 存储设置密钥和二维码
const verificationCode = ref(''); // 用户输入的验证码
const disablePassword = ref(''); // 禁用时需要输入的密码

// --- IP 白名单状态 ---
const ipWhitelistInput = ref(''); // 用于编辑的文本区域内容
const ipWhitelistLoading = ref(false);
const ipWhitelistMessage = ref('');
const ipWhitelistSuccess = ref(false);

// 计算属性判断当前是否处于 2FA 设置流程中
const isSettingUp2FA = computed(() => setupData.value !== null);

// 获取当前用户的 2FA 状态 (理想情况下后端应提供接口，这里暂时假设从 authStore 或其他地方获取)
const checkTwoFactorStatus = async () => {
  // 调用 store action 获取最新状态
  await authStore.checkAuthStatus();
  // 从 store 更新本地状态
  twoFactorEnabled.value = authStore.user?.isTwoFactorEnabled ?? false;
};

// 获取当前的 IP 白名单设置
const fetchIpWhitelist = async () => {
    ipWhitelistLoading.value = true;
    ipWhitelistMessage.value = '';
    try {
        // 使用 settings API 获取所有设置
        const response = await axios.get<Record<string, string>>('/api/v1/settings');
        ipWhitelistInput.value = response.data['ipWhitelist'] || ''; // 从设置中获取，默认为空字符串
    } catch (error: any) {
        console.error('获取 IP 白名单设置失败:', error);
        ipWhitelistMessage.value = t('settings.ipWhitelist.error.fetchFailed');
        ipWhitelistSuccess.value = false;
    } finally {
        ipWhitelistLoading.value = false;
    }
};


onMounted(async () => { // 使 onMounted 异步
  await checkTwoFactorStatus(); // 等待状态检查完成
  await fetchIpWhitelist(); // 获取 IP 白名单设置
});


const handleChangePassword = async () => {
  changePasswordMessage.value = ''; // 清除之前的消息
  changePasswordSuccess.value = false;

  if (newPassword.value !== confirmPassword.value) {
    changePasswordMessage.value = t('settings.changePassword.error.passwordsDoNotMatch');
    return;
  }

  // 可选：添加前端密码复杂度校验
  // 可选：添加前端密码复杂度校验

  changePasswordLoading.value = true;
  try {
    await authStore.changePassword(currentPassword.value, newPassword.value);
    changePasswordMessage.value = t('settings.changePassword.success');
    changePasswordSuccess.value = true;
    // 清空表单
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error: any) {
    console.error('修改密码失败:', error);
    changePasswordMessage.value = error.message || t('settings.changePassword.error.generic');
    changePasswordSuccess.value = false;
  } finally {
    changePasswordLoading.value = false;
  }
};

// --- 2FA 相关方法 ---

// 开始设置 2FA
const handleSetup2FA = async () => {
  twoFactorMessage.value = '';
  twoFactorSuccess.value = false;
  twoFactorLoading.value = true;
  setupData.value = null; // 清除旧数据
  verificationCode.value = ''; // 清除验证码

  try {
    const response = await axios.post<{ secret: string; qrCodeUrl: string }>('/api/v1/auth/2fa/setup');
    setupData.value = response.data;
  } catch (error: any) {
    console.error('开始设置 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.setupFailed');
  } finally {
    twoFactorLoading.value = false;
  }
};

// 验证并激活 2FA
const handleVerifyAndActivate2FA = async () => {
  if (!setupData.value || !verificationCode.value) {
    twoFactorMessage.value = t('settings.twoFactor.error.codeRequired');
    return;
  }

  twoFactorMessage.value = '';
  twoFactorSuccess.value = false;
  twoFactorLoading.value = true;

  try {
    await axios.post('/api/v1/auth/2fa/verify', { token: verificationCode.value });
    twoFactorMessage.value = t('settings.twoFactor.success.activated');
    twoFactorSuccess.value = true;
    twoFactorEnabled.value = true; // 更新状态
    setupData.value = null; // 清除设置数据
    verificationCode.value = '';
  } catch (error: any) {
    console.error('验证并激活 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.verificationFailed');
  } finally {
    twoFactorLoading.value = false;
  }
};

// 禁用 2FA
const handleDisable2FA = async () => {
  if (!disablePassword.value) {
      twoFactorMessage.value = t('settings.twoFactor.error.passwordRequiredForDisable');
      return;
  }
  twoFactorMessage.value = '';
  twoFactorSuccess.value = false;
  twoFactorLoading.value = true;

  try {
    await axios.delete('/api/v1/auth/2fa', { data: { password: disablePassword.value } }); // DELETE 请求体通过 data 发送
    twoFactorMessage.value = t('settings.twoFactor.success.disabled');
    twoFactorSuccess.value = true;
    twoFactorEnabled.value = false; // 更新状态
    disablePassword.value = ''; // 清空密码
  } catch (error: any) {
    console.error('禁用 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.disableFailed');
  } finally {
    twoFactorLoading.value = false;
  }
};

// 取消设置流程
const cancelSetup = () => {
    setupData.value = null;
    verificationCode.value = '';
    twoFactorMessage.value = '';
};

// --- IP 白名单相关方法 ---
const handleUpdateIpWhitelist = async () => {
    ipWhitelistLoading.value = true;
    ipWhitelistMessage.value = '';
    ipWhitelistSuccess.value = false;

    try {
        // 调用 settings API 更新设置
        await axios.put('/api/v1/settings', {
            ipWhitelist: ipWhitelistInput.value.trim() // 发送修剪后的值
        });
        ipWhitelistMessage.value = t('settings.ipWhitelist.success.saved');
        ipWhitelistSuccess.value = true;
    } catch (error: any) {
        console.error('更新 IP 白名单失败:', error);
        ipWhitelistMessage.value = error.response?.data?.message || t('settings.ipWhitelist.error.saveFailed');
        ipWhitelistSuccess.value = false;
    } finally {
        ipWhitelistLoading.value = false;
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

input[type="password"],
input[type="text"],
textarea { /* 添加 textarea 样式 */
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc; /* 确保 textarea 有边框 */
  border-radius: 4px; /* 确保 textarea 有圆角 */
  font-family: inherit; /* 继承字体 */
  font-size: inherit; /* 继承字号 */
}

textarea {
    resize: vertical; /* 允许垂直调整大小 */
    min-height: 80px; /* 设置最小高度 */
}

small { /* 提示文字样式 */
    display: block;
    margin-top: 5px;
    font-size: 0.85em;
    color: #666;
}


button {
  padding: 10px 15px;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

hr {
    border: none;
    border-top: 1px solid #eee;
    margin: 30px 0;
}

code {
    background-color: #f1f1f1;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
}

img {
    display: block;
    margin: 10px 0;
    max-width: 200px; /* 限制二维码大小 */
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
