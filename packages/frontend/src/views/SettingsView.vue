<template>
  <div class="settings-view">
    <h1>{{ $t('settings.title') }}</h1>

    <!-- General Settings Loading/Error -->
    <div v-if="settingsLoading" class="loading-message">{{ $t('common.loading') }}</div>
    <div v-if="settingsError" class="error-message">{{ settingsError }}</div>

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

    <!-- 语言设置 -->
    <div class="settings-section">
      <h2>{{ $t('settings.language.title') }}</h2>
      <form @submit.prevent="handleUpdateLanguage">
        <div class="form-group">
          <label for="languageSelect">{{ $t('settings.language.selectLabel') }}</label>
          <select id="languageSelect" v-model="selectedLanguage" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <button type="submit" :disabled="languageLoading">{{ languageLoading ? $t('common.saving') : $t('settings.language.saveButton') }}</button>
        <p v-if="languageMessage" :class="{ 'success-message': languageSuccess, 'error-message': !languageSuccess }">{{ languageMessage }}</p>
      </form>
    </div>

    <!-- 弹窗编辑器设置 -->
    <div class="settings-section">
      <h2>{{ $t('settings.popupEditor.title') }}</h2>
      <form @submit.prevent="handleUpdatePopupEditorSetting">
          <div class="form-group form-group-checkbox">
              <input type="checkbox" id="showPopupEditor" v-model="popupEditorEnabled">
              <label for="showPopupEditor">{{ $t('settings.popupEditor.enableLabel') }}</label>
          </div>
          <button type="submit" :disabled="popupEditorLoading">{{ popupEditorLoading ? $t('common.saving') : $t('settings.popupEditor.saveButton') }}</button>
          <p v-if="popupEditorMessage" :class="{ 'success-message': popupEditorSuccess, 'error-message': !popupEditorSuccess }">{{ popupEditorMessage }}</p>
      </form>
    </div>

    <!-- 共享编辑器标签页设置 -->
    <div class="settings-section">
      <h2>{{ $t('settings.shareEditorTabs.title') }}</h2>
      <form @submit.prevent="handleUpdateShareTabsSetting">
          <div class="form-group form-group-checkbox">
              <input type="checkbox" id="shareEditorTabs" v-model="shareTabsEnabled">
              <label for="shareEditorTabs">{{ $t('settings.shareEditorTabs.enableLabel') }}</label>
          </div>
          <p class="setting-description">{{ $t('settings.shareEditorTabs.description') }}</p>
          <button type="submit" :disabled="shareTabsLoading">{{ shareTabsLoading ? $t('common.saving') : $t('settings.shareEditorTabs.saveButton') }}</button>
          <p v-if="shareTabsMessage" :class="{ 'success-message': shareTabsSuccess, 'error-message': !shareTabsSuccess }">{{ shareTabsMessage }}</p>
      </form>
    </div>


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
        <button type="submit" :disabled="ipWhitelistLoading">{{ ipWhitelistLoading ? $t('common.saving') : $t('settings.ipWhitelist.saveButton') }}</button>
        <p v-if="ipWhitelistMessage" :class="{ 'success-message': ipWhitelistSuccess, 'error-message': !ipWhitelistSuccess }">{{ ipWhitelistMessage }}</p>
      </form>
    </div>

    <!-- 外观设置 -->
    <div class="settings-section">
        <h2>{{ $t('settings.appearance.title') }}</h2>
        <p>{{ $t('settings.appearance.description') }}</p>
        <button @click="openStyleCustomizer">{{ t('settings.appearance.customizeButton') }}</button>
    </div>


    <hr>

     <div class="settings-section">
      <h2>IP 黑名单管理</h2>
      <p>配置登录失败次数限制和自动封禁时长。本地地址 (127.0.0.1, ::1) 不会被封禁。</p>

      <!-- 黑名单配置表单 -->
      <form @submit.prevent="handleUpdateBlacklistSettings" class="blacklist-settings-form">
         <div class="form-group inline-group">
           <label for="maxLoginAttempts">最大失败次数:</label>
           <input type="number" id="maxLoginAttempts" v-model="blacklistSettingsForm.maxLoginAttempts" min="1" required>
         </div>
         <div class="form-group inline-group">
           <label for="loginBanDuration">封禁时长 (秒):</label>
           <input type="number" id="loginBanDuration" v-model="blacklistSettingsForm.loginBanDuration" min="1" required>
         </div>
         <button type="submit" :disabled="blacklistSettingsLoading">{{ blacklistSettingsLoading ? $t('common.saving') : '保存配置' }}</button>
         <p v-if="blacklistSettingsMessage" :class="{ 'success-message': blacklistSettingsSuccess, 'error-message': !blacklistSettingsSuccess }">{{ blacklistSettingsMessage }}</p>
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
         <p v-if="blacklistDeleteError" class="error-message">{{ blacklistDeleteError }}</p>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'; // 移除 toRefs
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { useAppearanceStore } from '../stores/appearance.store'; // 导入外观 store
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
// setLocale is handled by the store now
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const appearanceStore = useAppearanceStore(); // 实例化外观 store
const { t } = useI18n();

// --- Reactive state from store ---
// 使用 storeToRefs 获取响应式 getter
const { settings, isLoading: settingsLoading, error: settingsError, showPopupFileEditorBoolean, shareFileEditorTabsBoolean } = storeToRefs(settingsStore);

// --- Local state for forms ---
const ipWhitelistInput = ref('');
const selectedLanguage = ref<'en' | 'zh'>('en'); // Default to 'en', will be updated by watcher
const blacklistSettingsForm = reactive({ // Renamed to avoid conflict with store state name
    maxLoginAttempts: '5',
    loginBanDuration: '300',
});
const popupEditorEnabled = ref(true); // 本地状态，用于 v-model

// --- Local UI feedback state ---
const ipWhitelistLoading = ref(false);
const ipWhitelistMessage = ref('');
const ipWhitelistSuccess = ref(false);
const languageLoading = ref(false);
const languageMessage = ref('');
const languageSuccess = ref(false);
const blacklistSettingsLoading = ref(false);
const blacklistSettingsMessage = ref('');
const blacklistSettingsSuccess = ref(false);
const popupEditorLoading = ref(false);
const popupEditorMessage = ref('');
const popupEditorSuccess = ref(false);
const shareTabsEnabled = ref(true); // 本地状态，用于共享标签页 v-model
const shareTabsLoading = ref(false);
const shareTabsMessage = ref('');
const shareTabsSuccess = ref(false);

// --- Watcher to sync local form state with store state ---
watch(settings, (newSettings, oldSettings) => {
  // Initialize only if settings were previously null or undefined
  const isInitialLoad = !oldSettings;

  ipWhitelistInput.value = newSettings.ipWhitelist || '';
  selectedLanguage.value = newSettings.language || 'en';
  blacklistSettingsForm.maxLoginAttempts = newSettings.maxLoginAttempts || '5';
  blacklistSettingsForm.loginBanDuration = newSettings.loginBanDuration || '300';

  // Initialize local state only on initial load or if store changes externally
  if (isInitialLoad || newSettings.showPopupFileEditor !== oldSettings?.showPopupFileEditor) {
      popupEditorEnabled.value = showPopupFileEditorBoolean.value;
  }
  if (isInitialLoad || newSettings.shareFileEditorTabs !== oldSettings?.shareFileEditorTabs) {
      shareTabsEnabled.value = shareFileEditorTabsBoolean.value;
  }

}, { deep: true, immediate: true }); // immediate: true to run on initial load

// --- Popup Editor setting method ---
const handleUpdatePopupEditorSetting = async () => {
    popupEditorLoading.value = true;
    popupEditorMessage.value = '';
    popupEditorSuccess.value = false;
    try {
        // 将布尔值转换为字符串 'true' 或 'false' 来存储
        const valueToSave = popupEditorEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('showPopupFileEditor', valueToSave);
        popupEditorMessage.value = t('settings.popupEditor.success.saved'); // 需要添加翻译
        popupEditorSuccess.value = true;
    } catch (error: any) {
        console.error('更新弹窗编辑器设置失败:', error);
        popupEditorMessage.value = error.message || t('settings.popupEditor.error.saveFailed'); // 需要添加翻译
        popupEditorSuccess.value = false;
        // 保存失败时，不需要手动恢复，v-model 应该保持用户最后的操作状态
        // popupEditorEnabled.value = showPopupFileEditorBoolean.value; // <-- 移除恢复逻辑
    } finally {
        popupEditorLoading.value = false;
    }
};

// --- Share Editor Tabs setting method ---
const handleUpdateShareTabsSetting = async () => {
    shareTabsLoading.value = true;
    shareTabsMessage.value = '';
    shareTabsSuccess.value = false;
    try {
        const valueToSave = shareTabsEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('shareFileEditorTabs', valueToSave);
        shareTabsMessage.value = t('settings.shareEditorTabs.success.saved'); // 需要添加翻译
        shareTabsSuccess.value = true;
    } catch (error: any) {
        console.error('更新共享编辑器标签页设置失败:', error);
        shareTabsMessage.value = error.message || t('settings.shareEditorTabs.error.saveFailed'); // 需要添加翻译
        shareTabsSuccess.value = false;
        // 保存失败时，不需要手动恢复
        // shareTabsEnabled.value = shareFileEditorTabsBoolean.value; // <-- 移除恢复逻辑
    } finally {
        shareTabsLoading.value = false;
    }
};

// --- 外观设置 ---
const openStyleCustomizer = () => {
    appearanceStore.toggleStyleCustomizer(true);
};

// --- Passkey state & methods --- (Keep as is)
const passkeyName = ref('');
const passkeyMessage = ref<string | null>(null);
const passkeyError = ref<string | null>(null);
const handleRegisterPasskey = async () => {
  passkeyMessage.value = null;
  passkeyError.value = null;
  if (!passkeyName.value) {
    passkeyError.value = t('settings.passkey.error.nameRequired');
    return;
  }
  try {
    const optionsResponse = await axios.post('/api/v1/auth/passkey/register-options');
    const options = optionsResponse.data;
    let registrationResponse = await startRegistration(options);
    await axios.post('/api/v1/auth/passkey/verify-registration', { registrationResponse, name: passkeyName.value });
    passkeyMessage.value = t('settings.passkey.success.registered');
    passkeyName.value = '';
  } catch (error: any) {
    console.error('Passkey 注册流程出错:', error);
    if (error.name === 'NotAllowedError') {
        passkeyError.value = t('settings.passkey.error.cancelled');
    } else if (axios.isAxiosError(error) && error.response) {
      passkeyError.value = t('settings.passkey.error.verificationFailed', { message: error.response.data.message || 'Server error' });
    } else {
       passkeyError.value = t('settings.passkey.error.genericRegistration', { message: error.message || t('settings.passkey.error.unknown') });
    }
  }
};

// --- Change Password state & methods --- (Keep as is)
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changePasswordLoading = ref(false);
const changePasswordMessage = ref('');
const changePasswordSuccess = ref(false);
const handleChangePassword = async () => {
  changePasswordMessage.value = '';
  changePasswordSuccess.value = false;
  if (newPassword.value !== confirmPassword.value) {
    changePasswordMessage.value = t('settings.changePassword.error.passwordsDoNotMatch');
    return;
  }
  changePasswordLoading.value = true;
  try {
    await authStore.changePassword(currentPassword.value, newPassword.value);
    changePasswordMessage.value = t('settings.changePassword.success');
    changePasswordSuccess.value = true;
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

// --- 2FA state & methods --- (Keep as is)
const twoFactorEnabled = ref(false);
const twoFactorLoading = ref(false);
const twoFactorMessage = ref('');
const twoFactorSuccess = ref(false);
const setupData = ref<{ secret: string; qrCodeUrl: string } | null>(null);
const verificationCode = ref('');
const disablePassword = ref('');
const isSettingUp2FA = computed(() => setupData.value !== null);
const checkTwoFactorStatus = async () => {
  await authStore.checkAuthStatus();
  twoFactorEnabled.value = authStore.user?.isTwoFactorEnabled ?? false;
};
const handleSetup2FA = async () => {
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  setupData.value = null; verificationCode.value = '';
  try {
    const response = await axios.post<{ secret: string; qrCodeUrl: string }>('/api/v1/auth/2fa/setup');
    setupData.value = response.data;
  } catch (error: any) {
    console.error('开始设置 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.setupFailed');
  } finally { twoFactorLoading.value = false; }
};
const handleVerifyAndActivate2FA = async () => {
  if (!setupData.value || !verificationCode.value) {
    twoFactorMessage.value = t('settings.twoFactor.error.codeRequired'); return;
  }
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  try {
    await axios.post('/api/v1/auth/2fa/verify', { token: verificationCode.value });
    twoFactorMessage.value = t('settings.twoFactor.success.activated');
    twoFactorSuccess.value = true; twoFactorEnabled.value = true;
    setupData.value = null; verificationCode.value = '';
  } catch (error: any) {
    console.error('验证并激活 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.verificationFailed');
  } finally { twoFactorLoading.value = false; }
};
const handleDisable2FA = async () => {
  if (!disablePassword.value) {
    twoFactorMessage.value = t('settings.twoFactor.error.passwordRequiredForDisable'); return;
  }
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  try {
    await axios.delete('/api/v1/auth/2fa', { data: { password: disablePassword.value } });
    twoFactorMessage.value = t('settings.twoFactor.success.disabled');
    twoFactorSuccess.value = true; twoFactorEnabled.value = false;
    disablePassword.value = '';
  } catch (error: any) {
    console.error('禁用 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.disableFailed');
  } finally { twoFactorLoading.value = false; }
};
const cancelSetup = () => {
    setupData.value = null; verificationCode.value = ''; twoFactorMessage.value = '';
};

// --- Language settings method --- (Refactored)
const handleUpdateLanguage = async () => {
    languageLoading.value = true;
    languageMessage.value = '';
    languageSuccess.value = false;
    try {
        await settingsStore.updateSetting('language', selectedLanguage.value);
        languageMessage.value = t('settings.language.success.saved');
        languageSuccess.value = true;
    } catch (error: any) {
        console.error('更新语言设置失败:', error);
        languageMessage.value = error.message || t('settings.language.error.saveFailed');
        languageSuccess.value = false;
    } finally {
        languageLoading.value = false;
    }
};

// --- IP Whitelist method --- (Refactored)
const handleUpdateIpWhitelist = async () => {
    ipWhitelistLoading.value = true;
    ipWhitelistMessage.value = '';
    ipWhitelistSuccess.value = false;
    try {
        await settingsStore.updateSetting('ipWhitelist', ipWhitelistInput.value.trim());
        ipWhitelistMessage.value = t('settings.ipWhitelist.success.saved');
        ipWhitelistSuccess.value = true;
    } catch (error: any) {
        console.error('更新 IP 白名单失败:', error);
        ipWhitelistMessage.value = error.message || t('settings.ipWhitelist.error.saveFailed');
        ipWhitelistSuccess.value = false;
    } finally {
        ipWhitelistLoading.value = false;
    }
};

// --- IP Blacklist state & methods --- (Keep fetch/delete as is, update uses store)
const ipBlacklist = reactive({
    entries: [] as any[],
    total: 0,
    loading: false,
    error: null as string | null,
    currentPage: 1,
    limit: 10,
});
const blacklistToDeleteIp = ref<string | null>(null);
const blacklistDeleteLoading = ref(false);
const blacklistDeleteError = ref<string | null>(null);

const fetchIpBlacklist = async (page = 1) => {
    ipBlacklist.loading = true;
    ipBlacklist.error = null;
    const offset = (page - 1) * ipBlacklist.limit;
    try {
        // Assuming fetchIpBlacklist is still needed from authStore
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
    blacklistToDeleteIp.value = ip;
    if (confirm(`确定要从黑名单中移除 IP 地址 "${ip}" 吗？`)) {
        blacklistDeleteLoading.value = true;
        blacklistDeleteError.value = null;
        try {
            // Assuming deleteIpFromBlacklist is still needed from authStore
            await authStore.deleteIpFromBlacklist(ip);
            await fetchIpBlacklist(ipBlacklist.currentPage);
        } catch (error: any) {
            blacklistDeleteError.value = error.message || '删除失败';
        } finally {
            blacklistDeleteLoading.value = false;
            blacklistToDeleteIp.value = null;
        }
    } else {
        blacklistToDeleteIp.value = null;
    }
};

// Update Blacklist Config method (Refactored)
const handleUpdateBlacklistSettings = async () => {
    blacklistSettingsLoading.value = true;
    blacklistSettingsMessage.value = '';
    blacklistSettingsSuccess.value = false;
    try {
        const maxAttempts = parseInt(blacklistSettingsForm.maxLoginAttempts, 10);
        const banDuration = parseInt(blacklistSettingsForm.loginBanDuration, 10);
        if (isNaN(maxAttempts) || maxAttempts <= 0) {
            throw new Error('最大失败次数必须是正整数。');
        }
        if (isNaN(banDuration) || banDuration <= 0) {
            throw new Error('封禁时长必须是正整数（秒）。');
        }
        await settingsStore.updateMultipleSettings({
            maxLoginAttempts: blacklistSettingsForm.maxLoginAttempts,
            loginBanDuration: blacklistSettingsForm.loginBanDuration,
        });
        blacklistSettingsMessage.value = '黑名单配置已成功更新。';
        blacklistSettingsSuccess.value = true;
    } catch (error: any) {
        console.error('更新黑名单配置失败:', error);
        blacklistSettingsMessage.value = error.message || '更新黑名单配置失败';
        blacklistSettingsSuccess.value = false;
    } finally {
        blacklistSettingsLoading.value = false;
    }
};

// --- Lifecycle Hooks ---
onMounted(async () => {
  await checkTwoFactorStatus(); // Check 2FA status
  await fetchIpBlacklist(); // Fetch current blacklist entries
  // Initial settings (including language, whitelist, blacklist config) are loaded in main.ts via settingsStore.loadInitialSettings()
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
textarea,
select { /* Add select style */
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
}

textarea {
    resize: vertical;
    min-height: 80px;
}

small {
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
    max-width: 200px;
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

/* 复选框组样式 */
.form-group-checkbox {
  display: flex;
  align-items: center;
}

.form-group-checkbox input[type="checkbox"] {
  width: auto; /* 不要占满宽度 */
  margin-right: 10px;
}

.form-group-checkbox label {
  display: inline-block; /* 让标签和复选框在同一行 */
  margin-bottom: 0; /* 移除默认的块级标签下边距 */
  cursor: pointer;
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
    display: inline-block;
    margin-right: 20px;
    margin-bottom: 10px;
}
.blacklist-settings-form .inline-group label {
    display: inline-block;
    margin-right: 5px;
    width: auto;
    margin-bottom: 0;
}
.blacklist-settings-form .inline-group input[type="number"] {
    width: 80px;
    display: inline-block;
    padding: 6px;
}
.blacklist-settings-form button {
    vertical-align: bottom;
}
.blacklist-settings-form p {
    margin-top: 10px;
}


</style>
