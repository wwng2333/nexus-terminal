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
  // Add other settings keys here as needed
  [key: string]: string; // Allow other string settings
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
    isLoading.value = true;
    error.value = null;
    let fetchedLang: 'en' | 'zh' | undefined;

    try {
      console.log('[SettingsStore] Starting loadInitialSettings...'); // 添加日志
      const response = await axios.get<Record<string, string>>('/api/v1/settings');
      settings.value = response.data; // Store all fetched settings
      console.log('[SettingsStore] Fetched settings:', JSON.stringify(settings.value)); // 添加日志

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
    const previousValue = settings.value[key];
    settings.value = { ...settings.value, [key]: value }; // Optimistic update

    try {
      await axios.put('/api/v1/settings', { [key]: value });
      // If updating language, also update i18n
      if (key === 'language' && (value === 'en' || value === 'zh')) {
        setLocale(value);
      }
    } catch (err: any) {
      console.error(`Failed to update setting '${key}':`, err);
      settings.value = { ...settings.value, [key]: previousValue }; // Revert on error
      throw new Error(err.response?.data?.message || err.message || `Failed to update setting '${key}'`);
    }
  }

  /**
   * Updates multiple settings values both locally and on the backend.
   * @param updates An object containing key-value pairs of settings to update.
   */
  async function updateMultipleSettings(updates: Partial<SettingsState>) {
    const previousSettings = { ...settings.value };
    settings.value = { ...settings.value, ...updates }; // Optimistic update

    try {
      await axios.put('/api/v1/settings', updates);
      // If language is updated, apply it
      if (updates.language && (updates.language === 'en' || updates.language === 'zh')) {
        setLocale(updates.language);
      }
    } catch (err: any) {
      console.error('Failed to update multiple settings:', err);
      settings.value = previousSettings; // Revert on error
      throw new Error(err.response?.data?.message || err.message || 'Failed to update settings');
    }
  }


  // --- Getters ---
  // Example getter (can add more as needed)
  const language = computed(() => settings.value.language || defaultLng);

  return {
    settings,
    isLoading,
    error,
    language, // Expose getter
    loadInitialSettings,
    updateSetting,
    updateMultipleSettings,
  };
});
