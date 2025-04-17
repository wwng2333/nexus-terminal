import { getDb } from '../database';
import { TerminalTheme, CreateTerminalThemeDto, UpdateTerminalThemeDto } from '../types/terminal-theme.types';
import { defaultXtermTheme } from '../config/default-themes'; // 假设默认主题配置在此

const db = getDb();

/**
 * 创建 terminal_themes 表 (如果不存在)
 */
const createTableIfNotExists = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS terminal_themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      theme_data TEXT NOT NULL, -- Store ITheme as JSON string
      is_preset BOOLEAN NOT NULL DEFAULT 0,
      is_system_default BOOLEAN DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error('创建 terminal_themes 表失败:', err.message);
    } else {
      // 表创建成功后，初始化预设主题
      initializePresetThemes();
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
    isSystemDefault: !!row.is_system_default,
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
    db.all('SELECT * FROM terminal_themes ORDER BY is_preset DESC, name ASC', [], (err, rows) => {
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
    db.get('SELECT * FROM terminal_themes WHERE id = ?', [id], (err, row) => {
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
    db.run(sql, [themeDto.name, themeDataJson, now, now], function (err) {
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
    db.run(sql, [themeDto.name, themeDataJson, now, id], function (err) {
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
    db.run(sql, [id], function (err) {
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
 * 初始化预设主题 (如果不存在)
 */
export const initializePresetThemes = async () => {
  const defaultPresetName = '默认暗色'; // Default Dark
  const themeDataJson = JSON.stringify(defaultXtermTheme);
  const now = Date.now();

  // 检查默认预设是否存在
  db.get('SELECT id FROM terminal_themes WHERE name = ? AND is_preset = 1', [defaultPresetName], (err, row) => {
    if (err) {
      console.error('检查预设主题时出错:', err.message);
      return;
    }
    if (!row) {
      // 如果不存在，则插入
      const insertSql = `
        INSERT INTO terminal_themes (name, theme_data, is_preset, is_system_default, created_at, updated_at)
        VALUES (?, ?, 1, 1, ?, ?)
      `;
      db.run(insertSql, [defaultPresetName, themeDataJson, now, now], (insertErr) => {
        if (insertErr) {
          console.error(`初始化预设主题 "${defaultPresetName}" 失败:`, insertErr.message);
        } else {
          console.log(`预设主题 "${defaultPresetName}" 已初始化。`);
        }
      });
    }
    // 在这里可以添加更多预设主题的初始化逻辑
  });
};

// 初始化时创建表
createTableIfNotExists();
