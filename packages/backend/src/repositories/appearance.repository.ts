import { getDb } from '../database';
import { AppearanceSettings, UpdateAppearanceDto } from '../types/appearance.types';
import { defaultUiTheme } from '../config/default-themes'; // Assuming default UI theme is here too

// const db = getDb(); // Removed top-level call to avoid circular dependency issues
const TABLE_NAME = 'appearance_settings';
const SETTINGS_ID = 1; // Use a fixed ID for the single row of global settings

/**
 * SQL语句：创建 appearance_settings 表
 */
export const SQL_CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY, -- Fixed ID for the single settings row
    custom_ui_theme TEXT,
    active_terminal_theme_id INTEGER NULL, -- 修改为 INTEGER NULL
    terminal_font_family TEXT,
    terminal_font_size INTEGER,
    editor_font_size INTEGER, -- 新增：编辑器字体大小
    terminal_background_image TEXT,
    page_background_image TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(active_terminal_theme_id) REFERENCES terminal_themes(id) -- 添加外键约束
  );
`;

/**
 * 创建 appearance_settings 表 (如果不存在) - 不再自动调用
 */
const createTableIfNotExists = () => {
  // This function is no longer called automatically, initialization is handled in database.ts
  getDb().run(SQL_CREATE_TABLE, (err) => {
    if (err) {
      console.error(`创建 ${TABLE_NAME} 表失败:`, err.message);
    } else {
      console.log(`${TABLE_NAME} 表已存在或已创建。`);
      // 确保默认设置行存在 - 这个调用也应该移到 database.ts
      // ensureDefaultSettingsExist();
    }
  });
};

// 辅助函数：将数据库行转换为 AppearanceSettings 对象
const mapRowToAppearanceSettings = (row: any): AppearanceSettings => {
    if (!row) return getDefaultAppearanceSettings(); // Return default if no row found
    return {
        _id: row.id.toString(),
        customUiTheme: row.custom_ui_theme,
        activeTerminalThemeId: row.active_terminal_theme_id, // 直接返回数字或 null
        terminalFontFamily: row.terminal_font_family,
        terminalFontSize: row.terminal_font_size,
        editorFontSize: row.editor_font_size, // 新增：编辑器字体大小映射
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
        activeTerminalThemeId: null, // 初始应为 null，待 findAndSetDefaultThemeId 设置
        terminalFontFamily: 'Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"', // Default font
        terminalFontSize: 14,
        editorFontSize: 14, // 新增：默认编辑器字体大小
        terminalBackgroundImage: undefined,
        // terminalBackgroundOpacity: 1.0, // Removed
        pageBackgroundImage: undefined,
        // pageBackgroundOpacity: 1.0, // Removed
        updatedAt: Date.now(),
    };
};


/**
 * 确保默认设置行存在，并在需要时设置默认激活主题 ID。
 * 这个函数应该在数据库初始化时，在预设主题初始化之后调用。
 */
export const ensureDefaultSettingsExist = async () => { // 改为 async 以便内部 await
    const defaults = getDefaultAppearanceSettings();
    const sqlSelect = `SELECT id, active_terminal_theme_id FROM ${TABLE_NAME} WHERE id = ?`; // 同时查询当前 ID
    // 将回调函数改为 async
    getDb().get(sqlSelect, [SETTINGS_ID], async (err, row) => {
        if (err) {
            console.error(`检查默认外观设置时出错:`, err.message);
            return;
        }
        if (!row) {
            const sqlInsert = `
                INSERT INTO ${TABLE_NAME} (
                    id, custom_ui_theme, active_terminal_theme_id, terminal_font_family, terminal_font_size, editor_font_size, -- 添加 editor_font_size 列
                    terminal_background_image, -- terminal_background_opacity, -- Removed
                    page_background_image, -- page_background_opacity, -- Removed
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) -- 调整占位符数量
            `;
           getDb().run(sqlInsert, [
               SETTINGS_ID,
               defaults.customUiTheme,
                defaults.activeTerminalThemeId, // Initially null
                defaults.terminalFontFamily,
                defaults.terminalFontSize,
                defaults.editorFontSize, // 添加 editor_font_size 默认值参数
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
             // 如果行已存在，直接调用 findAndSetDefaultThemeId 检查并设置默认 ID
             await findAndSetDefaultThemeId(); // 使用 await
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
        getDb().get(defaultThemeSql, [], async (err, defaultThemeRow: { id: number } | undefined) => {
            if (err) {
                console.error("查找默认终端主题 ID 失败:", err.message);
                return;
            }
            if (defaultThemeRow) {
                const defaultThemeIdNum = defaultThemeRow.id; // 直接使用数字 ID
                // Check current appearance settings
                const currentSettings = await getAppearanceSettings();
                // Only set the default theme ID if no active theme ID is currently set (i.e., it's null in the DB)
                if (currentSettings && currentSettings.activeTerminalThemeId === null) {
                    console.log(`数据库中未设置激活终端主题，设置为默认数字 ID: ${defaultThemeIdNum}`);
                    // 更新时传递数字 ID
                    await updateAppearanceSettings({ activeTerminalThemeId: defaultThemeIdNum });
                } else {
                    console.log(`数据库中已设置激活终端主题数字 ID (${currentSettings?.activeTerminalThemeId}) 或未找到默认主题，跳过设置默认 ID。`);
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
    getDb().get(`SELECT * FROM ${TABLE_NAME} WHERE id = ?`, [SETTINGS_ID], (err, row) => {
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
  const validDbKeys = ['custom_ui_theme', 'active_terminal_theme_id', 'terminal_font_family', 'terminal_font_size', 'editor_font_size', 'terminal_background_image', 'page_background_image'];

  // Iterate over potential keys to update
  for (const key of Object.keys(settingsDto) as Array<keyof UpdateAppearanceDto>) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`); // Convert camelCase to snake_case

      if (validDbKeys.includes(dbKey)) {
          const value = settingsDto[key];
          // active_terminal_theme_id 应该是数字或 null
          if (dbKey === 'active_terminal_theme_id' && typeof value !== 'number' && value !== null) {
              console.error(`[AppearanceRepo] 更新 active_terminal_theme_id 时收到无效类型值: ${value} (类型: ${typeof value})，应为数字或 null。跳过此字段。`);
              continue; // 跳过无效类型
          }
          updates.push(`${dbKey} = ?`);
          // 直接推入值 (数字或 null)
          params.push(value);
      }
  }

  if (updates.length === 0) {
      return true; // Nothing to update
  }

  sql += `, ${updates.join(', ')} WHERE id = ?`;
  params.push(SETTINGS_ID);

  return new Promise((resolve, reject) => {
    // --- 增加详细日志 ---
    console.log(`[AppearanceRepo] Executing SQL: ${sql}`);
    console.log(`[AppearanceRepo] With Params: ${JSON.stringify(params)}`);
    // --- 日志结束 ---
    getDb().run(sql, params, function (err) {
      if (err) {
        console.error('更新外观设置失败:', err.message);
        reject(new Error('更新外观设置失败'));
      } else {
        console.log(`[AppearanceRepo] 更新外观设置成功，影响行数: ${this.changes}`);
        resolve(this.changes > 0);
      }
    });
  });
};

// 初始化时创建表 - Removed: Initialization is now handled in database.ts
// createTableIfNotExists();
