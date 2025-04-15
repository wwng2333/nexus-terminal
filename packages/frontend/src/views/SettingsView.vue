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
      <h2>Passkey 设置</h2>
      <p>使用 Passkey（无密码认证）提升安全性和便捷性。您可以注册新的 Passkey 用于登录。</p>
      <div class="form-group">
        <label for="passkey-name">{{ $t('settings.passkey.nameLabel') }}:</label>
        <input type="text" id="passkey-name" v-model="passkeyName" :placeholder="$t('settings.passkey.namePlaceholder')" required>
      </div>
      <button @click="handleRegisterPasskey" class="btn btn-primary">{{ $t('settings.passkey.registerButton') }}</button>
      <p v-if="passkeyMessage" class="success-message">{{ passkeyMessage }}</p>
      <p v-if="passkeyError" class="error-message">{{ passkeyError }}</p>
    </div>

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

    <hr>

    <!-- IP 黑名单管理 -->
    <div class="settings-section">
      <h2>IP 黑名单管理</h2>
      <p>配置登录失败次数限制和自动封禁时长。本地地址 (127.0.0.1, ::1) 不会被封禁。</p>

      <!-- 黑名单配置表单 -->
      <form @submit.prevent="handleUpdateBlacklistSettings" class="blacklist-settings-form">
         <div class="form-group inline-group">
           <label for="maxLoginAttempts">最大失败次数:</label>
           <input type="number" id="maxLoginAttempts" v-model="blacklistSettings.maxLoginAttempts" min="1" required>
         </div>
         <div class="form-group inline-group">
           <label for="loginBanDuration">封禁时长 (秒):</label>
           <input type="number" id="loginBanDuration" v-model="blacklistSettings.loginBanDuration" min="1" required>
         </div>
         <button type="submit" :disabled="blacklistSettings.loading">{{ blacklistSettings.loading ? '保存中...' : '保存配置' }}</button>
         <p v-if="blacklistSettings.message" :class="{ 'success-message': blacklistSettings.success, 'error-message': !blacklistSettings.success }">{{ blacklistSettings.message }}</p>
      </form>

      <hr style="margin-top: 20px; margin-bottom: 20px;">

      <h3>当前已封禁的 IP 地址</h3>
      <div v-if="ipBlacklist.loading" class="loading-message">正在加载黑名单...</div>
      <div v-if="ipBlacklist.error" class="error-message">{{ ipBlacklist.error }}</div>

      <div v-if="!ipBlacklist.loading && !ipBlacklist.error">
        <table v-if="ipBlacklist.entries.length > 0" class="blacklist-table">
          <thead>
            <tr>
              <th>IP 地址</th>
              <th>失败次数</th>
              <th>最后尝试时间</th>
              <th>封禁截止时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in ipBlacklist.entries" :key="entry.ip">
              <td>{{ entry.ip }}</td>
              <td>{{ entry.attempts }}</td>
              <td>{{ new Date(entry.last_attempt_at * 1000).toLocaleString() }}</td>
              <td>{{ entry.blocked_until ? new Date(entry.blocked_until * 1000).toLocaleString() : 'N/A' }}</td>
              <td>
                <button
                  @click="handleDeleteIp(entry.ip)"
                  :disabled="blacklistDeleteLoading && blacklistToDeleteIp === entry.ip"
                  class="btn-danger"
                >
                  {{ (blacklistDeleteLoading && blacklistToDeleteIp === entry.ip) ? '删除中...' : '移除' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>当前没有 IP 地址在黑名单中。</p>

        <!-- 分页控件 (如果需要) -->
        <!--
        <div class="pagination" v-if="ipBlacklist.total > ipBlacklist.limit">
          <button @click="fetchIpBlacklist(ipBlacklist.currentPage - 1)" :disabled="ipBlacklist.currentPage <= 1">上一页</button>
          <span>第 {{ ipBlacklist.currentPage }} 页 / 共 {{ Math.ceil(ipBlacklist.total / ipBlacklist.limit) }} 页</span>
          <button @click="fetchIpBlacklist(ipBlacklist.currentPage + 1)" :disabled="ipBlacklist.currentPage * ipBlacklist.limit >= ipBlacklist.total">下一页</button>
        </div>
        -->
         <p v-if="blacklistDeleteError" class="error-message">{{ blacklistDeleteError }}</p>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'; // 导入 computed 和 reactive
import { useAuthStore } from '../stores/auth.store';
import { useI18n } from 'vue-i18n';
import axios from 'axios'; // 导入 axios
import { startRegistration } from '@simplewebauthn/browser'; // 导入 simplewebauthn
// import NotificationSettings from '../components/NotificationSettings.vue'; // 确认移除或根据需要取消注释

const authStore = useAuthStore();
const { t } = useI18n();

// --- Passkey 相关状态与方法 ---
const passkeyName = ref(''); // 新增 Passkey 名称 ref
const passkeyMessage = ref<string | null>(null); // 用于显示 Passkey 相关消息
const passkeyError = ref<string | null>(null); // 用于显示 Passkey 相关错误

const handleRegisterPasskey = async () => {
  passkeyMessage.value = null;
  passkeyError.value = null;

  if (!passkeyName.value) {
    passkeyError.value = t('settings.passkey.error.nameRequired'); // 使用 t()
    return;
  }

  try {
    // 1. 获取注册选项
    const optionsResponse = await axios.post('/api/v1/auth/passkey/register-options');
    const options = optionsResponse.data;

    // 2. 调用 WebAuthn API 发起注册
    let registrationResponse;
    try {
      registrationResponse = await startRegistration(options);
    } catch (error: any) {
      console.error('Passkey 注册被取消或失败:', error);
      // 根据错误类型提供更具体的提示
      if (error.name === 'NotAllowedError') {
        passkeyError.value = t('settings.passkey.error.cancelled'); // 使用 t()
      } else {
        passkeyError.value = t('settings.passkey.error.genericRegistration', { message: error.message || 'Unknown error' }); // 使用 t()
      }
      return;
    }

    // 3. 提交注册响应到后端验证
    await axios.post('/api/v1/auth/passkey/verify-registration', {
      registrationResponse,
      name: passkeyName.value // 提交 Passkey 名称
    });

    passkeyMessage.value = t('settings.passkey.success.registered'); // 使用 t()
    passkeyName.value = ''; // 清空输入框

  } catch (error: any) {
    console.error('Passkey 注册流程出错:', error);
    if (axios.isAxiosError(error) && error.response) {
      passkeyError.value = t('settings.passkey.error.verificationFailed', { message: error.response.data.message || 'Server error' }); // 使用 t()
    } else {
      passkeyError.value = t('settings.passkey.error.unknown'); // 使用 t()
    }
  }
};

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

// --- IP 黑名单状态 ---
const ipBlacklist = reactive({
    entries: [] as any[], // TODO: Define proper type
    total: 0,
    loading: false,
    error: null as string | null,
    currentPage: 1,
    limit: 10, // 每页显示数量
});
const blacklistToDeleteIp = ref<string | null>(null); // 存储待确认删除的 IP
const blacklistDeleteLoading = ref(false);
const blacklistDeleteError = ref<string | null>(null);

// --- 黑名单配置状态 ---
const blacklistSettings = reactive({
    maxLoginAttempts: '5', // 默认值
    loginBanDuration: '300', // 默认值 (秒)
    loading: false,
    message: '',
    success: false,
});


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

// --- 生命周期钩子 ---
onMounted(async () => { // 使 onMounted 异步
  await checkTwoFactorStatus(); // 等待状态检查完成
  await fetchIpWhitelist(); // 获取 IP 白名单设置
});

// --- 修改密码 ---
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

// --- IP 黑名单相关方法 ---
const fetchIpBlacklist = async (page = 1) => {
    ipBlacklist.loading = true;
    ipBlacklist.error = null;
    const offset = (page - 1) * ipBlacklist.limit;
    try {
        const data = await authStore.fetchIpBlacklist(ipBlacklist.limit, offset);
        ipBlacklist.entries = data.entries;
        ipBlacklist.total = data.total;
        ipBlacklist.currentPage = page;
    } catch (error: any) {
        ipBlacklist.error = error.message || '获取黑名单失败';
    } finally {
        ipBlacklist.loading = false;
    }
};

const handleDeleteIp = async (ip: string) => {
    blacklistToDeleteIp.value = ip; // 设置待确认的 IP
    // 可以在这里添加一个确认对话框
    if (confirm(`确定要从黑名单中移除 IP 地址 "${ip}" 吗？`)) {
        blacklistDeleteLoading.value = true;
        blacklistDeleteError.value = null;
        try {
            await authStore.deleteIpFromBlacklist(ip);
            // 成功后刷新列表
            await fetchIpBlacklist(ipBlacklist.currentPage);
        } catch (error: any) {
            blacklistDeleteError.value = error.message || '删除失败';
        } finally {
            blacklistDeleteLoading.value = false;
            blacklistToDeleteIp.value = null; // 清除待确认 IP
        }
    } else {
        blacklistToDeleteIp.value = null; // 用户取消，清除待确认 IP
    }
};

// 获取黑名单配置
const fetchBlacklistSettings = async () => {
    blacklistSettings.loading = true;
    blacklistSettings.message = '';
    try {
        const response = await axios.get<Record<string, string>>('/api/v1/settings');
        blacklistSettings.maxLoginAttempts = response.data['maxLoginAttempts'] || '5';
        blacklistSettings.loginBanDuration = response.data['loginBanDuration'] || '300';
    } catch (error: any) {
        console.error('获取黑名单配置失败:', error);
        blacklistSettings.message = '获取黑名单配置失败';
        blacklistSettings.success = false;
    } finally {
        blacklistSettings.loading = false;
    }
};

// 更新黑名单配置
const handleUpdateBlacklistSettings = async () => {
    blacklistSettings.loading = true;
    blacklistSettings.message = '';
    blacklistSettings.success = false;
    try {
        // 验证输入是否为有效数字
        const maxAttempts = parseInt(blacklistSettings.maxLoginAttempts, 10);
        const banDuration = parseInt(blacklistSettings.loginBanDuration, 10);
        if (isNaN(maxAttempts) || maxAttempts <= 0) {
            throw new Error('最大失败次数必须是正整数。');
        }
        if (isNaN(banDuration) || banDuration <= 0) {
            throw new Error('封禁时长必须是正整数（秒）。');
        }

        await axios.put('/api/v1/settings', {
            maxLoginAttempts: blacklistSettings.maxLoginAttempts,
            loginBanDuration: blacklistSettings.loginBanDuration,
        });
        blacklistSettings.message = '黑名单配置已成功更新。';
        blacklistSettings.success = true;
    } catch (error: any) {
        console.error('更新黑名单配置失败:', error);
        blacklistSettings.message = error.message || '更新黑名单配置失败';
        blacklistSettings.success = false;
    } finally {
        blacklistSettings.loading = false;
    }
};


// 在 onMounted 中调用 fetchIpBlacklist 和 fetchBlacklistSettings
onMounted(async () => { // 使 onMounted 异步
  await checkTwoFactorStatus(); // 等待状态检查完成
  await fetchIpWhitelist(); // 获取 IP 白名单设置
  await fetchIpBlacklist(); // 获取 IP 黑名单列表
  await fetchBlacklistSettings(); // 获取黑名单配置
});


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

/* Blacklist Table Styles */
.blacklist-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.blacklist-table th,
.blacklist-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.blacklist-table th {
  background-color: #f2f2f2;
  font-weight: bold;
}

.blacklist-table .btn-danger {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.blacklist-table .btn-danger:disabled {
  background-color: #f8d7da;
  cursor: not-allowed;
}

.loading-message {
    margin-top: 15px;
    color: #666;
}

/* Pagination Styles (Optional) */
.pagination {
    margin-top: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
}
.pagination button {
    margin: 0 5px;
}
.pagination span {
    margin: 0 10px;
}

/* Blacklist Settings Form Styles */
.blacklist-settings-form {
    margin-top: 15px;
}
.blacklist-settings-form .inline-group {
    display: inline-block; /* 让 label 和 input 在一行显示 */
    margin-right: 20px; /* 组之间的间距 */
    margin-bottom: 10px; /* 增加底部间距 */
}
.blacklist-settings-form .inline-group label {
    display: inline-block; /* 行内块 */
    margin-right: 5px; /* label 和 input 之间的间距 */
    width: auto; /* 覆盖默认的 block 宽度 */
    margin-bottom: 0; /* 移除默认的底部间距 */
}
.blacklist-settings-form .inline-group input[type="number"] {
    width: 80px; /* 设置一个合适的宽度 */
    display: inline-block; /* 行内块 */
    padding: 6px; /* 调整内边距 */
}
.blacklist-settings-form button {
    vertical-align: bottom; /* 对齐按钮和输入框 */
}
.blacklist-settings-form p { /* 消息样式 */
    margin-top: 10px;
}


</style>
