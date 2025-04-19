<template>
  <div class="settings-view">
    <h1>{{ $t('settings.title') }}</h1>

    <!-- General Settings Loading/Error -->
    <div v-if="settingsLoading" class="loading-message">{{ $t('common.loading') }}</div>
    <div v-if="settingsError" class="error-message">{{ settingsError }}</div>

    <div class="settings-grid">
      <!-- Column 1: Security Settings -->
      <div class="settings-column">
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

        <div class="settings-section">
          <h2>{{ $t('settings.passkey.title') }}</h2>
          <p>{{ $t('settings.passkey.description') }}</p>
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
          <!-- 2FA Content remains the same -->
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
          <div v-else>
            <p>{{ $t('settings.twoFactor.status.disabled') }}</p>
            <button v-if="!isSettingUp2FA" @click="handleSetup2FA" :disabled="twoFactorLoading">
              {{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.enable.button') }}
            </button>
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
                <button type="button" @click="cancelSetup" :disabled="twoFactorLoading" class="btn-secondary" style="margin-left: 10px;">{{ $t('common.cancel') }}</button>
              </form>
            </div>
          </div>
          <p v-if="twoFactorMessage" :class="{ 'success-message': twoFactorSuccess, 'error-message': !twoFactorSuccess }">{{ twoFactorMessage }}</p>
        </div>
      </div>

      <!-- Column 2: Interface & Network Settings -->
      <div class="settings-column">
        <div class="settings-section">
          <h2>{{ $t('settings.language.title') }}</h2>
          <form @submit.prevent="handleUpdateLanguage">
            <div class="form-group">
              <label for="languageSelect">{{ $t('settings.language.selectLabel') }}</label>
              <select id="languageSelect" v-model="selectedLanguage">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <button type="submit" :disabled="languageLoading">{{ languageLoading ? $t('common.saving') : $t('settings.language.saveButton') }}</button>
            <p v-if="languageMessage" :class="{ 'success-message': languageSuccess, 'error-message': !languageSuccess }">{{ languageMessage }}</p>
          </form>
        </div>

        <div class="settings-section">
          <h2>{{ $t('settings.appearance.title') }}</h2>
          <p>{{ $t('settings.appearance.description') }}</p>
          <button @click="openStyleCustomizer">{{ t('settings.appearance.customizeButton') }}</button>
        </div>

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

        <div class="settings-section">
          <h2>{{ $t('settings.ipWhitelist.title') }}</h2>
          <p>{{ $t('settings.ipWhitelist.description') }}</p>
          <form @submit.prevent="handleUpdateIpWhitelist">
            <div class="form-group">
              <label for="ipWhitelist">{{ $t('settings.ipWhitelist.label') }}</label>
              <textarea id="ipWhitelist" v-model="ipWhitelistInput" rows="4"></textarea> <!-- Reduced rows -->
              <small>{{ $t('settings.ipWhitelist.hint') }}</small>
            </div>
            <button type="submit" :disabled="ipWhitelistLoading">{{ ipWhitelistLoading ? $t('common.saving') : $t('settings.ipWhitelist.saveButton') }}</button>
            <p v-if="ipWhitelistMessage" :class="{ 'success-message': ipWhitelistSuccess, 'error-message': !ipWhitelistSuccess }">{{ ipWhitelistMessage }}</p>
          </form>
        </div>
      </div>

      <!-- Column 3: IP Blacklist (Spans across columns if needed, or stays in its own area) -->
      <div class="settings-section settings-section-full-width">
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

        <hr class="section-divider">

        <h3>当前已封禁的 IP 地址</h3>
        <div v-if="ipBlacklist.loading" class="loading-message">正在加载黑名单...</div>
        <div v-if="ipBlacklist.error" class="error-message">{{ ipBlacklist.error }}</div>

        <div v-if="!ipBlacklist.loading && !ipBlacklist.error" class="table-container">
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
                    class="btn-danger btn-small"
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
    </div> <!-- End of settings-grid -->
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

  // 始终将本地布尔状态与 store 的布尔 getter 同步
  popupEditorEnabled.value = showPopupFileEditorBoolean.value;
  shareTabsEnabled.value = shareFileEditorTabsBoolean.value;

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
  padding: var(--base-padding);
  color: var(--text-color);
  background-color: var(--app-bg-color);
  max-width: 1200px; /* 限制最大宽度 */
  margin: 0 auto; /* 居中 */
}

h1 {
  margin-bottom: calc(var(--base-margin) * 2); /* 减小标题下边距 */
  padding-bottom: var(--base-margin);
  border-bottom: 1px solid var(--border-color);
  font-size: 1.8rem; /* 稍大标题 */
  color: var(--text-color);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); /* 响应式网格布局 */
  gap: calc(var(--base-margin) * 2); /* 网格间距 */
}

.settings-column {
  display: flex;
  flex-direction: column;
  gap: calc(var(--base-margin) * 2); /* 列内项目间距 */
}

.settings-section {
  /* margin-bottom: calc(var(--base-margin) * 2); 移除独立下边距，由 grid gap 控制 */
  padding: calc(var(--base-padding) * 1.2); /* 调整内边距 */
  border: 1px solid var(--border-color);
  border-radius: 8px; /* 更圆润的边角 */
  background-color: var(--content-bg-color, var(--app-bg-color)); /* 使用内容背景色，回退到应用背景色 */
  box-shadow: 0 2px 5px rgba(0,0,0,0.05); /* 添加细微阴影 */
  display: flex; /* 使 section 内部元素可以更好地控制 */
  flex-direction: column; /* 默认垂直排列 */
  height: 100%; /* 让 section 填充 grid 单元格高度 */
}

.settings-section-full-width {
  grid-column: 1 / -1; /* 让黑名单部分横跨所有列 */
}

.settings-section h2 {
  font-size: 1.2rem; /* 调整标题大小 */
  color: var(--text-color);
  margin-top: 0;
  margin-bottom: var(--base-margin); /* 减小标题下边距 */
  padding-bottom: calc(var(--base-margin) * 0.75);
  border-bottom: 1px solid var(--border-color-light, var(--border-color)); /* 使用更浅的边框色 */
}

.settings-section p:not([class*="-message"]) {
    color: var(--text-color-secondary);
    line-height: 1.6;
    margin-bottom: var(--base-margin);
    font-size: 0.95rem; /* 调整段落字体大小 */
}
.setting-description {
    font-size: 0.85em; /* 调整描述字体大小 */
    color: var(--text-color-secondary);
    margin-bottom: var(--base-margin);
}

.form-group {
  margin-bottom: var(--base-margin); /* 减小表单组间距 */
}

label {
  display: block;
  margin-bottom: calc(var(--base-margin) / 3); /* 减小标签下边距 */
  font-weight: 600; /* 稍粗字体 */
  color: var(--text-color);
  font-size: 0.9rem; /* 调整标签字体大小 */
}

input[type="password"],
input[type="text"],
input[type="number"],
textarea,
select {
  width: 100%;
  padding: 0.5rem 0.7rem; /* 调整内边距 */
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 5px; /* 调整圆角 */
  font-family: var(--font-family-sans-serif);
  font-size: 0.95rem; /* 调整输入框字体大小 */
  color: var(--text-color);
  background-color: var(--input-bg-color, var(--app-bg-color)); /* 输入框背景色 */
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
input:focus, textarea:focus, select:focus {
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(var(--rgb-link-active-color, 0, 123, 255), 0.2); /* 使用变量颜色 */
}

textarea {
    resize: vertical;
    min-height: 80px; /* 减小最小高度 */
}

small {
    display: block;
    margin-top: calc(var(--base-margin) / 3);
    font-size: 0.8em; /* 调整提示字体大小 */
    color: var(--text-color-secondary);
}

button, .btn {
  padding: 0.5rem 1rem; /* 调整按钮内边距 */
  cursor: pointer;
  background-color: var(--button-bg-color);
  color: var(--button-text-color);
  border: 1px solid transparent; /* 默认透明边框 */
  border-radius: 5px; /* 调整圆角 */
  font-weight: 600; /* 稍粗字体 */
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
  margin-right: calc(var(--base-margin) / 2); /* 减小按钮间距 */
  font-size: 0.95rem; /* 调整按钮字体大小 */
  line-height: 1.5; /* 确保文字垂直居中 */
}
button:last-of-type, .btn:last-of-type {
    margin-right: 0;
}

button:hover:not(:disabled), .btn:hover:not(:disabled) {
  background-color: var(--button-hover-bg-color);
  border-color: var(--button-hover-bg-color);
  transform: translateY(-1px); /* 轻微上移效果 */
}
button:active:not(:disabled), .btn:active:not(:disabled) {
    transform: translateY(0px); /* 按下时复原 */
}

button:disabled, .btn:disabled {
  cursor: not-allowed;
  opacity: 0.65; /* 调整禁用透明度 */
}

/* 次要按钮样式 */
.btn-secondary {
    background-color: var(--secondary-button-bg-color, var(--header-bg-color));
    color: var(--secondary-button-text-color, var(--text-color));
    border: 1px solid var(--border-color);
}
.btn-secondary:hover:not(:disabled) {
    background-color: var(--secondary-button-hover-bg-color, var(--border-color));
    border-color: var(--border-color);
}

/* 危险按钮样式 (用于移除黑名单) */
.btn-danger {
  background-color: var(--danger-color, #dc3545);
  color: white;
  border-color: transparent;
}
.btn-danger:hover:not(:disabled) {
  background-color: var(--danger-hover-color, #bb2d3b);
  border-color: transparent;
}
.btn-danger:disabled {
  background-color: var(--danger-color, #dc3545);
  opacity: 0.65;
}
.btn-small { /* 小按钮 */
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
}


hr.section-divider { /* 区域内分隔线 */
    border: none;
    border-top: 1px dashed var(--border-color-light, var(--border-color));
    margin: var(--base-margin) 0;
}

code {
    background-color: var(--code-bg-color, var(--header-bg-color));
    padding: 0.2em 0.5em;
    border-radius: 4px;
    color: var(--code-text-color, var(--text-color));
    font-family: var(--font-family-monospace);
    font-size: 0.9em;
    border: 1px solid var(--border-color-light, var(--border-color));
}

img { /* 二维码图片 */
    display: block;
    margin: var(--base-margin) auto;
    max-width: 180px; /* 调整大小 */
    border: 1px solid var(--border-color);
    padding: 4px;
    background-color: white;
    border-radius: 4px;
}

/* 消息提示样式优化 */
.success-message, .error-message {
  padding: 0.8rem 1rem; /* 调整内边距 */
  border-radius: 5px;
  margin-top: var(--base-margin);
  font-size: 0.9rem;
  border-left-width: 4px; /* 左侧加粗边框 */
}
.success-message {
  color: #0f5132;
  background-color: #d1e7dd;
  border-color: #badbcc;
  border-left-color: #0f5132;
}
.error-message {
  color: #842029;
  background-color: #f8d7da;
  border-color: #f5c2c7;
  border-left-color: #842029;
}
.loading-message {
    margin-top: var(--base-margin);
    color: var(--text-color-secondary);
    font-style: italic;
    font-size: 0.9rem;
}

/* 黑名单表格样式优化 */
.table-container {
    overflow-x: auto; /* 允许水平滚动 */
    margin-top: var(--base-margin);
}
.blacklist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem; /* 调整表格字体 */
  white-space: nowrap; /* 防止单元格内容换行 */
}

.blacklist-table th,
.blacklist-table td {
  border: 1px solid var(--border-color-light, var(--border-color));
  padding: 0.6rem 0.8rem; /* 调整单元格内边距 */
  text-align: left;
  vertical-align: middle;
}

.blacklist-table th {
  background-color: var(--table-header-bg-color, var(--header-bg-color));
  font-weight: 600;
  color: var(--table-header-text-color, var(--text-color));
}

.blacklist-table tr:nth-child(even) {
    background-color: var(--table-stripe-bg-color, var(--header-bg-color));
}
.blacklist-table tr:hover {
    background-color: var(--table-hover-bg-color, rgba(0,0,0,0.03)); /* 悬停高亮 */
}

/* 复选框组样式优化 */
.form-group-checkbox {
  display: flex;
  align-items: center;
  margin-bottom: var(--base-margin);
  cursor: pointer; /* 让整个区域可点击 */
}
.form-group-checkbox input[type="checkbox"] {
  width: 1.2em; /* 增大复选框 */
  height: 1.2em;
  margin-right: 0.7rem;
  flex-shrink: 0;
  appearance: none;
  background-color: var(--input-bg-color, var(--app-bg-color));
  border: 1px solid var(--border-color);
  border-radius: 4px; /* 调整圆角 */
  cursor: pointer;
  position: relative;
  top: 0; /* 移除微调 */
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.form-group-checkbox input[type="checkbox"]:checked {
    background-color: var(--button-bg-color);
    border-color: var(--button-bg-color);
}
.form-group-checkbox input[type="checkbox"]:checked::after {
    content: '✔';
    position: absolute;
    color: var(--button-text-color);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.85em; /* 调整勾选标记大小 */
    font-weight: bold;
}
.form-group-checkbox input[type="checkbox"]:focus {
    box-shadow: 0 0 0 3px rgba(var(--rgb-link-active-color, 0, 123, 255), 0.2);
}
.form-group-checkbox label {
  display: inline-block;
  margin-bottom: 0;
  cursor: pointer;
  font-weight: normal;
  font-size: 0.95rem; /* 调整标签字体 */
  user-select: none; /* 防止选中文字 */
}

/* 黑名单配置表单样式优化 */
.blacklist-settings-form {
    margin-top: var(--base-margin);
    padding-top: var(--base-margin);
    border-top: 1px dashed var(--border-color-light, var(--border-color));
    display: flex; /* 使用 Flex 布局 */
    flex-wrap: wrap; /* 允许换行 */
    align-items: flex-end; /* 底部对齐 */
    gap: var(--base-margin); /* 项目间距 */
}
.blacklist-settings-form .inline-group {
    display: flex;
    flex-direction: column; /* 垂直排列标签和输入框 */
    margin: 0; /* 移除独立 margin */
}
.blacklist-settings-form .inline-group label {
    margin-bottom: calc(var(--base-margin) / 4); /* 减小小间距 */
    white-space: nowrap;
}
.blacklist-settings-form .inline-group input[type="number"] {
    width: 100px; /* 调整宽度 */
    padding: 0.4rem 0.6rem; /* 调整内边距 */
}
.blacklist-settings-form button {
    margin-left: auto; /* 将按钮推到右侧（如果空间允许） */
    align-self: flex-end; /* 确保按钮在底部 */
}
.blacklist-settings-form p { /* 消息提示 */
    margin-top: 0; /* 移除顶部间距 */
    width: 100%; /* 占满整行 */
    order: 3; /* 确保消息在最后 */
}

/* 响应式调整 */
@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr; /* 在较小屏幕上变为单列 */
  }
  .blacklist-settings-form {
      flex-direction: column; /* 强制垂直排列 */
      align-items: stretch; /* 拉伸项目 */
  }
  .blacklist-settings-form button {
      margin-left: 0; /* 移除左外边距 */
      width: 100%; /* 按钮占满宽度 */
      margin-top: var(--base-margin); /* 添加顶部间距 */
  }
}

</style>
