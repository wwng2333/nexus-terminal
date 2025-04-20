import { Database } from 'sqlite3';
import * as schemaSql from './schema';
import * as appearanceRepository from '../repositories/appearance.repository';
import * as terminalThemeRepository from '../repositories/terminal-theme.repository';
import { presetTerminalThemes } from '../config/preset-themes-definition';
import { runDb } from './connection'; // Import runDb for init functions

/**
 * Interface describing a database table definition for initialization.
 */
export interface TableDefinition {
    name: string;
    sql: string;
    init?: (db: Database) => Promise<void>; // Optional initialization function
}

// --- Initialization Functions ---

/**
 * Initializes default settings in the settings table.
 */
const initSettingsTable = async (db: Database): Promise<void> => {
    const defaultSettings = [
        { key: 'ipWhitelistEnabled', value: 'false' },
        { key: 'ipWhitelist', value: '' }
    ];
    for (const setting of defaultSettings) {
        // Use INSERT OR IGNORE to avoid errors if settings already exist
        await runDb(db, "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [setting.key, setting.value]);
    }
    console.log('[DB Init] 默认 settings 初始化检查完成。');
};

/**
 * Initializes preset terminal themes.
 * Assumes terminalThemeRepository.initializePresetThemes might need the db instance.
 */
const initTerminalThemesTable = async (db: Database): Promise<void> => {
    // Pass the db instance to the repository function
    // Note: This might require modifying initializePresetThemes if it doesn't accept db
    await terminalThemeRepository.initializePresetThemes(db, presetTerminalThemes);
    console.log('[DB Init] 预设主题初始化检查完成。');
};

/**
 * Ensures default appearance settings exist.
 * Assumes appearanceRepository.ensureDefaultSettingsExist might need the db instance.
 */
const initAppearanceSettingsTable = async (db: Database): Promise<void> => {
    // Pass the db instance to the repository function
    // Note: This might require modifying ensureDefaultSettingsExist if it doesn't accept db
    await appearanceRepository.ensureDefaultSettingsExist(db);
    console.log('[DB Init] 外观设置初始化检查完成。');
};


// --- Table Definitions Registry ---

/**
 * Array containing definitions for all tables to be created and initialized.
 * The order might matter if there are strict foreign key dependencies without ON DELETE/UPDATE clauses,
 * but CREATE IF NOT EXISTS makes it generally safe. Initialization order might also matter.
 */
export const tableDefinitions: TableDefinition[] = [
    // Core settings and logs first
    {
        name: 'settings',
        sql: schemaSql.createSettingsTableSQL,
        init: initSettingsTable
    },
    { name: 'audit_logs', sql: schemaSql.createAuditLogsTableSQL },
    { name: 'api_keys', sql: schemaSql.createApiKeysTableSQL },
    { name: 'passkeys', sql: schemaSql.createPasskeysTableSQL },
    { name: 'notification_settings', sql: schemaSql.createNotificationSettingsTableSQL },
    { name: 'users', sql: schemaSql.createUsersTableSQL },

    // Features like proxies, connections, tags
    { name: 'proxies', sql: schemaSql.createProxiesTableSQL },
    { name: 'connections', sql: schemaSql.createConnectionsTableSQL }, // Depends on proxies
    { name: 'tags', sql: schemaSql.createTagsTableSQL },
    { name: 'connection_tags', sql: schemaSql.createConnectionTagsTableSQL }, // Depends on connections, tags

    // Other utilities
    { name: 'ip_blacklist', sql: schemaSql.createIpBlacklistTableSQL },
    { name: 'command_history', sql: schemaSql.createCommandHistoryTableSQL },
    { name: 'quick_commands', sql: schemaSql.createQuickCommandsTableSQL },

    // Appearance related tables (often depend on others or have init logic)
    {
        name: 'terminal_themes',
        sql: schemaSql.createTerminalThemesTableSQL,
        init: initTerminalThemesTable
    },
    {
        name: 'appearance_settings',
        sql: schemaSql.createAppearanceSettingsTableSQL,
        init: initAppearanceSettingsTable
     }, // Depends on terminal_themes
];