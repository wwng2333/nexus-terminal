import { getDb } from '../database';
import { TerminalTheme, CreateTerminalThemeDto, UpdateTerminalThemeDto } from '../types/terminal-theme.types';
import { defaultXtermTheme } from '../config/default-themes'; // 假设默认主题配置在此

// const db = getDb(); // Removed top-level call to avoid circular dependency issues

/**
 * SQL语句：创建 terminal_themes 表
 */
export const SQL_CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS terminal_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    theme_data TEXT NOT NULL, -- Store ITheme as JSON string
    is_preset BOOLEAN NOT NULL DEFAULT 0,
    preset_key TEXT NULL UNIQUE, -- 可选，用于识别预设主题
    is_system_default BOOLEAN NOT NULL DEFAULT 0, -- 新增：标记是否为系统默认主题
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

/**
 * 创建 terminal_themes 表 (如果不存在) - 不再自动调用
 */
const createTableIfNotExists = () => {
  // This function is no longer called automatically, initialization is handled in database.ts
  getDb().run(SQL_CREATE_TABLE, (err) => {
    if (err) {
      console.error('创建 terminal_themes 表失败:', err.message);
    } else {
      console.log('terminal_themes 表已存在或已创建。');
    }
  });
};

// 辅助函数：将数据库行转换为 TerminalTheme 对象
const mapRowToTerminalTheme = (row: any): TerminalTheme => {
  return {
    _id: row.id.toString(), // SQLite ID 是数字，转换为字符串以匹配 NeDB 风格
    name: row.name,
    themeData: JSON.parse(row.theme_data), // 解析 JSON 字符串
    isPreset: !!row.is_preset, // 转换为布尔值
    isSystemDefault: !!row.is_system_default, // 映射新增的列
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * 查找所有终端主题
 * @returns Promise<TerminalTheme[]>
 */
export const findAllThemes = async (): Promise<TerminalTheme[]> => {
  return new Promise((resolve, reject) => {
    getDb().all('SELECT * FROM terminal_themes ORDER BY is_preset DESC, name ASC', [], (err, rows) => {
      if (err) {
        console.error('查询所有终端主题失败:', err.message);
        reject(new Error('查询终端主题失败'));
      } else {
        resolve(rows.map(mapRowToTerminalTheme));
      }
    });
  });
};

/**
 * 根据 ID 查找终端主题
 * @param id 主题 ID (注意：这里是 SQLite 的数字 ID)
 * @returns Promise<TerminalTheme | null>
 */
export const findThemeById = async (id: number): Promise<TerminalTheme | null> => {
  return new Promise((resolve, reject) => {
    getDb().get('SELECT * FROM terminal_themes WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error(`查询 ID 为 ${id} 的终端主题失败:`, err.message);
        reject(new Error('查询终端主题失败'));
      } else {
        resolve(row ? mapRowToTerminalTheme(row) : null);
      }
    });
  });
};

/**
 * 创建一个新的终端主题
 * @param themeDto 创建主题所需的数据
 * @returns Promise<TerminalTheme> 新创建的主题
 */
export const createTheme = async (themeDto: CreateTerminalThemeDto): Promise<TerminalTheme> => {
  const now = Date.now();
  const themeDataJson = JSON.stringify(themeDto.themeData); // 将 ITheme 转换为 JSON 字符串
  const sql = `
    INSERT INTO terminal_themes (name, theme_data, is_preset, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `;
  return new Promise((resolve, reject) => {
    getDb().run(sql, [themeDto.name, themeDataJson, now, now], function (err) {
      if (err) {
        console.error('创建新终端主题失败:', err.message);
        // 特别处理唯一约束错误
        if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error(`主题名称 "${themeDto.name}" 已存在。`));
        } else {
            reject(new Error('创建终端主题失败'));
        }
      } else {
        // 获取新插入行的 ID 并查询返回完整对象
        findThemeById(this.lastID)
          .then(newTheme => {
            if (newTheme) {
              resolve(newTheme);
            } else {
              // 理论上不应该发生，但作为回退
              reject(new Error('创建主题后未能检索到该主题'));
            }
          })
          .catch(reject);
      }
    });
  });
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
  // 只允许更新非预设主题的 name 和 theme_data
  const sql = `
    UPDATE terminal_themes
    SET name = ?, theme_data = ?, updated_at = ?
    WHERE id = ? AND is_preset = 0
  `;
  return new Promise((resolve, reject) => {
    getDb().run(sql, [themeDto.name, themeDataJson, now, id], function (err) {
      if (err) {
        console.error(`更新 ID 为 ${id} 的终端主题失败:`, err.message);
        if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error(`主题名称 "${themeDto.name}" 已存在。`));
        } else {
            reject(new Error('更新终端主题失败'));
        }
      } else {
        resolve(this.changes > 0); // 如果有行被改变，则更新成功
      }
    });
  });
};

/**
 * 删除一个终端主题
 * @param id 要删除的主题 ID (SQLite 数字 ID)
 * @returns Promise<boolean> 是否成功删除
 */
export const deleteTheme = async (id: number): Promise<boolean> => {
  // 只允许删除非预设主题
  const sql = 'DELETE FROM terminal_themes WHERE id = ? AND is_preset = 0';
  return new Promise((resolve, reject) => {
    getDb().run(sql, [id], function (err) {
      if (err) {
        console.error(`删除 ID 为 ${id} 的终端主题失败:`, err.message);
        reject(new Error('删除终端主题失败'));
      } else {
        resolve(this.changes > 0); // 如果有行被改变，则删除成功
      }
    });
  });
};

/**
 * 初始化预设主题到数据库 (如果不存在)
 * 这个函数应该在数据库连接成功后，由应用初始化逻辑调用。
 * @param presets 预设主题定义数组 (包含 name, themeData, isPreset=true, 可选 preset_key)
 */
export const initializePresetThemes = async (presets: Array<Omit<TerminalTheme, '_id' | 'createdAt' | 'updatedAt'> & { preset_key?: string }>) => {
    console.log('[DB Init] 开始检查并初始化预设主题...');
    const now = Date.now();

    // 使用 for...of 循环确保顺序执行检查和插入（避免并发 UNIQUE 约束问题）
    for (const preset of presets) {
        await new Promise<void>((resolve, reject) => {
            // 优先使用 preset_key 检查，如果提供了的话
            const checkColumn = preset.preset_key ? 'preset_key' : 'name';
            const checkValue = preset.preset_key ?? preset.name;

            getDb().get(`SELECT id FROM terminal_themes WHERE ${checkColumn} = ? AND is_preset = 1`, [checkValue], (err, row) => {
                if (err) {
                    console.error(`[DB Init] 检查预设主题 "${preset.name}" (Key: ${checkValue}) 时出错:`, err.message);
                    return reject(err);
                }
                if (!row) {
                    const themeDataJson = JSON.stringify(preset.themeData);
                    const isDefault = preset.preset_key === 'default' ? 1 : 0;
                    // 始终包含 preset_key 列，如果不存在则插入 NULL
                    const columns = ['name', 'theme_data', 'is_preset', 'is_system_default', 'preset_key', 'created_at', 'updated_at']; // 7 columns
                    const values = [preset.name, themeDataJson, 1, isDefault, preset.preset_key ?? null, now, now]; // 7 values
                    const placeholders = ['?', '?', '?', '?', '?', '?', '?']; // 7 placeholders

                    // 移除动态添加 preset_key 的逻辑
                    // if (preset.preset_key) {
                    //     values.push(preset.preset_key);
                    //     placeholders.push('?');
                    // }

                    const insertSql = `
                        INSERT INTO terminal_themes (${columns.join(', ')})
                        VALUES (${placeholders.join(', ')})
                    `;

                    getDb().run(insertSql, values, (insertErr) => {
                        if (insertErr) {
                            console.error(`[DB Init] 初始化预设主题 "${preset.name}" (Key: ${preset.preset_key ?? 'N/A'}) 失败:`, insertErr.message); // 调整日志输出
                            return reject(insertErr);
                        } else {
                            console.log(`[DB Init] 预设主题 "${preset.name}" (Key: ${checkValue}) 已初始化到数据库。`);
                            resolve();
                        }
                    });
                } else {
                    // console.log(`[DB Init] 预设主题 "${preset.name}" (Key: ${checkValue}) 已存在，跳过初始化。`);
                    resolve();
                }
            });
        });
    }
    console.log('[DB Init] 预设主题检查和初始化完成。');
};

// 移除所有在此文件中的初始化调用和相关导入，它们应该在 database.ts 或 app.ts 中进行
