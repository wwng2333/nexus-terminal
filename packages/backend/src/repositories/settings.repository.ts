// packages/backend/src/repositories/settings.repository.ts
import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection';
import { SidebarConfig, LayoutNode, PaneName } from '../types/settings.types'; // <-- Import LayoutNode and PaneName
import { CaptchaSettings } from '../types/settings.types'; // <-- Import CaptchaSettings
import * as sqlite3 from 'sqlite3'; // Import sqlite3 for Database type hint

// Define keys for specific settings
const SIDEBAR_CONFIG_KEY = 'sidebarConfig';
const CAPTCHA_CONFIG_KEY = 'captchaConfig'; // <-- Add key for CAPTCHA settings

export interface Setting {
  key: string;
  value: string;
}

// Define the expected row structure from the database if different from Setting
// In this case, it seems Setting matches the SELECT columns.
type DbSettingRow = Setting;

export const settingsRepository = {
  async getAllSettings(): Promise<Setting[]> {
    try {
      const db = await getDbInstance();
      const rows = await allDb<DbSettingRow>(db, 'SELECT key, value FROM settings');
      return rows;
    } catch (err: any) {
      console.error('[Repository] 获取所有设置时出错:', err.message);
      throw new Error('获取设置失败');
    }
  },

  async getSetting(key: string): Promise<string | null> {
    console.log(`[Repository] Attempting to get setting with key: ${key}`);
    try {
      const db = await getDbInstance();
      // Use the correct type for the expected row structure
      const row = await getDbRow<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key]);
      const value = row ? row.value : null;
      console.log(`[Repository] Found value for key ${key}:`, value);
      return value;
    } catch (err: any) {
      console.error(`[Repository] 获取设置项 ${key} 时出错:`, err.message);
      throw new Error(`获取设置项 ${key} 失败`);
    }
  },

  async setSetting(key: string, value: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // Use seconds
    const sql = `INSERT INTO settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`;
    const params = [key, value, now, now];

    console.log(`[Repository] Attempting to set setting. Key: ${key}, Value: ${value}`);
    console.log(`[Repository] Executing SQL: ${sql} with params: ${JSON.stringify(params)}`);

    try {
      const db = await getDbInstance();
      const result = await runDb(db, sql, params);
      console.log(`[Repository] Successfully set setting for key: ${key}. Rows affected: ${result.changes}`);
    } catch (err: any) {
      console.error(`[Repository] 设置设置项 ${key} 时出错:`, err.message);
      throw new Error(`设置设置项 ${key} 失败`);
    }
  },

  async deleteSetting(key: string): Promise<boolean> { // Return boolean indicating success
    console.log(`[Repository] Attempting to delete setting with key: ${key}`);
    const sql = 'DELETE FROM settings WHERE key = ?';
    try {
      const db = await getDbInstance();
      const result = await runDb(db, sql, [key]);
      console.log(`[Repository] Successfully deleted setting for key: ${key}. Rows affected: ${result.changes}`);
      return result.changes > 0; // Return true if a row was deleted
    } catch (err: any) {
      console.error(`[Repository] 删除设置项 ${key} 时出错:`, err.message);
      throw new Error(`删除设置项 ${key} 失败`);
    }
  },

  async setMultipleSettings(settings: Record<string, string>): Promise<void> {
    console.log('[Repository] setMultipleSettings called with:', JSON.stringify(settings));
    // Use Promise.all with the async setSetting method
    // Note: 'this' inside map refers to the settingsRepository object correctly here
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting(key, value)
    );
    try {
        await Promise.all(promises);
        console.log('[Repository] setMultipleSettings finished successfully.');
    } catch (error) {
        console.error('[Repository] setMultipleSettings failed:', error);
        // Re-throw the error or handle it as needed
        throw new Error('批量设置失败');
    }
  },
};

// --- Specific Setting Getters/Setters ---

/**
 * 获取侧栏配置
 * @returns Promise<SidebarConfig> - Returns the parsed config or default
 */
export const getSidebarConfig = async (): Promise<SidebarConfig> => {
    const defaultValue: SidebarConfig = { left: [], right: [] };
    try {
        const jsonString = await settingsRepository.getSetting(SIDEBAR_CONFIG_KEY);
        if (jsonString) {
            try {
                const config = JSON.parse(jsonString);
                // Basic validation
                if (config && Array.isArray(config.left) && Array.isArray(config.right)) {
                    // TODO: Add deeper validation if needed (e.g., check if items are valid PaneName)
                    return config as SidebarConfig;
                }
                console.warn(`[SettingsRepo] Invalid sidebarConfig format found in DB: ${jsonString}. Returning default.`);
            } catch (parseError) {
                console.error(`[SettingsRepo] Failed to parse sidebarConfig JSON from DB: ${jsonString}`, parseError);
            }
        }
    } catch (error) {
        console.error(`[SettingsRepo] Error fetching sidebar config setting (key: ${SIDEBAR_CONFIG_KEY}):`, error);
    }
    // Return default if not found, invalid, or error occurred
    return defaultValue;
};

/**
 * 设置侧栏配置
 * @param config - The sidebar configuration object
 */
export const setSidebarConfig = async (config: SidebarConfig): Promise<void> => {
    try {
        // Basic validation before stringifying
        if (!config || typeof config !== 'object' || !Array.isArray(config.left) || !Array.isArray(config.right)) {
             throw new Error('Invalid sidebar config object provided.');
        }
        // TODO: Add deeper validation if needed (e.g., check PaneName validity)
        const jsonString = JSON.stringify(config);
        await settingsRepository.setSetting(SIDEBAR_CONFIG_KEY, jsonString);
    } catch (error) {
        console.error(`[SettingsRepo] Error setting sidebar config (key: ${SIDEBAR_CONFIG_KEY}):`, error);
        throw new Error('Failed to save sidebar configuration.');
    }
};

// --- CAPTCHA Settings ---

/**
 * 获取 CAPTCHA 配置
 * @returns Promise<CaptchaSettings> - 返回解析后的配置或默认值
 */
export const getCaptchaConfig = async (): Promise<CaptchaSettings> => {
    const defaultValue: CaptchaSettings = {
        enabled: false,
        provider: 'none',
        hcaptchaSiteKey: '',
        hcaptchaSecretKey: '', // Secret keys should ideally not have defaults stored directly here if possible
        recaptchaSiteKey: '',
        recaptchaSecretKey: '', // Secret keys should ideally not have defaults stored directly here if possible
    };
    try {
        const jsonString = await settingsRepository.getSetting(CAPTCHA_CONFIG_KEY);
        if (jsonString) {
            try {
                const config = JSON.parse(jsonString);
                // Basic validation (add more specific checks if needed)
                if (config && typeof config.enabled === 'boolean' && typeof config.provider === 'string') {
                     // Ensure all keys exist, even if undefined/null from older saves
                     return {
                        enabled: config.enabled ?? defaultValue.enabled,
                        provider: config.provider ?? defaultValue.provider,
                        hcaptchaSiteKey: config.hcaptchaSiteKey ?? defaultValue.hcaptchaSiteKey,
                        hcaptchaSecretKey: config.hcaptchaSecretKey ?? defaultValue.hcaptchaSecretKey,
                        recaptchaSiteKey: config.recaptchaSiteKey ?? defaultValue.recaptchaSiteKey,
                        recaptchaSecretKey: config.recaptchaSecretKey ?? defaultValue.recaptchaSecretKey,
                     } as CaptchaSettings;
                }
                console.warn(`[SettingsRepo] Invalid captchaConfig format found in DB: ${jsonString}. Returning default.`);
            } catch (parseError) {
                console.error(`[SettingsRepo] Failed to parse captchaConfig JSON from DB: ${jsonString}`, parseError);
            }
        }
    } catch (error) {
        console.error(`[SettingsRepo] Error fetching captcha config setting (key: ${CAPTCHA_CONFIG_KEY}):`, error);
    }
    // Return default if not found, invalid, or error occurred
    return defaultValue;
};

/**
 * 设置 CAPTCHA 配置
 * @param config - The CAPTCHA configuration object
 */
export const setCaptchaConfig = async (config: CaptchaSettings): Promise<void> => {
    try {
        // Basic validation before stringifying
        if (!config || typeof config !== 'object' || typeof config.enabled !== 'boolean' || typeof config.provider !== 'string') {
             throw new Error('Invalid CAPTCHA config object provided.');
        }
        // Ensure secret keys are strings, even if empty
        config.hcaptchaSecretKey = config.hcaptchaSecretKey || '';
        config.recaptchaSecretKey = config.recaptchaSecretKey || '';
        config.hcaptchaSiteKey = config.hcaptchaSiteKey || '';
        config.recaptchaSiteKey = config.recaptchaSiteKey || '';

        const jsonString = JSON.stringify(config);
        await settingsRepository.setSetting(CAPTCHA_CONFIG_KEY, jsonString);
    } catch (error) {
        console.error(`[SettingsRepo] Error setting CAPTCHA config (key: ${CAPTCHA_CONFIG_KEY}):`, error);
        throw new Error('Failed to save CAPTCHA configuration.');
    }
};


// --- Initialization ---

/**
 * Ensures default settings exist in the settings table.
 * This function should be called during database initialization.
 * @param db - The active database instance
 */
export const ensureDefaultSettingsExist = async (db: sqlite3.Database): Promise<void> => {
    // --- Define Default Structures Here ---
    // Use OmitIdRecursive helper type if needed, or define structure without IDs
    type OmitIdRecursive<T> = T extends object
      ? { [K in keyof Omit<T, 'id'>]: OmitIdRecursive<T[K]> }
      : T;

    const defaultLayoutTreeStructure: OmitIdRecursive<LayoutNode> = {
      type: "container",
      direction: "horizontal",
      children: [
        {
          type: "container",
          direction: "vertical",
          children: [
            { type: "pane", component: "statusMonitor", size: 44.56 },
            { type: "pane", component: "commandHistory", size: 26.24 },
            { type: "pane", component: "quickCommands", size: 29.20 }
          ],
          size: 14.59
        },
        {
          type: "container",
          direction: "vertical",
          size: 58.03,
          children: [
            { type: "pane", component: "terminal", size: 59.95 },
            { type: "pane", component: "commandBar", size: 5 },
            { type: "pane", component: "fileManager", size: 35.05 }
          ]
        },
        {
          type: "container",
          direction: "vertical",
          size: 27.38,
          children: [
            { type: "pane", component: "editor", size: 100 }
          ]
        }
      ]
    };

    const defaultSidebarPanesStructure: SidebarConfig = {
      left: ["connections", "dockerManager"],
      right: []
    };

    const defaultCaptchaSettings: CaptchaSettings = {
        enabled: false,
        provider: 'none',
        hcaptchaSiteKey: '',
        hcaptchaSecretKey: '',
        recaptchaSiteKey: '',
        recaptchaSecretKey: '',
    };

    // --- Define All Default Settings ---
    const defaultSettings: Record<string, string> = {
        ipWhitelistEnabled: 'false',
        ipWhitelist: '',
        maxLoginAttempts: '5',
        loginBanDuration: '300', // 5 minutes in seconds
        focusSwitcherSequence: JSON.stringify(["quickCommandsSearch", "commandHistorySearch", "fileManagerSearch", "commandInput", "terminalSearch"]), // Default focus sequence
        navBarVisible: 'true', // Default nav bar visibility
        layoutTree: JSON.stringify(defaultLayoutTreeStructure), // Use the defined structure
        autoCopyOnSelect: 'false', // Default auto copy setting
        showPopupFileEditor: 'false', // Default popup editor setting
        shareFileEditorTabs: 'true', // Default editor tab sharing
        dockerStatusIntervalSeconds: '5', // Default Docker refresh interval
        dockerDefaultExpand: 'false', // Default Docker expand state
        statusMonitorIntervalSeconds: '3', // Default Status Monitor interval
        [SIDEBAR_CONFIG_KEY]: JSON.stringify(defaultSidebarPanesStructure), // Use the defined structure
        [CAPTCHA_CONFIG_KEY]: JSON.stringify(defaultCaptchaSettings), // Add default CAPTCHA settings
        // Add other default settings here
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sqlInsertOrIgnore = `INSERT OR IGNORE INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)`;

    console.log('[SettingsRepo] Ensuring default settings exist...');
    try {
        for (const [key, value] of Object.entries(defaultSettings)) {
            await runDb(db, sqlInsertOrIgnore, [key, value, nowSeconds, nowSeconds]);
        }
        console.log('[SettingsRepo] Default settings check complete.');
    } catch (err: any) {
        console.error(`[SettingsRepo] Error ensuring default settings:`, err.message);
        throw new Error(`Failed to ensure default settings: ${err.message}`);
    }
};
