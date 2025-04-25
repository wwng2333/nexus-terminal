import { defineStore } from 'pinia';
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { ref, computed } from 'vue'; // 移除 watch
import i18n, { setLocale, defaultLng } from '../i18n'; // Import i18n instance and setLocale
import type { PaneName } from './layout.store'; // +++ Import PaneName type +++
// Import CAPTCHA types from backend (adjust path if needed, assuming types are mirrored or shared)
// For now, let's assume they are available via a shared types definition or manually defined here
// Assuming manual definition for now if no shared types exist:
type CaptchaProvider = 'hcaptcha' | 'recaptcha' | 'none';
interface CaptchaSettings {
    enabled: boolean;
    provider: CaptchaProvider;
    hcaptchaSiteKey?: string;
    hcaptchaSecretKey?: string; // Store locally but don't expose via getters easily
    recaptchaSiteKey?: string;
    recaptchaSecretKey?: string; // Store locally but don't expose via getters easily
}
interface UpdateCaptchaSettingsDto {
    enabled?: boolean;
    provider?: CaptchaProvider;
    hcaptchaSiteKey?: string;
    hcaptchaSecretKey?: string;
    recaptchaSiteKey?: string;
    recaptchaSecretKey?: string;
}
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
  autoCopyOnSelect?: string; // 'true' or 'false' - 终端选中自动复制
  dockerStatusIntervalSeconds?: string; // NEW: Docker 状态刷新间隔 (秒)
  dockerDefaultExpand?: string; // NEW: Docker 默认展开详情 'true' or 'false'
  statusMonitorIntervalSeconds?: string; // NEW: 状态监控轮询间隔 (秒)
  workspaceSidebarPersistent?: string; // NEW: 工作区侧边栏是否固定 'true' or 'false'
  sidebarPaneWidths?: string; // NEW: 存储各侧边栏组件宽度的 JSON 字符串
  fileManagerRowSizeMultiplier?: string; // NEW: 文件管理器行大小乘数 (e.g., '1.0')
  fileManagerColWidths?: string; // NEW: 文件管理器列宽 JSON 字符串 (e.g., '{"name": 300, "size": 100}')
  commandInputSyncTarget?: 'quickCommands' | 'commandHistory' | 'none'; // NEW: 命令输入同步目标
  // Add other general settings keys here as needed
  [key: string]: string | undefined; // Allow other string settings
}


export const useSettingsStore = defineStore('settings', () => {
  // --- State ---
  const settings = ref<Partial<SettingsState>>({}); // 通用设置状态
  const parsedSidebarPaneWidths = ref<Record<string, string>>({}); // NEW: 解析后的侧边栏宽度对象
  const parsedFileManagerColWidths = ref<Record<string, number>>({}); // NEW: 解析后的文件管理器列宽对象
  const captchaSettings = ref<CaptchaSettings | null>(null); // NEW: CAPTCHA 设置状态
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
      const response = await apiClient.get<Record<string, string>>('/settings'); // 使用 apiClient
      settings.value = response.data; // Store fetched general settings
      // --- 更详细的日志 ---
      console.log('[SettingsStore] Fetched settings from backend:', JSON.stringify(settings.value));

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


      if (settings.value.autoCopyOnSelect === undefined) {
          settings.value.autoCopyOnSelect = 'false'; // 默认禁用选中即复制
      }
      // NEW: Docker setting defaults
      if (settings.value.dockerStatusIntervalSeconds === undefined) {
          settings.value.dockerStatusIntervalSeconds = '2'; // 默认 2 秒
      }
      if (settings.value.dockerDefaultExpand === undefined) {
          settings.value.dockerDefaultExpand = 'false'; // 默认不展开
      }
      // NEW: Status Monitor interval default
      if (settings.value.statusMonitorIntervalSeconds === undefined) {
          settings.value.statusMonitorIntervalSeconds = '3'; // 默认 3 秒
      }
      // NEW: Workspace sidebar persistent default
      if (settings.value.workspaceSidebarPersistent === undefined) {
          settings.value.workspaceSidebarPersistent = 'false'; // 默认不固定
      }
      // NEW: Load and parse sidebar pane widths
      const defaultPaneWidth = '350px';
      // +++ Ensure PaneName type is available or define it here +++
      const knownPanes: PaneName[] = ['connections', 'fileManager', 'editor', 'statusMonitor', 'commandHistory', 'quickCommands', 'dockerManager']; // Add all possible sidebar panes
      let loadedWidths: Record<string, string> = {};
      try {
          if (settings.value.sidebarPaneWidths) {
              loadedWidths = JSON.parse(settings.value.sidebarPaneWidths);
              if (typeof loadedWidths !== 'object' || loadedWidths === null) {
                  console.warn('[SettingsStore] Invalid sidebarPaneWidths format loaded, resetting.');
                  loadedWidths = {};
              }
          }
      } catch (e) {
          console.error('[SettingsStore] Failed to parse sidebarPaneWidths, resetting.', e);
          loadedWidths = {};
      }
      // Ensure defaults for all known panes
      const finalWidths: Record<string, string> = {};
      knownPanes.forEach(pane => {
          finalWidths[pane] = loadedWidths[pane] || defaultPaneWidth;
      });
      parsedSidebarPaneWidths.value = finalWidths;
      // Optionally save back if defaults were added (might cause extra write on first load)
      // if (Object.keys(loadedWidths).length !== Object.keys(finalWidths).length) {
      //     await updateSetting('sidebarPaneWidths', JSON.stringify(finalWidths));
      // }

      // NEW: Load and parse file manager layout settings
      const defaultFileManagerRowMultiplier = '1.0';
      const defaultFileManagerColWidths = { type: 50, name: 300, size: 100, permissions: 120, modified: 180 };

      // Row Size Multiplier
      console.log(`[SettingsStore] Raw fileManagerRowSizeMultiplier from backend: '${settings.value.fileManagerRowSizeMultiplier}'`);
      if (settings.value.fileManagerRowSizeMultiplier === undefined) {
          settings.value.fileManagerRowSizeMultiplier = defaultFileManagerRowMultiplier; // Assign first
          console.log(`[SettingsStore] fileManagerRowSizeMultiplier not found, set to default: ${settings.value.fileManagerRowSizeMultiplier}`); // Log the assigned value
      }
      // Ensure it's a valid number string before parsing later
      const parsedMultiplier = parseFloat(settings.value.fileManagerRowSizeMultiplier);
      if (isNaN(parsedMultiplier) || parsedMultiplier <= 0) {
          console.warn(`[SettingsStore] Invalid fileManagerRowSizeMultiplier loaded ('${settings.value.fileManagerRowSizeMultiplier}'), resetting to default.`);
          settings.value.fileManagerRowSizeMultiplier = defaultFileManagerRowMultiplier;
      }
      console.log(`[SettingsStore] Final fileManagerRowSizeMultiplier value in store: '${settings.value.fileManagerRowSizeMultiplier}'`);

      // Column Widths
      let loadedFmWidths: Record<string, number> = {};
      console.log(`[SettingsStore] Raw fileManagerColWidths from backend: '${settings.value.fileManagerColWidths}'`);
      try {
          if (settings.value.fileManagerColWidths) {
              loadedFmWidths = JSON.parse(settings.value.fileManagerColWidths);
              console.log(`[SettingsStore] Successfully parsed fileManagerColWidths JSON: ${JSON.stringify(loadedFmWidths)}`);
              if (typeof loadedFmWidths !== 'object' || loadedFmWidths === null) {
                  console.warn('[SettingsStore] Invalid fileManagerColWidths format loaded, resetting.');
                  loadedFmWidths = {};
              }
              // Validate that values are numbers
              for (const key in loadedFmWidths) {
                  if (typeof loadedFmWidths[key] !== 'number') {
                      console.warn(`[SettingsStore] Invalid non-numeric value found in fileManagerColWidths for key '${key}', resetting.`);
                      loadedFmWidths = {};
                      break;
                  }
              }
          }
      } catch (e) {
          console.error('[SettingsStore] Failed to parse fileManagerColWidths, resetting.', e);
          loadedFmWidths = {};
      }
      // Ensure defaults for all known columns, merging with loaded valid ones
      const finalFmWidths: Record<string, number> = { ...defaultFileManagerColWidths };
      console.log(`[SettingsStore] Default FM Col Widths: ${JSON.stringify(defaultFileManagerColWidths)}`);
      Object.keys(defaultFileManagerColWidths).forEach(key => {
          if (loadedFmWidths[key] !== undefined && loadedFmWidths[key] > 0) { // Use loaded if valid
              finalFmWidths[key] = loadedFmWidths[key];
          }
      });
      parsedFileManagerColWidths.value = finalFmWidths;
      console.log(`[SettingsStore] Final parsedFileManagerColWidths value in store: ${JSON.stringify(parsedFileManagerColWidths.value)}`);
      // Save back if defaults were added or structure changed (optional, might cause extra write)
      // const currentSavedFmWidthsString = settings.value.fileManagerColWidths;
      // const finalFmWidthsString = JSON.stringify(finalFmWidths);
      // if (currentSavedFmWidthsString !== finalFmWidthsString) {
      //     await updateSetting('fileManagerColWidths', finalFmWidthsString);
      // }

      // NEW: Command Input Sync Target default
      if (settings.value.commandInputSyncTarget === undefined) {
          settings.value.commandInputSyncTarget = 'none'; // 默认不同步
      }

      // --- 语言设置 ---
      const langFromSettings = settings.value.language;
      console.log(`[SettingsStore] Language from fetched settings: ${langFromSettings}`); // <-- 添加日志
      if (langFromSettings === 'en' || langFromSettings === 'zh') {
        fetchedLang = langFromSettings;
      } else {
        const navigatorLang = navigator.language?.split('-')[0];
        fetchedLang = navigatorLang === 'zh' ? 'zh' : defaultLng;
        console.warn(`[SettingsStore] Invalid language setting ('${langFromSettings}') received from backend or missing. Falling back to '${fetchedLang}'.`); // <-- 修改日志
        // Optionally save the fallback language back
        // await updateSetting('language', fetchedLang);
      }

      if (fetchedLang) {
        console.log(`[SettingsStore] Determined language: ${fetchedLang}. Calling setLocale...`); // <-- 添加日志
        setLocale(fetchedLang);
      } else {
        // This case should theoretically not happen with the fallback logic above
        console.error('[SettingsStore] Could not determine a valid language. This should not happen.');
        console.log(`[SettingsStore] Falling back to default: ${defaultLng}. Calling setLocale...`); // <-- 添加日志
        setLocale(defaultLng);
      }

    } catch (err: any) {
      console.error('Error loading general settings:', err); // <-- 修改日志
      error.value = err.response?.data?.message || err.message || 'Failed to load settings';
      // 出错时（例如未登录），根据浏览器语言设置回退语言
      const navigatorLang = navigator.language?.split('-')[0];
      const fallbackLang = navigatorLang === 'zh' ? 'zh' : defaultLng;
      console.log(`[SettingsStore] Error loading settings. Falling back to language: ${fallbackLang}. Calling setLocale...`); // <-- 添加日志
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
        'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled',
        'autoCopyOnSelect', 'dockerStatusIntervalSeconds', 'dockerDefaultExpand',
        'statusMonitorIntervalSeconds', // +++ 添加状态监控间隔键 +++
        'workspaceSidebarPersistent', // +++ 添加侧边栏固定键 +++
        'sidebarPaneWidths', // +++ 添加侧边栏宽度对象键 +++
        'fileManagerRowSizeMultiplier', // +++ 添加文件管理器行大小键 +++
        'fileManagerColWidths', // +++ 添加文件管理器列宽键 +++
        'commandInputSyncTarget' // +++ 添加命令输入同步目标键 +++
    ];
    if (!allowedKeys.includes(key)) {
        console.error(`[SettingsStore] 尝试更新不允许的设置键: ${key}`);
        throw new Error(`不允许更新设置项 '${key}'`);
    }

    try {
      // 注意：后端 controller 现在会过滤，但前端也做一层检查更好
      await apiClient.put('/settings', { [key]: value }); // 使用 apiClient
      // Update store state *after* successful API call
      settings.value = { ...settings.value, [key]: value };

      // If updating language, also update i18n
      if (key === 'language' && (value === 'en' || value === 'zh')) {
        console.log(`[SettingsStore] updateSetting: Language updated to ${value}. Calling setLocale...`); // <-- 添加日志
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
        'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled',
        'autoCopyOnSelect', 'dockerStatusIntervalSeconds', 'dockerDefaultExpand',
        'statusMonitorIntervalSeconds', // +++ 添加状态监控间隔键 +++
        'workspaceSidebarPersistent', // +++ 添加侧边栏固定键 +++
        'sidebarPaneWidths', // +++ 添加侧边栏宽度对象键 +++
        'fileManagerRowSizeMultiplier', // +++ 添加文件管理器行大小键 +++
        'fileManagerColWidths', // +++ 添加文件管理器列宽键 +++
        'commandInputSyncTarget' // +++ 添加命令输入同步目标键 +++
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
      await apiClient.put('/settings', filteredUpdates); // 使用 apiClient
      // Update store state *after* successful API call
      settings.value = { ...settings.value, ...filteredUpdates };

      // If language is updated, apply it
      if (languageUpdate) {
        console.log(`[SettingsStore] updateMultipleSettings: Language updated to ${languageUpdate}. Calling setLocale...`); // <-- 添加日志
        setLocale(languageUpdate);
      }
    } catch (err: any) {
      console.error('批量更新设置失败:', err);
      throw new Error(err.response?.data?.message || err.message || '批量更新设置失败');
    }
  }

  /**
   * Updates the width for a specific sidebar pane.
   * @param paneName The name of the pane (component).
   * @param width The new width string (e.g., '400px').
   */
  async function updateSidebarPaneWidth(paneName: PaneName, width: string) {
    if (!paneName) return;
    const newWidths = { ...parsedSidebarPaneWidths.value, [paneName]: width };
    parsedSidebarPaneWidths.value = newWidths; // Update local reactive state first
    try {
      await updateSetting('sidebarPaneWidths', JSON.stringify(newWidths));
    } catch (error) {
      console.error(`[SettingsStore] Failed to save sidebarPaneWidths after updating ${paneName}:`, error);
      // Optionally revert local state or show error to user
    }
  }

  /**
   * Updates the File Manager layout settings (row size multiplier and column widths).
   * @param multiplier The new row size multiplier (number).
   * @param widths The new column widths object (Record<string, number>).
   */
  async function updateFileManagerLayoutSettings(multiplier: number, widths: Record<string, number>) {
    const multiplierString = multiplier.toFixed(2); // Store with 2 decimal places
    const widthsString = JSON.stringify(widths);

    // Update local parsed state immediately for responsiveness
    parsedFileManagerColWidths.value = widths;
    // The multiplier is handled directly by the component, but update the setting value
    settings.value.fileManagerRowSizeMultiplier = multiplierString;
    settings.value.fileManagerColWidths = widthsString;

    try {
      console.log(`[SettingsStore] Saving FM layout: multiplier=${multiplierString}, widths=${widthsString}`);
      await updateMultipleSettings({
        fileManagerRowSizeMultiplier: multiplierString,
        fileManagerColWidths: widthsString,
      });
    } catch (error) {
      console.error('[SettingsStore] Failed to save file manager layout settings:', error);
      // Optionally revert local state or show error to user
    }
  }

  // --- CAPTCHA Settings Actions ---

  /**
   * Fetches CAPTCHA settings from the backend.
   * Should be called when the settings component mounts.
   */
  async function loadCaptchaSettings() {
    // Avoid reloading if already loaded, unless forced
    // if (captchaSettings.value !== null && !force) return;

    isLoading.value = true;
    error.value = null;
    try {
      console.log('[SettingsStore] 加载 CAPTCHA 设置...');
      // Use the correct endpoint defined in the backend routes
      const response = await apiClient.get<CaptchaSettings>('/settings/captcha');
      captchaSettings.value = response.data;
      console.log('[SettingsStore] CAPTCHA 设置加载完成:', { ...response.data, hcaptchaSecretKey: '***', recaptchaSecretKey: '***' }); // Mask secrets
    } catch (err: any) {
      console.error('加载 CAPTCHA 设置失败:', err);
      error.value = err.response?.data?.message || err.message || '加载 CAPTCHA 设置失败';
      captchaSettings.value = null; // Reset on error
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Updates CAPTCHA settings on the backend.
   * @param updates - An object containing the CAPTCHA settings fields to update.
   */
  async function updateCaptchaSettings(updates: UpdateCaptchaSettingsDto) {
    isLoading.value = true;
    error.value = null;
    try {
      console.log('[SettingsStore] 更新 CAPTCHA 设置:', { ...updates, hcaptchaSecretKey: '***', recaptchaSecretKey: '***' }); // Mask secrets
      // Use the correct endpoint defined in the backend routes
      await apiClient.put('/settings/captcha', updates);

      // Update local state after successful API call
      // Merge updates into the existing state or reload
      if (captchaSettings.value) {
        captchaSettings.value = { ...captchaSettings.value, ...updates };
      } else {
        // If settings were null, reload them after update
        await loadCaptchaSettings();
      }
      console.log('[SettingsStore] CAPTCHA 设置更新成功。');

    } catch (err: any) {
      console.error('更新 CAPTCHA 设置失败:', err);
      error.value = err.response?.data?.message || err.message || '更新 CAPTCHA 设置失败';
      throw error; // Re-throw to allow component to handle UI feedback
    } finally {
      isLoading.value = false;
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


  // Getter for auto copy on select setting, returning boolean
  const autoCopyOnSelectBoolean = computed(() => {
      return settings.value.autoCopyOnSelect === 'true';
  });

  // NEW: Getter for workspace sidebar persistent setting, returning boolean
  const workspaceSidebarPersistentBoolean = computed(() => {
      return settings.value.workspaceSidebarPersistent === 'true';
  });

  // NEW: Getter to get width for a specific sidebar pane
  const getSidebarPaneWidth = computed(() => (paneName: PaneName | null): string => {
    const defaultWidth = '350px';
    if (!paneName) return defaultWidth;
    // Ensure parsedSidebarPaneWidths.value is accessed correctly
    const widths = parsedSidebarPaneWidths.value || {};
    return widths[paneName] || defaultWidth;
  });

  // NEW: Getter for Docker default expand setting, returning boolean
  const dockerDefaultExpandBoolean = computed(() => {
      return settings.value.dockerDefaultExpand === 'true';
  });

  // NEW: Getter for Status Monitor interval, returning number
  const statusMonitorIntervalSecondsNumber = computed(() => {
      const val = parseInt(settings.value.statusMonitorIntervalSeconds || '3', 10);
      return isNaN(val) || val <= 0 ? 3 : val; // Fallback to 3 if invalid
  });

  // NEW: Getter for File Manager row size multiplier, returning number
  const fileManagerRowSizeMultiplierNumber = computed(() => {
      const val = parseFloat(settings.value.fileManagerRowSizeMultiplier || '1.0');
      return isNaN(val) || val <= 0 ? 1.0 : val; // Fallback to 1.0 if invalid
  });

  // NEW: Getter for File Manager column widths, returning object
  const fileManagerColWidthsObject = computed(() => {
      // Return the reactive ref directly, which is updated during load and save
      return parsedFileManagerColWidths.value;
  });

  // NEW: Getter for command input sync target
  const commandInputSyncTarget = computed(() => {
      const target = settings.value.commandInputSyncTarget;
      if (target === 'quickCommands' || target === 'commandHistory') {
          return target;
      }
      return 'none'; // Default to 'none' if invalid or not set
  });

  // --- CAPTCHA Getters (Public Only) ---
  const isCaptchaEnabled = computed(() => captchaSettings.value?.enabled ?? false);
  const captchaProvider = computed(() => captchaSettings.value?.provider ?? 'none');
  const hcaptchaSiteKey = computed(() => captchaSettings.value?.hcaptchaSiteKey ?? '');
  const recaptchaSiteKey = computed(() => captchaSettings.value?.recaptchaSiteKey ?? '');
  // DO NOT expose secret keys via getters

 return {
    settings, // 只包含通用设置
    isLoading,
    error,
    language,
    showPopupFileEditorBoolean,
    shareFileEditorTabsBoolean,
    ipWhitelistEnabled, // 暴露 IP 白名单启用状态
    autoCopyOnSelectBoolean,
    dockerDefaultExpandBoolean, // +++ 暴露 Docker 默认展开 getter +++
    statusMonitorIntervalSecondsNumber, // +++ 暴露状态监控间隔 getter +++
    workspaceSidebarPersistentBoolean, // +++ 暴露侧边栏固定 getter +++
    getSidebarPaneWidth, // +++ 暴露获取特定面板宽度的 getter +++
    fileManagerRowSizeMultiplierNumber, // +++ 暴露文件管理器行大小 getter +++
    fileManagerColWidthsObject, // +++ 暴露文件管理器列宽 getter +++
    // CAPTCHA related exports
    captchaSettings, // Expose the full (but reactive) object for the settings page v-model
    isCaptchaEnabled,
    captchaProvider,
    hcaptchaSiteKey,
    recaptchaSiteKey,
    loadCaptchaSettings,
    updateCaptchaSettings,
    // 移除外观相关的 getters 和 actions
    loadInitialSettings,
    updateSetting,
    updateMultipleSettings,
    updateSidebarPaneWidth, // +++ 暴露更新特定面板宽度的 action +++
    updateFileManagerLayoutSettings, // +++ 暴露更新文件管理器布局的 action +++
    commandInputSyncTarget, // +++ 暴露命令输入同步目标 getter +++
  };
});
