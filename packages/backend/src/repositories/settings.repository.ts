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
          console.error('[Repository] 获取所有设置时出错:', err); // 更新日志为中文
          reject(new Error('获取设置失败')); // 更新错误消息为中文
        } else {
          resolve(rows);
        }
      });
    });
  },

  async getSetting(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      console.log(`[Repository] Attempting to get setting with key: ${key}`); // +++ 添加日志 +++
      db.get('SELECT value FROM settings WHERE key = ?', [key], (err: any, row: { value: string } | undefined) => { // 添加 err 类型
        if (err) {
          console.error(`[Repository] 获取设置项 ${key} 时出错:`, err); // 更新日志为中文
          reject(new Error(`获取设置项 ${key} 失败`)); // 更新错误消息为中文
        } else {
          console.log(`[Repository] Found value for key ${key}:`, row ? row.value : null); // +++ 添加日志 +++
          resolve(row ? row.value : null);
        }
      });
    });
  },

  async setSetting(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000); // 获取当前 Unix 时间戳
      const sql = `INSERT INTO settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`;
      const params = [key, value, now, now];

      console.log(`[Repository] Attempting to set setting. Key: ${key}, Value: ${value}`); // +++ 添加日志 +++
      console.log(`[Repository] Executing SQL: ${sql} with params: ${JSON.stringify(params)}`); // +++ 添加日志 +++

      db.run(
        sql,
        params,
        function (this: any, err: any) { // 使用 this 需要 function 声明, 添加 err 类型
          if (err) {
            console.error(`[Repository] 设置设置项 ${key} 时出错:`, err); // 更新日志为中文
            reject(new Error(`设置设置项 ${key} 失败`)); // 更新错误消息为中文
          } else {
            // this.changes 提供了受影响的行数 (对于 INSERT/UPDATE)
            console.log(`[Repository] Successfully set setting for key: ${key}. Rows affected: ${this.changes}`); // +++ 添加日志 +++
            resolve();
          }
        }
      );
    });
  },

  async deleteSetting(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[Repository] Attempting to delete setting with key: ${key}`); // +++ 添加日志 +++
      db.run('DELETE FROM settings WHERE key = ?', [key], function (this: any, err: any) { // 添加 err 类型
        if (err) {
          console.error(`[Repository] 删除设置项 ${key} 时出错:`, err); // 更新日志为中文
          reject(new Error(`删除设置项 ${key} 失败`)); // 更新错误消息为中文
        } else {
          console.log(`[Repository] Successfully deleted setting for key: ${key}. Rows affected: ${this.changes}`); // +++ 添加日志 +++
          resolve();
        }
      });
    });
  },

  async setMultipleSettings(settings: Record<string, string>): Promise<void> {
    console.log('[Repository] setMultipleSettings called with:', JSON.stringify(settings)); // +++ 添加日志 +++
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting(key, value) // this 指向 settingsRepository 对象
    );
    await Promise.all(promises);
    console.log('[Repository] setMultipleSettings finished.'); // +++ 添加日志 +++
  },
};
