// packages/backend/src/repositories/notification.repository.ts
import { Database } from 'sqlite3';
// Import new async helpers and the instance getter
import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection';
import { NotificationSetting, RawNotificationSetting, NotificationChannelType, NotificationEvent, NotificationChannelConfig } from '../types/notification.types';

// Helper to parse raw data from DB
const parseRawSetting = (raw: RawNotificationSetting): NotificationSetting => {
    try {
        return {
            ...raw,
            enabled: Boolean(raw.enabled),
            config: JSON.parse(raw.config || '{}'),
            enabled_events: JSON.parse(raw.enabled_events || '[]'),
        };
    } catch (error: any) { // Add type annotation
        console.error(`Error parsing notification setting ID ${raw.id}:`, error.message);
        return {
            ...raw,
            enabled: Boolean(raw.enabled),
            config: {} as NotificationChannelConfig, // Indicate parsing error
            enabled_events: [],
        };
    }
};

export class NotificationSettingsRepository {
    // Remove constructor or leave it empty
    // constructor() { }

    async getAll(): Promise<NotificationSetting[]> {
        try {
            const db = await getDbInstance();
            const rows = await allDb<RawNotificationSetting>(db, 'SELECT * FROM notification_settings ORDER BY created_at ASC');
            return rows.map(parseRawSetting);
        } catch (err: any) {
            console.error(`Error fetching notification settings:`, err.message);
            throw new Error(`Error fetching notification settings: ${err.message}`);
        }
    }

    async getById(id: number): Promise<NotificationSetting | null> {
        try {
            const db = await getDbInstance();
            const row = await getDbRow<RawNotificationSetting>(db, 'SELECT * FROM notification_settings WHERE id = ?', [id]);
            return row ? parseRawSetting(row) : null;
        } catch (err: any) {
            console.error(`Error fetching notification setting by ID ${id}:`, err.message);
            throw new Error(`Error fetching notification setting by ID ${id}: ${err.message}`);
        }
    }

    async getEnabledByEvent(event: NotificationEvent): Promise<NotificationSetting[]> {
        // Note: Query remains inefficient, consider optimization later if needed.
        try {
            const db = await getDbInstance();
            const rows = await allDb<RawNotificationSetting>(db, 'SELECT * FROM notification_settings WHERE enabled = 1');
            const parsedRows = rows.map(parseRawSetting);
            const filteredRows = parsedRows.filter(setting => setting.enabled_events.includes(event));
            return filteredRows;
        } catch (err: any) {
            console.error(`Error fetching enabled notification settings:`, err.message);
            throw new Error(`Error fetching enabled notification settings: ${err.message}`);
        }
    }

    async create(setting: Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const sql = `
            INSERT INTO notification_settings (channel_type, name, enabled, config, enabled_events, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `; // Added created_at, updated_at
        const params = [
            setting.channel_type,
            setting.name ?? '', // Ensure name is not undefined
            setting.enabled ? 1 : 0,
            JSON.stringify(setting.config || {}),
            JSON.stringify(setting.enabled_events || [])
        ];
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, params);
            // Ensure lastID is valid before returning
            if (typeof result.lastID !== 'number' || result.lastID <= 0) {
                 throw new Error('创建通知设置后未能获取有效的 lastID');
            }
            return result.lastID;
        } catch (err: any) {
            console.error(`Error creating notification setting:`, err.message);
            throw new Error(`Error creating notification setting: ${err.message}`);
        }
    }

    async update(id: number, setting: Partial<Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
        // Build the SET part of the query dynamically
        const fields: string[] = [];
        const params: (string | number | null)[] = [];

        // Dynamically build SET clauses
        if (setting.channel_type !== undefined) { fields.push('channel_type = ?'); params.push(setting.channel_type); }
        if (setting.name !== undefined) { fields.push('name = ?'); params.push(setting.name); }
        if (setting.enabled !== undefined) { fields.push('enabled = ?'); params.push(setting.enabled ? 1 : 0); }
        if (setting.config !== undefined) { fields.push('config = ?'); params.push(JSON.stringify(setting.config || {})); }
        if (setting.enabled_events !== undefined) { fields.push('enabled_events = ?'); params.push(JSON.stringify(setting.enabled_events || [])); }

        if (fields.length === 0) {
            console.warn(`[NotificationRepo] update called for ID ${id} with no fields to update.`);
            return true; // Or false, depending on desired behavior for no-op update
        }

        fields.push('updated_at = strftime(\'%s\', \'now\')'); // Always update timestamp

        const sql = `UPDATE notification_settings SET ${fields.join(', ')} WHERE id = ?`;
        params.push(id);

        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, params);
            return result.changes > 0;
        } catch (err: any) {
            console.error(`Error updating notification setting ID ${id}:`, err.message);
            throw new Error(`Error updating notification setting ID ${id}: ${err.message}`);
        }
    }

    async delete(id: number): Promise<boolean> {
        const sql = 'DELETE FROM notification_settings WHERE id = ?';
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, [id]);
            return result.changes > 0;
        } catch (err: any) {
            console.error(`Error deleting notification setting ID ${id}:`, err.message);
            throw new Error(`Error deleting notification setting ID ${id}: ${err.message}`);
        }
    }
}

// Export the class (Removed redundant export below as class is already exported)
// export { NotificationSettingsRepository };
