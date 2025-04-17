import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed } from 'vue'; // Import computed
import i18n, { setLocale, defaultLng } from '../i18n'; // Import i18n instance and setLocale

// Define the type for settings state explicitly
interface SettingsState {
  language: 'en' | 'zh';
  ipWhitelist: string;
  maxLoginAttempts: string;
  loginBanDuration: string;
  showPopupFileEditor: string; // 弹窗编辑器设置
  shareFileEditorTabs?: string; // 新增：共享编辑器标签页设置 ('true'/'false')
  // Add other settings keys here as needed
  [key: string]: string | undefined; // Allow other string settings, make value optional
}

export const useSettingsStore = defineStore('settings', () => {
  // --- State ---
  const settings = ref<Partial<SettingsState>>({}); // Use Partial initially
  const isLoading = ref(false);
  const error = ref<string | null>(null);

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
      console.log('[SettingsStore] Raw showPopupFileEditor from backend:', response.data.showPopupFileEditor); // <--- 添加日志：打印原始值

      // --- 设置默认值 (如果后端未返回) ---
      // 弹窗编辑器设置
      if (settings.value.showPopupFileEditor === undefined) {
          console.log('[SettingsStore] showPopupFileEditor is undefined, setting default: true'); // 修改日志
          settings.value.showPopupFileEditor = 'true'; // 默认为 true
      }
      // 共享编辑器标签页设置
      if (settings.value.shareFileEditorTabs === undefined) {
          console.log('[SettingsStore] Setting default for shareFileEditorTabs: true');
          settings.value.shareFileEditorTabs = 'true'; // 默认为 true (共享)
      }

      // --- 语言设置 ---
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

      // Ensure fetchedLang is valid before calling setLocale
      if (fetchedLang) {
        console.log(`[SettingsStore] Determined language: ${fetchedLang}. Applying locale...`); // 添加日志
        setLocale(fetchedLang); // Apply the determined locale
      } else {
         // This case should ideally not happen due to fallback logic, but as a safeguard:
        console.error('[SettingsStore] Could not determine a valid language to set.');
        setLocale(defaultLng); // Fallback to default if determination failed
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
   * Updates a single setting value both locally and on the backend.
   * @param key The setting key to update.
   * @param value The new value for the setting.
   */
  async function updateSetting(key: keyof SettingsState, value: string) {
    // const previousValue = settings.value[key]; // No longer needed for optimistic revert
    // settings.value = { ...settings.value, [key]: value }; // Remove optimistic update

    try {
      await axios.put('/api/v1/settings', { [key]: value });
      // Update store state *after* successful API call
      settings.value = { ...settings.value, [key]: value };
      // If updating language, also update i18n
      if (key === 'language' && (value === 'en' || value === 'zh')) {
        setLocale(value);
      }
    } catch (err: any) {
      console.error(`Failed to update setting '${key}':`, err);
      // settings.value = { ...settings.value, [key]: previousValue }; // Remove revert logic
      throw new Error(err.response?.data?.message || err.message || `Failed to update setting '${key}'`);
    }
  }

  /**
   * Updates multiple settings values both locally and on the backend.
   * @param updates An object containing key-value pairs of settings to update.
   */
  async function updateMultipleSettings(updates: Partial<SettingsState>) {
    // const previousSettings = { ...settings.value }; // No longer needed for optimistic revert
    // settings.value = { ...settings.value, ...updates }; // Remove optimistic update

    try {
      await axios.put('/api/v1/settings', updates);
      // Update store state *after* successful API call
      settings.value = { ...settings.value, ...updates };
      // If language is updated, apply it
      if (updates.language && (updates.language === 'en' || updates.language === 'zh')) {
        setLocale(updates.language);
      }
    } catch (err: any) {
      console.error('Failed to update multiple settings:', err);
      // settings.value = previousSettings; // Remove revert logic
      throw new Error(err.response?.data?.message || err.message || 'Failed to update settings');
    }
  }


  // --- Getters ---
  // --- Getters ---
  const language = computed(() => settings.value.language || defaultLng);

  // Getter for the popup editor setting, returning boolean
  const showPopupFileEditorBoolean = computed(() => {
      // 默认为 true，除非明确设置为 'false'
      return settings.value.showPopupFileEditor !== 'false'; // <-- 修正：检查正确的键 showPopupFileEditor
  });

  // Getter for sharing setting, returning boolean
  const shareFileEditorTabsBoolean = computed(() => {
      // 默认为 true (共享)，除非明确设置为 'false'
      return settings.value.shareFileEditorTabs !== 'false';
  });


  return {
    settings,
    isLoading,
    error,
    language, // Expose language getter
    showPopupFileEditorBoolean, // Expose boolean getter for popup editor setting
    shareFileEditorTabsBoolean: shareFileEditorTabsBoolean, // Expose boolean getter for sharing setting
    loadInitialSettings,
    updateSetting,
    updateMultipleSettings,
  };
});
