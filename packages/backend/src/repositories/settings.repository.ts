import { getDb } from '../database'; // 正确导入 getDb 函数

const db = getDb(); // 获取数据库实例

export interface Setting {
  key: string;
  value: string;
}

export const settingsRepository = {
  async getAllSettings(): Promise<Setting[]> {
    return new Promise((resolve, reject) => {
      db.all('SELECT key, value FROM settings', (err: any, rows: Setting[]) => { // 添加 err 类型
        if (err) {
          console.error('获取所有设置时出错:', err); // 更新日志为中文
          reject(new Error('获取设置失败')); // 更新错误消息为中文
        } else {
          resolve(rows);
        }
      });
    });
  },

  async getSetting(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM settings WHERE key = ?', [key], (err: any, row: { value: string } | undefined) => { // 添加 err 类型
        if (err) {
          console.error(`获取设置项 ${key} 时出错:`, err); // 更新日志为中文
          reject(new Error(`获取设置项 ${key} 失败`)); // 更新错误消息为中文
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  },

  async setSetting(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000); // 获取当前 Unix 时间戳
      db.run(
        `INSERT INTO settings (key, value, created_at, updated_at) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(key) DO UPDATE SET 
           value = excluded.value,
           updated_at = excluded.updated_at`,
        [key, value, now, now],
        function (err: any) { // 添加 err 类型
          if (err) {
            console.error(`设置设置项 ${key} 时出错:`, err); // 更新日志为中文
            reject(new Error(`设置设置项 ${key} 失败`)); // 更新错误消息为中文
          } else {
            resolve();
          }
        }
      );
    });
  },

  async deleteSetting(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM settings WHERE key = ?', [key], function (err: any) { // 添加 err 类型
        if (err) {
          console.error(`删除设置项 ${key} 时出错:`, err); // 更新日志为中文
          reject(new Error(`删除设置项 ${key} 失败`)); // 更新错误消息为中文
        } else {
          resolve();
        }
      });
    });
  },

  async setMultipleSettings(settings: Record<string, string>): Promise<void> {
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting(key, value)
    );
    await Promise.all(promises);
  },
};
