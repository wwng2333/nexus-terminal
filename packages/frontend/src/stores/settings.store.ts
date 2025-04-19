import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed } from 'vue'; // 移除 watch
import i18n, { setLocale, defaultLng } from '../i18n'; // Import i18n instance and setLocale
// 移除 ITheme 和默认主题定义，这些移到 appearance.store.ts

// 定义通用设置状态类型
interface SettingsState {
  language?: 'en' | 'zh'; // 语言现在是可选的，因为可能在 appearance store 中处理
  ipWhitelist?: string;
  maxLoginAttempts?: string;
  loginBanDuration?: string;
  showPopupFileEditor?: string; // 'true' or 'false'
  shareFileEditorTabs?: string; // 'true' or 'false'
  ipWhitelistEnabled?: string; // 添加 IP 白名单启用状态 'true' or 'false'
  // Add other general settings keys here as needed
  [key: string]: string | undefined; // Allow other string settings
}


export const useSettingsStore = defineStore('settings', () => {
  // --- State ---
  const settings = ref<Partial<SettingsState>>({}); // 通用设置状态
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  // 移除外观相关状态: isStyleCustomizerVisible, currentUiTheme, currentXtermTheme

  // --- Actions ---

  /**
   * Fetches general settings from the backend and updates the store state.
   * Also sets the i18n locale based on the fetched language setting.
   */
  async function loadInitialSettings() {
    isLoading.value = true;
    error.value = null;
    let fetchedLang: 'en' | 'zh' | undefined;

    try {
      console.log('[SettingsStore] 加载通用设置...');
      const response = await axios.get<Record<string, string>>('/api/v1/settings');
      settings.value = response.data; // Store fetched general settings
      console.log('[SettingsStore] 通用设置已加载:', settings.value);

      // --- 设置默认值 (如果后端未返回) ---
      if (settings.value.showPopupFileEditor === undefined) {
          settings.value.showPopupFileEditor = 'true';
      }
      if (settings.value.shareFileEditorTabs === undefined) {
          settings.value.shareFileEditorTabs = 'true';
      }
      if (settings.value.ipWhitelistEnabled === undefined) {
          settings.value.ipWhitelistEnabled = 'false'; // 默认禁用 IP 白名单
      }
      if (settings.value.maxLoginAttempts === undefined) {
          settings.value.maxLoginAttempts = '5'; // 默认 5 次
      }
       if (settings.value.loginBanDuration === undefined) {
          settings.value.loginBanDuration = '300'; // 默认 300 秒
      }


      // --- 语言设置 ---
      const langFromSettings = settings.value.language;
      if (langFromSettings === 'en' || langFromSettings === 'zh') {
        fetchedLang = langFromSettings;
      } else {
        const navigatorLang = navigator.language?.split('-')[0];
        fetchedLang = navigatorLang === 'zh' ? 'zh' : defaultLng;
        console.warn(`[SettingsStore] 语言设置无效 ('${langFromSettings}'), 回退到 '${fetchedLang}'.`);
        // Optionally save the fallback language back
        // await updateSetting('language', fetchedLang);
      }

      if (fetchedLang) {
        console.log(`[SettingsStore] 设置语言: ${fetchedLang}`);
        setLocale(fetchedLang);
      } else {
        console.error('[SettingsStore] 无法确定有效语言。');
        setLocale(defaultLng);
      }

    } catch (err: any) {
      console.error('加载通用设置失败:', err);
      error.value = err.response?.data?.message || err.message || '加载设置失败';
      // 出错时（例如未登录），根据浏览器语言设置回退语言
      const navigatorLang = navigator.language?.split('-')[0];
      const fallbackLang = navigatorLang === 'zh' ? 'zh' : defaultLng;
      setLocale(fallbackLang);
    } finally {
      isLoading.value = false;
    }
  }

  // 移除外观相关函数: loadAndApplyThemesFromSettings, applyUiTheme, saveCustomThemes, resetCustomThemes, toggleStyleCustomizer

  /**
   * Updates a single general setting value both locally and on the backend.
   * @param key The setting key to update.
   * @param value The new value for the setting.
   */
  async function updateSetting(key: keyof SettingsState, value: string) {
    // 移除外观相关的键检查
    const allowedKeys: Array<keyof SettingsState> = [
        'language', 'ipWhitelist', 'maxLoginAttempts', 'loginBanDuration',
        'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled'
    ];
    if (!allowedKeys.includes(key)) {
        console.error(`[SettingsStore] 尝试更新不允许的设置键: ${key}`);
        throw new Error(`不允许更新设置项 '${key}'`);
    }

    try {
      // 注意：后端 controller 现在会过滤，但前端也做一层检查更好
      await axios.put('/api/v1/settings', { [key]: value });
      // Update store state *after* successful API call
      settings.value = { ...settings.value, [key]: value };

      // If updating language, also update i18n
      if (key === 'language' && (value === 'en' || value === 'zh')) {
        setLocale(value);
      }
    } catch (err: any) {
      console.error(`更新设置项 '${key}' 失败:`, err);
      throw new Error(err.response?.data?.message || err.message || `更新设置项 '${key}' 失败`);
    }
  }

    /**
   * Updates multiple general settings values both locally and on the backend.
   * @param updates An object containing key-value pairs of settings to update.
   */
  async function updateMultipleSettings(updates: Partial<SettingsState>) {
     // 移除外观相关的键检查
    const allowedKeys: Array<keyof SettingsState> = [
        'language', 'ipWhitelist', 'maxLoginAttempts', 'loginBanDuration',
        'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled'
    ];
    const filteredUpdates: Partial<SettingsState> = {};
    let languageUpdate: 'en' | 'zh' | undefined = undefined;

    for (const key in updates) {
        if (allowedKeys.includes(key as keyof SettingsState)) {
            filteredUpdates[key as keyof SettingsState] = updates[key];
            if (key === 'language' && (updates[key] === 'en' || updates[key] === 'zh')) {
                languageUpdate = updates[key] as 'en' | 'zh';
            }
        } else {
             console.warn(`[SettingsStore] 尝试批量更新不允许的设置键: ${key}`);
        }
    }

    if (Object.keys(filteredUpdates).length === 0) {
        console.log('[SettingsStore] 没有有效的通用设置需要更新。');
        return; // 没有有效设置需要更新
    }

    try {
      // 注意：后端 controller 现在会过滤，但前端也做一层检查更好
      await axios.put('/api/v1/settings', filteredUpdates);
      // Update store state *after* successful API call
      settings.value = { ...settings.value, ...filteredUpdates };

      // If language is updated, apply it
      if (languageUpdate) {
        setLocale(languageUpdate);
      }
    } catch (err: any) {
      console.error('批量更新设置失败:', err);
      throw new Error(err.response?.data?.message || err.message || '批量更新设置失败');
    }
  }

  // 移除外观相关 actions: saveCustomThemes, resetCustomThemes, toggleStyleCustomizer

  // --- Getters ---
  const language = computed(() => settings.value.language || defaultLng);

  // Getter for the popup editor setting, returning boolean
  const showPopupFileEditorBoolean = computed(() => {
      return settings.value.showPopupFileEditor !== 'false';
  });

  // Getter for sharing setting, returning boolean
  const shareFileEditorTabsBoolean = computed(() => {
      return settings.value.shareFileEditorTabs !== 'false';
  });

  // Getter for IP Whitelist enabled status
  const ipWhitelistEnabled = computed(() => settings.value.ipWhitelistEnabled === 'true');


  return {
    settings, // 只包含通用设置
    isLoading,
    error,
    language,
    showPopupFileEditorBoolean,
    shareFileEditorTabsBoolean,
    ipWhitelistEnabled, // 暴露 IP 白名单启用状态
    // 移除外观相关的 getters 和 actions
    loadInitialSettings,
    updateSetting,
    updateMultipleSettings,
  };
});
