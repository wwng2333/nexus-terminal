import { getDb } from '../database';
import { AppearanceSettings, UpdateAppearanceDto } from '../types/appearance.types';
import { defaultUiTheme } from '../config/default-themes'; // Assuming default UI theme is here too

const db = getDb();
const TABLE_NAME = 'appearance_settings';
const SETTINGS_ID = 1; // Use a fixed ID for the single row of global settings

/**
 * 创建 appearance_settings 表 (如果不存在)
 */
const createTableIfNotExists = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY, -- Fixed ID for the single settings row
      custom_ui_theme TEXT,
      active_terminal_theme_id TEXT,
      terminal_font_family TEXT,
      terminal_background_image TEXT,
      page_background_image TEXT,
      updated_at INTEGER NOT NULL
    );
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error(`创建 ${TABLE_NAME} 表失败:`, err.message);
    } else {
      // 确保默认设置行存在
      ensureDefaultSettingsExist();
    }
  });
};

// 辅助函数：将数据库行转换为 AppearanceSettings 对象
const mapRowToAppearanceSettings = (row: any): AppearanceSettings => {
    if (!row) return getDefaultAppearanceSettings(); // Return default if no row found
    return {
        _id: row.id.toString(),
        customUiTheme: row.custom_ui_theme,
        activeTerminalThemeId: row.active_terminal_theme_id,
        terminalFontFamily: row.terminal_font_family,
        terminalBackgroundImage: row.terminal_background_image,
        // terminalBackgroundOpacity: row.terminal_background_opacity, // Removed
        pageBackgroundImage: row.page_background_image,
        // pageBackgroundOpacity: row.page_background_opacity, // Removed
        updatedAt: row.updated_at,
    };
};

// 获取默认外观设置
const getDefaultAppearanceSettings = (): AppearanceSettings => {
    // TODO: Find the ID of the default preset theme from terminal_themes table later
    // For now, leave activeTerminalThemeId null or undefined
    return {
        _id: SETTINGS_ID.toString(),
        customUiTheme: JSON.stringify(defaultUiTheme), // Use default UI theme
        activeTerminalThemeId: undefined, // Needs to be set after querying default theme ID
        terminalFontFamily: 'Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"', // Default font
        terminalBackgroundImage: undefined,
        // terminalBackgroundOpacity: 1.0, // Removed
        pageBackgroundImage: undefined,
        // pageBackgroundOpacity: 1.0, // Removed
        updatedAt: Date.now(),
    };
};


/**
 * 确保默认设置行存在
 */
const ensureDefaultSettingsExist = () => {
    const defaults = getDefaultAppearanceSettings();
    const sqlSelect = `SELECT id FROM ${TABLE_NAME} WHERE id = ?`;
    db.get(sqlSelect, [SETTINGS_ID], (err, row) => {
        if (err) {
            console.error(`检查默认外观设置时出错:`, err.message);
            return;
        }
        if (!row) {
            const sqlInsert = `
                INSERT INTO ${TABLE_NAME} (
                    id, custom_ui_theme, active_terminal_theme_id, terminal_font_family,
                    terminal_background_image, -- terminal_background_opacity, -- Removed
                    page_background_image, -- page_background_opacity, -- Removed
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?) -- Adjusted placeholder count
            `;
            db.run(sqlInsert, [
                SETTINGS_ID,
                defaults.customUiTheme,
                defaults.activeTerminalThemeId, // Initially undefined
                defaults.terminalFontFamily,
                defaults.terminalBackgroundImage,
                // defaults.terminalBackgroundOpacity, // Removed
                defaults.pageBackgroundImage,
                // defaults.pageBackgroundOpacity, // Removed
                defaults.updatedAt
            ], (insertErr) => {
                if (insertErr) {
                    console.error('插入默认外观设置失败:', insertErr.message);
                } else {
                    console.log('默认外观设置已初始化。');
                    // Now try to find and set the default theme ID
                    findAndSetDefaultThemeId();
                }
            });
        } else {
             // If row exists, still check if default theme ID needs setting
             findAndSetDefaultThemeId();
        }
    });
};

/**
 * 查找默认终端主题 ID 并更新外观设置
 */
const findAndSetDefaultThemeId = async () => {
    try {
        // Find the default theme from the other table
        const defaultThemeSql = `SELECT id FROM terminal_themes WHERE is_system_default = 1 LIMIT 1`;
        // Explicitly type the row or use type assertion
        db.get(defaultThemeSql, [], async (err, defaultThemeRow: { id: number } | undefined) => {
            if (err) {
                console.error("查找默认终端主题 ID 失败:", err.message);
                return;
            }
            if (defaultThemeRow) {
                const defaultThemeId = defaultThemeRow.id.toString();
                // Check current appearance settings
                const currentSettings = await getAppearanceSettings();
                if (currentSettings && currentSettings.activeTerminalThemeId !== defaultThemeId) {
                    // Update only if the active ID is not already the default
                    console.log(`设置默认激活终端主题 ID 为: ${defaultThemeId}`);
                    await updateAppearanceSettings({ activeTerminalThemeId: defaultThemeId });
                }
            } else {
                console.warn("未找到系统默认终端主题，无法设置 activeTerminalThemeId。");
            }
        });
    } catch (error) {
        console.error("设置默认终端主题 ID 时出错:", error);
    }
};


/**
 * 获取外观设置
 * @returns Promise<AppearanceSettings>
 */
export const getAppearanceSettings = async (): Promise<AppearanceSettings> => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM ${TABLE_NAME} WHERE id = ?`, [SETTINGS_ID], (err, row) => {
      if (err) {
        console.error('获取外观设置失败:', err.message);
        reject(new Error('获取外观设置失败'));
      } else {
        resolve(mapRowToAppearanceSettings(row));
      }
    });
  });
};

/**
 * 更新外观设置
 * @param settingsDto 更新的数据
 * @returns Promise<boolean> 是否成功更新
 */
export const updateAppearanceSettings = async (settingsDto: UpdateAppearanceDto): Promise<boolean> => {
  const now = Date.now();
  let sql = `UPDATE ${TABLE_NAME} SET updated_at = ?`;
  const params: any[] = [now];

  // Dynamically build the SET part of the query
  const updates: string[] = [];
  for (const key in settingsDto) {
      if (Object.prototype.hasOwnProperty.call(settingsDto, key)) {
          const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`); // Convert camelCase to snake_case
          // Ensure only valid keys are updated (Removed opacity keys)
          if (['custom_ui_theme', 'active_terminal_theme_id', 'terminal_font_family', 'terminal_background_image', 'page_background_image'].includes(dbKey)) {
              updates.push(`${dbKey} = ?`);
              params.push((settingsDto as any)[key]);
          }
      }
  }

  if (updates.length === 0) {
      return true; // Nothing to update
  }

  sql += `, ${updates.join(', ')} WHERE id = ?`;
  params.push(SETTINGS_ID);

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error('更新外观设置失败:', err.message);
        reject(new Error('更新外观设置失败'));
      } else {
        resolve(this.changes > 0);
      }
    });
  });
};

// 初始化时创建表
createTableIfNotExists();
