import { Database } from 'sqlite3';
import { getDb } from '../database';
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
    } catch (error) {
        console.error(`Error parsing notification setting ID ${raw.id}:`, error);
        // Return a default/error state or re-throw, depending on desired handling
        // For now, return partially parsed with defaults for JSON fields
        // Cast to satisfy type checker, but this indicates a parsing error.
        return {
            ...raw,
            enabled: Boolean(raw.enabled),
            config: {} as NotificationChannelConfig, // Config is invalid due to parsing error
            enabled_events: [],
        };
    }
};

export class NotificationSettingsRepository {
    private db: Database;

    constructor() {
        this.db = getDb();
    }

    async getAll(): Promise<NotificationSetting[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM notification_settings ORDER BY created_at ASC', (err, rows: RawNotificationSetting[]) => {
                if (err) {
                    return reject(new Error(`Error fetching notification settings: ${err.message}`));
                }
                resolve(rows.map(parseRawSetting));
            });
        });
    }

    async getById(id: number): Promise<NotificationSetting | null> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM notification_settings WHERE id = ?', [id], (err, row: RawNotificationSetting) => {
                if (err) {
                    return reject(new Error(`Error fetching notification setting by ID ${id}: ${err.message}`));
                }
                resolve(row ? parseRawSetting(row) : null);
            });
        });
    }

    async getEnabledByEvent(event: NotificationEvent): Promise<NotificationSetting[]> {
         return new Promise((resolve, reject) => {
            // Note: This query is inefficient as it fetches all enabled settings and filters in code.
            // For better performance with many settings, consider normalizing enabled_events
            // or using JSON functions if the SQLite version supports them well.
            this.db.all('SELECT * FROM notification_settings WHERE enabled = 1', (err, rows: RawNotificationSetting[]) => {
                if (err) {
                    return reject(new Error(`Error fetching enabled notification settings: ${err.message}`));
                }
                const parsedRows = rows.map(parseRawSetting);
                const filteredRows = parsedRows.filter(setting => setting.enabled_events.includes(event));
                resolve(filteredRows);
            });
        });
    }

    async create(setting: Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const sql = `
            INSERT INTO notification_settings (channel_type, name, enabled, config, enabled_events)
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [
            setting.channel_type,
            setting.name,
            setting.enabled ? 1 : 0,
            JSON.stringify(setting.config || {}),
            JSON.stringify(setting.enabled_events || [])
        ];
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) { // Use function() to access this.lastID
                if (err) {
                    return reject(new Error(`Error creating notification setting: ${err.message}`));
                }
                resolve(this.lastID);
            });
        });
    }

    async update(id: number, setting: Partial<Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
        // Build the SET part of the query dynamically
        const fields: string[] = [];
        const params: (string | number | null)[] = [];

        if (setting.channel_type !== undefined) {
            fields.push('channel_type = ?');
            params.push(setting.channel_type);
        }
        if (setting.name !== undefined) {
            fields.push('name = ?');
            params.push(setting.name);
        }
        if (setting.enabled !== undefined) {
            fields.push('enabled = ?');
            params.push(setting.enabled ? 1 : 0);
        }
        if (setting.config !== undefined) {
            fields.push('config = ?');
            params.push(JSON.stringify(setting.config || {}));
        }
        if (setting.enabled_events !== undefined) {
            fields.push('enabled_events = ?');
            params.push(JSON.stringify(setting.enabled_events || []));
        }

        if (fields.length === 0) {
            return Promise.resolve(true); // Nothing to update
        }

        fields.push('updated_at = strftime(\'%s\', \'now\')'); // Always update timestamp

        const sql = `UPDATE notification_settings SET ${fields.join(', ')} WHERE id = ?`;
        params.push(id);

        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) { // Use function() to access this.changes
                if (err) {
                    return reject(new Error(`Error updating notification setting ID ${id}: ${err.message}`));
                }
                resolve(this.changes > 0);
            });
        });
    }

    async delete(id: number): Promise<boolean> {
        const sql = 'DELETE FROM notification_settings WHERE id = ?';
        return new Promise((resolve, reject) => {
            this.db.run(sql, [id], function (err) { // Use function() to access this.changes
                if (err) {
                    return reject(new Error(`Error deleting notification setting ID ${id}: ${err.message}`));
                }
                resolve(this.changes > 0);
            });
        });
    }
}
