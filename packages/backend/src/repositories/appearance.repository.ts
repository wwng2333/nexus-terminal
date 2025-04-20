// packages/backend/src/repositories/appearance.repository.ts
// Import new async helpers and the instance getter, ensuring getDb is included
import { getDbInstance, runDb, getDb, allDb } from '../database/connection';
import { AppearanceSettings, UpdateAppearanceDto } from '../types/appearance.types';
import { defaultUiTheme } from '../config/default-themes';
// Import findThemeById from terminal theme repository for validation
import { findThemeById as findTerminalThemeById } from './terminal-theme.repository';
import * as sqlite3 from 'sqlite3'; // Import sqlite3 for Database type hint

const TABLE_NAME = 'appearance_settings';
// Remove SETTINGS_ID as the table is key-value based
// const SETTINGS_ID = 1;

// Define the expected row structure from the database (key-value)
interface DbAppearanceSettingsRow {
    key: string;
    value: string;
    created_at: number;
    updated_at: number;
}

// Helper function to map DB rows (key-value pairs) to AppearanceSettings object
const mapRowsToAppearanceSettings = (rows: DbAppearanceSettingsRow[]): AppearanceSettings => {
    const settings: Partial<AppearanceSettings> = {};
    let latestUpdatedAt = 0;

    for (const row of rows) {
        // Update latestUpdatedAt
        if (row.updated_at > latestUpdatedAt) {
            latestUpdatedAt = row.updated_at;
        }

        switch (row.key) {
            case 'customUiTheme':
                settings.customUiTheme = row.value;
                break;
            case 'activeTerminalThemeId':
                // Ensure value is parsed as number or null
                const parsedId = parseInt(row.value, 10);
                settings.activeTerminalThemeId = isNaN(parsedId) ? null : parsedId;
                break;
            case 'terminalFontFamily':
                settings.terminalFontFamily = row.value;
                break;
            case 'terminalFontSize':
                settings.terminalFontSize = parseInt(row.value, 10);
                break;
            case 'editorFontSize':
                settings.editorFontSize = parseInt(row.value, 10);
                break;
            case 'terminalBackgroundImage':
                settings.terminalBackgroundImage = row.value || undefined; // Use undefined if empty string
                break;
            case 'pageBackgroundImage':
                settings.pageBackgroundImage = row.value || undefined; // Use undefined if empty string
                break;
            // Add cases for other potential keys if needed
        }
    }

    // Merge with defaults for any missing keys and add _id and updatedAt
    const defaults = getDefaultAppearanceSettings(); // Get defaults
    return {
        _id: 'global_appearance', // Use a fixed string ID for the conceptual global settings
        customUiTheme: settings.customUiTheme ?? defaults.customUiTheme,
        activeTerminalThemeId: settings.activeTerminalThemeId ?? defaults.activeTerminalThemeId,
        terminalFontFamily: settings.terminalFontFamily ?? defaults.terminalFontFamily,
        terminalFontSize: settings.terminalFontSize ?? defaults.terminalFontSize,
        editorFontSize: settings.editorFontSize ?? defaults.editorFontSize,
        terminalBackgroundImage: settings.terminalBackgroundImage ?? defaults.terminalBackgroundImage,
        pageBackgroundImage: settings.pageBackgroundImage ?? defaults.pageBackgroundImage,
        updatedAt: latestUpdatedAt || defaults.updatedAt, // Use latest DB timestamp or default
    };
};


// 获取默认外观设置 (Simplified, _id is no longer relevant here)
const getDefaultAppearanceSettings = (): Omit<AppearanceSettings, '_id'> => {
    return {
        customUiTheme: JSON.stringify(defaultUiTheme),
        activeTerminalThemeId: null, // Default should be null initially
        terminalFontFamily: 'Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"',
        terminalFontSize: 14,
        editorFontSize: 14,
        terminalBackgroundImage: undefined,
        pageBackgroundImage: undefined,
        updatedAt: Date.now(), // Provide a default timestamp
    };
};


/**
 * Ensures default settings exist in the key-value table.
 * This function is called during database initialization.
 */
export const ensureDefaultSettingsExist = async (db: sqlite3.Database): Promise<void> => {
    const defaults = getDefaultAppearanceSettings();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sqlInsertOrIgnore = `INSERT OR IGNORE INTO ${TABLE_NAME} (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)`;

    // Define default key-value pairs to ensure existence
    const defaultEntries: Array<{ key: keyof Omit<AppearanceSettings, '_id' | 'updatedAt'>, value: any }> = [
        { key: 'customUiTheme', value: defaults.customUiTheme },
        { key: 'activeTerminalThemeId', value: null }, // Start with null
        { key: 'terminalFontFamily', value: defaults.terminalFontFamily },
        { key: 'terminalFontSize', value: defaults.terminalFontSize },
        { key: 'editorFontSize', value: defaults.editorFontSize },
        { key: 'terminalBackgroundImage', value: defaults.terminalBackgroundImage ?? '' }, // Use empty string for DB
        { key: 'pageBackgroundImage', value: defaults.pageBackgroundImage ?? '' }, // Use empty string for DB
    ];

    try {
        for (const entry of defaultEntries) {
            // Convert value to string for DB storage, handle null/undefined
            let dbValue: string;
            if (entry.value === null || entry.value === undefined) {
                dbValue = entry.key === 'activeTerminalThemeId' ? 'null' : ''; // Store null specifically for theme ID, empty otherwise
            } else if (typeof entry.value === 'object') {
                dbValue = JSON.stringify(entry.value);
            } else {
                dbValue = String(entry.value);
            }

            // Special handling for activeTerminalThemeId: store null as 'null' string or the number as string
             if (entry.key === 'activeTerminalThemeId') {
                 dbValue = entry.value === null ? 'null' : String(entry.value);
             }


            await runDb(db, sqlInsertOrIgnore, [entry.key, dbValue, nowSeconds, nowSeconds]);
        }
        console.log('[AppearanceRepo] 默认外观设置键值对检查完成。');

        // After ensuring keys exist, try to set the default theme ID if it's currently null
        await findAndSetDefaultThemeIdIfNull(db);

    } catch (err: any) {
         console.error(`[AppearanceRepo] 检查或插入默认外观设置键值对时出错:`, err.message);
         throw new Error(`检查或插入默认外观设置失败: ${err.message}`);
    }
};

/**
 * Finds the default terminal theme ID and updates the 'activeTerminalThemeId' setting if it's currently null.
 * @param db - The active database instance
 */
const findAndSetDefaultThemeIdIfNull = async (db: sqlite3.Database): Promise<void> => {
    try {
        // Check the current value of activeTerminalThemeId
        const currentSetting = await getDb<{ value: string }>(db, `SELECT value FROM ${TABLE_NAME} WHERE key = ?`, ['activeTerminalThemeId']);

        // Proceed only if the setting exists and its value represents null ('null' string)
        if (currentSetting && currentSetting.value === 'null') {
            // Find the default theme from the terminal_themes table (assuming name 'default' marks the default)
            const defaultThemeSql = `SELECT id FROM terminal_themes WHERE name = 'default' AND theme_type = 'preset' LIMIT 1`;
            const defaultThemeRow = await getDb<{ id: number }>(db, defaultThemeSql);

            if (defaultThemeRow) {
                const defaultThemeIdNum = defaultThemeRow.id;
                console.log(`[AppearanceRepo] activeTerminalThemeId 为 null，尝试设置为默认主题 ID: ${defaultThemeIdNum}`);
                // Update the setting using INSERT OR REPLACE
                const sqlReplace = `INSERT OR REPLACE INTO ${TABLE_NAME} (key, value, updated_at) VALUES (?, ?, ?)`;
                await runDb(db, sqlReplace, ['activeTerminalThemeId', String(defaultThemeIdNum), Math.floor(Date.now() / 1000)]);
            } else {
                console.warn("[AppearanceRepo] 未找到名为 'default' 的预设终端主题，无法设置默认 activeTerminalThemeId。");
            }
        } else {
             // console.log(`[AppearanceRepo] activeTerminalThemeId 已设置 (${currentSetting?.value}) 或键不存在，跳过设置默认 ID。`);
        }
    } catch (error: any) {
        console.error("[AppearanceRepo] 设置默认终端主题 ID 时出错:", error.message);
        // Don't throw here, just log
    }
};


/**
 * 获取外观设置
 * @returns Promise<AppearanceSettings>
 */
export const getAppearanceSettings = async (): Promise<AppearanceSettings> => {
  try {
    const db = await getDbInstance();
    // Fetch all rows from the key-value table
    const rows = await allDb<DbAppearanceSettingsRow>(db, `SELECT key, value, updated_at FROM ${TABLE_NAME}`);
    return mapRowsToAppearanceSettings(rows); // Map the key-value pairs to the settings object
  } catch (err: any) {
    console.error('获取外观设置失败:', err.message);
    throw new Error('获取外观设置失败');
  }
};

/**
 * 更新外观设置 (Public API)
 * @param settingsDto 更新的数据
 * @returns Promise<boolean> 是否成功更新
 */
export const updateAppearanceSettings = async (settingsDto: UpdateAppearanceDto): Promise<boolean> => {
    const db = await getDbInstance();
    // Perform validation or complex logic if needed before calling internal update
    // Example validation (already present in service, but could be here too):
    if (settingsDto.activeTerminalThemeId !== undefined && settingsDto.activeTerminalThemeId !== null) {
        try {
            const themeExists = await findTerminalThemeById(settingsDto.activeTerminalThemeId);
            if (!themeExists) {
                throw new Error(`指定的终端主题 ID 不存在: ${settingsDto.activeTerminalThemeId}`);
            }
        } catch (validationError: any) {
             console.error(`[AppearanceRepo] 验证主题 ID ${settingsDto.activeTerminalThemeId} 时出错:`, validationError.message);
             throw new Error(`验证主题 ID 失败: ${validationError.message}`);
        }
    }
    // ... other validations ...

    return updateAppearanceSettingsInternal(db, settingsDto);
};

/**
 * 内部更新外观设置函数 (供内部调用，如初始化)
 * @param db - Active database instance
 * @param settingsDto - Data to update
 * @returns Promise<boolean> - Success status
 */
// Internal function to update settings in the key-value table
const updateAppearanceSettingsInternal = async (db: sqlite3.Database, settingsDto: UpdateAppearanceDto): Promise<boolean> => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sqlReplace = `INSERT OR REPLACE INTO ${TABLE_NAME} (key, value, updated_at) VALUES (?, ?, ?)`;
  let changesMade = false;

  try {
      for (const key of Object.keys(settingsDto) as Array<keyof UpdateAppearanceDto>) {
          const value = settingsDto[key];
          let dbValue: string;

          // Convert value to string for DB, handle null/undefined
          if (value === null || value === undefined) {
               dbValue = key === 'activeTerminalThemeId' ? 'null' : ''; // Store null specifically for theme ID
          } else if (typeof value === 'object') {
               dbValue = JSON.stringify(value);
          } else {
               dbValue = String(value);
          }

          // Special handling for activeTerminalThemeId to store 'null' string or number string
          if (key === 'activeTerminalThemeId') {
              dbValue = value === null ? 'null' : String(value);
          }


          // Validation for active_terminal_theme_id type before saving
          if (key === 'activeTerminalThemeId' && value !== null && typeof value !== 'number') {
               console.error(`[AppearanceRepo] 更新 activeTerminalThemeId 时收到无效类型值: ${value} (类型: ${typeof value})，应为数字或 null。跳过此字段。`);
               continue; // Skip this key
          }

          // Execute INSERT OR REPLACE for each key-value pair
          const result = await runDb(db, sqlReplace, [key, dbValue, nowSeconds]);
          if (result.changes > 0) {
              changesMade = true;
          }
      }
      console.log(`[AppearanceRepo] 更新外观设置完成。是否有更改: ${changesMade}`);
      return changesMade; // Return true if any row was inserted or replaced
  } catch (err: any) {
      console.error('更新外观设置失败:', err.message);
      throw new Error('更新外观设置失败');
  }
};
