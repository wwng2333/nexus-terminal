import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed, watch } from 'vue'; // Import computed and watch
import i18n, { setLocale, defaultLng } from '../i18n'; // Import i18n instance and setLocale
import type { ITheme } from 'xterm'; // 导入 xterm 主题类型

// Define the type for settings state explicitly
interface SettingsState {
  language: 'en' | 'zh';
  ipWhitelist: string;
  maxLoginAttempts: string;
  loginBanDuration: string;
  showPopupFileEditor: string; // 弹窗编辑器设置
  shareFileEditorTabs?: string; // 共享编辑器标签页设置 ('true'/'false')
  customUiTheme?: string; // UI 主题 (CSS 变量 JSON 字符串)
  customXtermTheme?: string; // xterm 主题 (JSON 字符串)
  // Add other settings keys here as needed
  [key: string]: string | undefined; // Allow other string settings, make value optional
}

// 默认 UI 主题 (CSS 变量)
const defaultUiTheme: Record<string, string> = {
  '--app-bg-color': '#ffffff',
  '--text-color': '#333333',
  '--text-color-secondary': '#666666',
  '--border-color': '#cccccc',
  '--link-color': '#333',
  '--link-hover-color': '#0056b3',
  '--link-active-color': '#007bff',
  '--header-bg-color': '#f0f0f0',
  '--footer-bg-color': '#f0f0f0',
  '--button-bg-color': '#007bff',
  '--button-text-color': '#ffffff',
  '--button-hover-bg-color': '#0056b3',
  '--font-family-sans-serif': 'sans-serif',
  '--base-padding': '1rem',
  '--base-margin': '0.5rem',
};

// 默认 xterm 主题
const defaultXtermTheme: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: '#264f78', // 使用 selectionBackground 而不是 selection
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
};

export const useSettingsStore = defineStore('settings', () => {
  // --- State ---
  const settings = ref<Partial<SettingsState>>({}); // Use Partial initially
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const isStyleCustomizerVisible = ref(false); // 控制样式编辑器可见性
  const currentUiTheme = ref<Record<string, string>>({ ...defaultUiTheme }); // 当前应用的 UI 主题
  const currentXtermTheme = ref<ITheme>({ ...defaultXtermTheme }); // 当前应用的 xterm 主题

  // --- Actions ---

  /**
   * Fetches all settings from the backend and updates the store state.
   * Also sets the i18n locale based on the fetched language setting.
   * Should be called early in the application lifecycle (e.g., main.ts).
   */
  async function loadInitialSettings() {
    console.log('[SettingsStore] Entering loadInitialSettings function...'); // <-- 添加更早的日志
    isLoading.value = true;
    error.value = null;
    let fetchedLang: 'en' | 'zh' | undefined;

    try {
      console.log('[SettingsStore] Starting loadInitialSettings...'); // 添加日志
      const response = await axios.get<Record<string, string>>('/api/v1/settings');
      settings.value = response.data; // Store all fetched settings
      console.log('[SettingsStore] Fetched settings raw:', JSON.stringify(response.data)); // 打印原始响应
      console.log('[SettingsStore] Raw showPopupFileEditor from backend:', response.data.showPopupFileEditor);

      // --- 设置默认值 (如果后端未返回) ---
      // 弹窗编辑器设置 (保持不变)
      if (settings.value.showPopupFileEditor === undefined) {
          console.log('[SettingsStore] showPopupFileEditor is undefined, setting default: true');
          settings.value.showPopupFileEditor = 'true';
      }
      // 共享编辑器标签页设置 (保持不变)
      if (settings.value.shareFileEditorTabs === undefined) {
          console.log('[SettingsStore] Setting default for shareFileEditorTabs: true');
          settings.value.shareFileEditorTabs = 'true';
      }

      // --- 加载自定义主题 ---
      loadAndApplyThemesFromSettings(); // 新增：加载并应用主题

      // --- 语言设置 (保持不变) ---
      // Determine and apply language
      const langFromSettings = settings.value.language;
      if (langFromSettings === 'en' || langFromSettings === 'zh') {
        fetchedLang = langFromSettings;
      } else {
        // Fallback logic if setting is missing or invalid
        const navigatorLang = navigator.language?.split('-')[0];
        fetchedLang = navigatorLang === 'zh' ? 'zh' : defaultLng; // Use browser lang or default
        console.warn(`[SettingsStore] Language setting not found or invalid ('${langFromSettings}'). Falling back to '${fetchedLang}'.`);
        // Optionally save the fallback language back to the backend if desired
        // await updateSetting('language', fetchedLang);
      }

      // Ensure fetchedLang is valid before calling setLocale (保持不变)
      if (fetchedLang) {
        console.log(`[SettingsStore] Determined language: ${fetchedLang}. Applying locale...`);
        setLocale(fetchedLang);
      } else {
        console.error('[SettingsStore] Could not determine a valid language to set.');
        setLocale(defaultLng);
      }

    } catch (err: any) {
      console.error('Failed to load initial settings:', err);
      error.value = err.response?.data?.message || err.message || 'Failed to load settings';
      // Apply default language on error
      setLocale(defaultLng);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 从 settings ref 加载主题设置，解析并应用它们。
   */
  function loadAndApplyThemesFromSettings() {
    // 加载 UI 主题
    try {
      if (settings.value.customUiTheme) {
        const parsedUiTheme = JSON.parse(settings.value.customUiTheme);
        // 合并默认值，确保所有变量都存在
        currentUiTheme.value = { ...defaultUiTheme, ...parsedUiTheme };
      } else {
        currentUiTheme.value = { ...defaultUiTheme }; // 使用默认值
      }
    } catch (e) {
      console.error('[SettingsStore] Failed to parse custom UI theme, using default:', e);
      currentUiTheme.value = { ...defaultUiTheme };
    }

    // 加载 xterm 主题
    try {
      if (settings.value.customXtermTheme) {
        const parsedXtermTheme = JSON.parse(settings.value.customXtermTheme);
        // 合并默认值
        currentXtermTheme.value = { ...defaultXtermTheme, ...parsedXtermTheme };
      } else {
        currentXtermTheme.value = { ...defaultXtermTheme }; // 使用默认值
      }
    } catch (e) {
      console.error('[SettingsStore] Failed to parse custom xterm theme, using default:', e);
      currentXtermTheme.value = { ...defaultXtermTheme };
    }

    // 应用加载的主题
    applyUiTheme(currentUiTheme.value);
    // xterm 主题的应用将在 Terminal 组件内部通过 watch 监听 currentXtermTheme 实现
  }

  /**
   * 将 UI 主题 (CSS 变量) 应用到文档根元素。
   * @param theme 要应用的 UI 主题对象。
   */
  function applyUiTheme(theme: Record<string, string>) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) {
      root.style.setProperty(key, value);
    }
    console.log('[SettingsStore] Applied UI theme:', theme);
  }

  // 监听 currentUiTheme 的变化并自动应用
  watch(currentUiTheme, (newTheme) => {
    applyUiTheme(newTheme);
  }, { deep: true }); // 使用 deep watch 监听对象内部变化

  /**
   * Updates a single setting value both locally and on the backend.
   * @param key The setting key to update.
   * @param value The new value for the setting.
   */
  async function updateSetting(key: keyof SettingsState, value: string) {
    try {
      await axios.put('/api/v1/settings', { [key]: value });
      // Update store state *after* successful API call
      settings.value = { ...settings.value, [key]: value };
      // 如果更新的是主题设置，需要重新解析和应用
      if (key === 'customUiTheme' || key === 'customXtermTheme') {
          loadAndApplyThemesFromSettings();
      }
      // If updating language, also update i18n
      if (key === 'language' && (value === 'en' || value === 'zh')) {
        setLocale(value);
      }
    } catch (err: any) {
      console.error(`Failed to update setting '${key}':`, err);
      throw new Error(err.response?.data?.message || err.message || `Failed to update setting '${key}'`);
    }
  }

    /**
   * Updates multiple settings values both locally and on the backend.
   * @param updates An object containing key-value pairs of settings to update.
   */
  async function updateMultipleSettings(updates: Partial<SettingsState>) {
    try {
      await axios.put('/api/v1/settings', updates);
      // Update store state *after* successful API call
      settings.value = { ...settings.value, ...updates };
      // 如果更新包含主题设置，需要重新解析和应用
      if (updates.customUiTheme !== undefined || updates.customXtermTheme !== undefined) {
          loadAndApplyThemesFromSettings();
      }
      // If language is updated, apply it
      if (updates.language && (updates.language === 'en' || updates.language === 'zh')) {
        setLocale(updates.language);
      }
    } catch (err: any) {
      console.error('Failed to update multiple settings:', err);
      throw new Error(err.response?.data?.message || err.message || 'Failed to update settings');
    }
  }

  /**
   * 保存当前编辑器中的自定义主题到后端。
   * @param uiTheme UI 主题对象
   * @param xtermTheme xterm 主题对象
   */
  async function saveCustomThemes(uiTheme: Record<string, string>, xtermTheme: ITheme) {
    const updates: Partial<SettingsState> = {
      customUiTheme: JSON.stringify(uiTheme),
      customXtermTheme: JSON.stringify(xtermTheme),
    };
    // 更新本地状态以立即反映（虽然 watch 也会触发应用，但这里更新 state 是必要的）
    currentUiTheme.value = { ...uiTheme };
    currentXtermTheme.value = { ...xtermTheme };
    // 调用 updateMultipleSettings 保存到后端
    await updateMultipleSettings(updates);
  }

  /**
   * 重置为默认主题并保存。
   */
  async function resetCustomThemes() {
    await saveCustomThemes(defaultUiTheme, defaultXtermTheme);
  }

  /**
   * 切换样式编辑器面板的可见性。
   * @param visible 可选，强制设置可见性
   */
  function toggleStyleCustomizer(visible?: boolean) {
    isStyleCustomizerVisible.value = visible === undefined ? !isStyleCustomizerVisible.value : visible;
  }

  // --- Getters --- (保持不变)
  // --- Getters ---
  const language = computed(() => settings.value.language || defaultLng);

  // Getter for the popup editor setting, returning boolean (保持不变)
  const showPopupFileEditorBoolean = computed(() => {
      return settings.value.showPopupFileEditor !== 'false';
  });

  // Getter for sharing setting, returning boolean (保持不变)
  const shareFileEditorTabsBoolean = computed(() => {
      return settings.value.shareFileEditorTabs !== 'false';
  });

  return {
    settings, // 原始设置对象 (可能包含字符串化的主题)
    isLoading,
    error,
    language,
    showPopupFileEditorBoolean,
    shareFileEditorTabsBoolean,
    isStyleCustomizerVisible, // 暴露编辑器可见状态
    currentUiTheme, // 暴露当前应用的 UI 主题对象
    currentXtermTheme, // 暴露当前应用的 xterm 主题对象
    loadInitialSettings,
    updateSetting,
    updateMultipleSettings,
    saveCustomThemes, // 暴露保存主题 action
    resetCustomThemes, // 暴露重置主题 action
    toggleStyleCustomizer, // 暴露切换编辑器 action
  };
});
