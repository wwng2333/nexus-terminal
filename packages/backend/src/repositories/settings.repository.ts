// packages/backend/src/repositories/settings.repository.ts
import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection'; // Import new async helpers

// Remove top-level db instance
// const db = getDb();

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
