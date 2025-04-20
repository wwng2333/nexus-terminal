// packages/backend/src/repositories/terminal-theme.repository.ts
import { Database } from 'sqlite3'; // Import Database type if needed for type hints
import { getDbInstance, runDb, getDb, allDb } from '../database/connection'; // Import new async helpers, including getDb
// Remove the incorrect import of DbTerminalThemeRow
import { TerminalTheme, CreateTerminalThemeDto, UpdateTerminalThemeDto } from '../types/terminal-theme.types';
import { defaultXtermTheme } from '../config/default-themes';

// Define the interface for the raw database row structure
// Interface matching the schema in schema.ts
interface DbTerminalThemeRow {
    id: number;
    name: string;
    theme_type: 'preset' | 'user';
    foreground?: string | null;
    background?: string | null;
    cursor?: string | null;
    cursor_accent?: string | null;
    selection_background?: string | null;
    black?: string | null;
    red?: string | null;
    green?: string | null;
    yellow?: string | null;
    blue?: string | null;
    magenta?: string | null;
    cyan?: string | null;
    white?: string | null;
    bright_black?: string | null;
    bright_red?: string | null;
    bright_green?: string | null;
    bright_yellow?: string | null;
    bright_blue?: string | null;
    bright_magenta?: string | null;
    bright_cyan?: string | null;
    bright_white?: string | null;
    created_at: number;
    updated_at: number;
}

// SQL_CREATE_TABLE and createTableIfNotExists removed as initialization is handled in database/connection.ts

// 辅助函数：将数据库行转换为 TerminalTheme 对象
// Add type annotation for the input row
const mapRowToTerminalTheme = (row: DbTerminalThemeRow): TerminalTheme => {
  // Basic check if row exists and has id property
  if (!row || typeof row.id === 'undefined') {
      console.error("mapRowToTerminalTheme received invalid row:", row);
      // Return a default or throw an error, depending on desired behavior
      // For now, let's throw an error to make the issue visible
      throw new Error("Invalid database row provided to mapRowToTerminalTheme");
  }
  try {
      return {
        _id: row.id.toString(),
        name: row.name,
        // Reconstruct themeData from individual columns
        themeData: {
            foreground: row.foreground ?? undefined,
            background: row.background ?? undefined,
            cursor: row.cursor ?? undefined,
            cursorAccent: row.cursor_accent ?? undefined,
            selectionBackground: row.selection_background ?? undefined,
            black: row.black ?? undefined,
            red: row.red ?? undefined,
            green: row.green ?? undefined,
            yellow: row.yellow ?? undefined,
            blue: row.blue ?? undefined,
            magenta: row.magenta ?? undefined,
            cyan: row.cyan ?? undefined,
            white: row.white ?? undefined,
            brightBlack: row.bright_black ?? undefined,
            brightRed: row.bright_red ?? undefined,
            brightGreen: row.bright_green ?? undefined,
            brightYellow: row.bright_yellow ?? undefined,
            brightBlue: row.bright_blue ?? undefined,
            brightMagenta: row.bright_magenta ?? undefined,
            brightCyan: row.bright_cyan ?? undefined,
            brightWhite: row.bright_white ?? undefined,
        },
        isPreset: row.theme_type === 'preset',
        // isSystemDefault needs to be handled differently, maybe based on name 'default'?
        // For now, let's assume it's not directly mapped or needed here.
        isSystemDefault: row.name === 'default', // Tentative mapping based on name
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
  } catch (e: any) {
      // Log the entire row for debugging instead of the non-existent theme_data
      console.error(`Error mapping theme data for theme ID ${row.id}:`, e.message, "Raw row:", row);
      // Return a partially mapped object or throw error
      throw new Error(`Failed to map theme data for theme ID ${row.id}`);
  }
};

/**
 * 查找所有终端主题
 * @returns Promise<TerminalTheme[]>
 */
export const findAllThemes = async (): Promise<TerminalTheme[]> => {
  try {
    const db = await getDbInstance();
    // Specify the expected row type for allDb
    // Correct the ORDER BY clause to use theme_type and sort presets first
    const rows = await allDb<DbTerminalThemeRow>(db, 'SELECT * FROM terminal_themes ORDER BY CASE theme_type WHEN \'preset\' THEN 0 ELSE 1 END ASC, name ASC');
    // Filter out potential errors during mapping
    return rows.map(row => {
        try {
            return mapRowToTerminalTheme(row);
        } catch (mapError: any) {
            console.error(`Error mapping row ID ${row?.id}:`, mapError.message);
            return null; // Or handle differently
        }
    }).filter((theme): theme is TerminalTheme => theme !== null);
  } catch (err: any) { // Add type annotation for err
    console.error('查询所有终端主题失败:', err.message);
    // 添加详细错误日志
    console.error('详细错误:', err);
    throw new Error('查询终端主题失败'); // Re-throw or handle error appropriately
  }
};

/**
 * 根据 ID 查找终端主题
 * @param id 主题 ID (SQLite 数字 ID)
 * @returns Promise<TerminalTheme | null>
 */
export const findThemeById = async (id: number): Promise<TerminalTheme | null> => {
  if (isNaN(id) || id <= 0) {
      console.error("findThemeById called with invalid ID:", id);
      return null; // Return null for invalid IDs
  }
  try {
    const db = await getDbInstance();
     // Specify the expected row type for getDbRow
    // Use getDb instead of the non-existent getDbRow
    const row = await getDb<DbTerminalThemeRow>(db, 'SELECT * FROM terminal_themes WHERE id = ?', [id]);
    return row ? mapRowToTerminalTheme(row) : null;
  } catch (err: any) { // Add type annotation for err
    console.error(`查询 ID 为 ${id} 的终端主题失败:`, err.message);
    throw new Error('查询终端主题失败');
  }
};

/**
 * 创建一个新的终端主题
 * @param themeDto 创建主题所需的数据
 * @returns Promise<TerminalTheme> 新创建的主题
 */
export const createTheme = async (themeDto: CreateTerminalThemeDto): Promise<TerminalTheme> => {
  const nowSeconds = Math.floor(Date.now() / 1000); // Use seconds for DB consistency
  const theme = themeDto.themeData;

  // Define columns based on the DbTerminalThemeRow interface (excluding id, created_at, updated_at)
  const columns = [
      'name', 'theme_type', 'foreground', 'background', 'cursor', 'cursor_accent',
      'selection_background', 'black', 'red', 'green', 'yellow', 'blue',
      'magenta', 'cyan', 'white', 'bright_black', 'bright_red', 'bright_green',
      'bright_yellow', 'bright_blue', 'bright_magenta', 'bright_cyan', 'bright_white',
      'created_at', 'updated_at'
  ];
  // Map themeDto data to corresponding columns, using null for missing optional values
  const values = [
      themeDto.name, 'user', // theme_type is 'user' for created themes
      theme?.foreground ?? null, theme?.background ?? null, theme?.cursor ?? null, theme?.cursorAccent ?? null,
      theme?.selectionBackground ?? null, theme?.black ?? null, theme?.red ?? null, theme?.green ?? null, theme?.yellow ?? null, theme?.blue ?? null,
      theme?.magenta ?? null, theme?.cyan ?? null, theme?.white ?? null, theme?.brightBlack ?? null, theme?.brightRed ?? null, theme?.brightGreen ?? null,
      theme?.brightYellow ?? null, theme?.brightBlue ?? null, theme?.brightMagenta ?? null, theme?.brightCyan ?? null, theme?.brightWhite ?? null,
      nowSeconds, nowSeconds // Use seconds for timestamps
  ];
  const placeholders = columns.map(() => '?').join(', ');

  const sql = `
    INSERT INTO terminal_themes (${columns.join(', ')})
    VALUES (${placeholders})
  `;

  try {
    const db = await getDbInstance();
    const result = await runDb(db, sql, values); // Use the mapped values array
    // Ensure lastID is valid before trying to find the theme
    if (typeof result.lastID !== 'number' || result.lastID <= 0) {
        throw new Error('创建主题后未能获取有效的 lastID');
    }
    const newTheme = await findThemeById(result.lastID);
    if (newTheme) {
      return newTheme;
    } else {
      // This case might happen if findThemeById fails for some reason
      throw new Error(`创建主题后未能检索到 ID 为 ${result.lastID} 的主题`);
    }
  } catch (err: any) { // Add type annotation for err
    console.error('创建新终端主题失败:', err.message);
    if (err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`主题名称 "${themeDto.name}" 已存在。`);
    } else {
        throw new Error('创建终端主题失败');
    }
  }
};

/**
 * 更新一个终端主题
 * @param id 要更新的主题 ID (SQLite 数字 ID)
 * @param themeDto 更新的数据
 * @returns Promise<boolean> 是否成功更新
 */
export const updateTheme = async (id: number, themeDto: UpdateTerminalThemeDto): Promise<boolean> => {
  const now = Date.now();
  const themeDataJson = JSON.stringify(themeDto.themeData);
  const sql = `
    UPDATE terminal_themes
    SET name = ?, theme_data = ?, updated_at = ?
    WHERE id = ? AND is_preset = 0
  `;
  try {
    const db = await getDbInstance();
    const result = await runDb(db, sql, [themeDto.name, themeDataJson, now, id]);
    return result.changes > 0;
  } catch (err: any) { // Add type annotation for err
    console.error(`更新 ID 为 ${id} 的终端主题失败:`, err.message);
    if (err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`主题名称 "${themeDto.name}" 已存在。`);
    } else {
        throw new Error('更新终端主题失败');
    }
  }
};

/**
 * 删除一个终端主题
 * @param id 要删除的主题 ID (SQLite 数字 ID)
 * @returns Promise<boolean> 是否成功删除
 */
export const deleteTheme = async (id: number): Promise<boolean> => {
  const sql = 'DELETE FROM terminal_themes WHERE id = ? AND is_preset = 0';
  try {
    const db = await getDbInstance();
    const result = await runDb(db, sql, [id]);
    return result.changes > 0;
  } catch (err: any) { // Add type annotation for err
    console.error(`删除 ID 为 ${id} 的终端主题失败:`, err.message);
    throw new Error('删除终端主题失败');
  }
};

/**
 * 初始化预设主题到数据库 (如果不存在)
 * 这个函数应该在数据库连接成功后，由应用初始化逻辑调用。
 * @param presets 预设主题定义数组
 */
export const initializePresetThemes = async (db: Database, presets: Array<Omit<TerminalTheme, '_id' | 'createdAt' | 'updatedAt' | 'isSystemDefault'> & { name: string }>) => {
    console.log('[DB Init] 开始检查并初始化预设主题...');
    const nowSeconds = Math.floor(Date.now() / 1000); // Use seconds for DB consistency
    // const db = await getDbInstance(); // Use the passed db instance

    for (const preset of presets) {
        try {
            // Check using name and theme_type
            const existing = await getDb<{ id: number }>(db, `SELECT id FROM terminal_themes WHERE name = ? AND theme_type = 'preset'`, [preset.name]);

            if (!existing) {
                // Map preset.themeData to individual columns
                const theme = preset.themeData;
                const columns = [
                    'name', 'theme_type', 'foreground', 'background', 'cursor', 'cursor_accent',
                    'selection_background', 'black', 'red', 'green', 'yellow', 'blue',
                    'magenta', 'cyan', 'white', 'bright_black', 'bright_red', 'bright_green',
                    'bright_yellow', 'bright_blue', 'bright_magenta', 'bright_cyan', 'bright_white',
                    'created_at', 'updated_at'
                ];
                const values = [
                    preset.name, 'preset', theme?.foreground, theme?.background, theme?.cursor, theme?.cursorAccent,
                    theme?.selectionBackground, theme?.black, theme?.red, theme?.green, theme?.yellow, theme?.blue,
                    theme?.magenta, theme?.cyan, theme?.white, theme?.brightBlack, theme?.brightRed, theme?.brightGreen,
                    theme?.brightYellow, theme?.brightBlue, theme?.brightMagenta, theme?.brightCyan, theme?.brightWhite,
                    nowSeconds, nowSeconds
                ];
                const placeholders = columns.map(() => '?').join(', ');

                const insertSql = `
                    INSERT INTO terminal_themes (${columns.join(', ')})
                    VALUES (${placeholders})
                `;
                await runDb(db, insertSql, values);
                console.log(`[DB Init] 预设主题 "${preset.name}" 已初始化到数据库。`);
            } else {
                // console.log(`[DB Init] 预设主题 "${preset.name}" 已存在，跳过初始化。`);
            }
        } catch (err: any) { // Add type annotation for err
             // Remove reference to non-existent preset_key
             console.error(`[DB Init] 处理预设主题 "${preset.name}" 时出错:`, err.message);
             // Decide if one error should stop the whole process or just log and continue
             // throw err; // Uncomment to stop on first error
        }
    }
    console.log('[DB Init] 预设主题检查和初始化完成。');
};
