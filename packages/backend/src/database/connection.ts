// packages/backend/src/database/connection.ts
import sqlite3, { OPEN_READWRITE, OPEN_CREATE } from 'sqlite3'; // Import flags
import path from 'path';
import fs from 'fs';
import * as schema from './schema';
// Import the table definitions registry instead of individual repositories here
import { tableDefinitions } from './schema.registry';
// presetTerminalThemes might still be needed if passed directly, but likely handled in registry now
// import { presetTerminalThemes } from '../config/preset-themes-definition';

// --- Revert to original path and filename ---
// 使用 process.cwd() 获取项目根目录，然后拼接路径，确保路径一致性
console.log('[Connection CWD]', process.cwd()); // 添加 CWD 日志
const dbDir = path.join(process.cwd(), 'data'); // Correct path relative to CWD (packages/backend)
const dbFilename = 'nexus-terminal.db'; // Revert to original filename
const dbPath = path.join(dbDir, dbFilename);
console.log(`[DB Path] Determined database directory: ${dbDir}`);
console.log(`[DB Path] Determined database file path: ${dbPath}`);

// Add logging before checking/creating directory
console.log(`[DB FS] Checking existence of directory: ${dbDir}`);
if (!fs.existsSync(dbDir)) {
    console.log(`[DB FS] Directory does not exist. Attempting to create: ${dbDir}`);
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`[DB FS] Directory successfully created: ${dbDir}`);
    } catch (mkdirErr: any) {
        console.error(`[DB FS] Failed to create directory ${dbDir}:`, mkdirErr.message);
        // Consider throwing error here to prevent proceeding if directory creation fails
        throw new Error(`Failed to create database directory: ${mkdirErr.message}`);
    }
} else {
    console.log(`[DB FS] Directory already exists: ${dbDir}`);
}

const verboseSqlite3 = sqlite3.verbose();
let dbInstancePromise: Promise<sqlite3.Database> | null = null;

// --- Promisified Database Operations ---

interface RunResult {
    lastID: number;
    changes: number;
}

/**
 * Promisified version of db.run(). Resolves with { lastID, changes }.
 */
export const runDb = (db: sqlite3.Database, sql: string, params: any[] = []): Promise<RunResult> => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err: Error | null) { // Use function() to access this
            if (err) {
                console.error(`[DB Error] SQL: ${sql.substring(0, 100)}... Params: ${JSON.stringify(params)} Error: ${err.message}`);
                reject(err);
            } else {
                // 'this' context provides lastID and changes for INSERT/UPDATE/DELETE
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};

/**
 * Promisified version of db.get(). Resolves with the row found, or undefined.
 */
export const getDb = <T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T | undefined> => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err: Error | null, row: T) => { // Add type annotation for row
            if (err) {
                console.error(`[DB Error] SQL: ${sql.substring(0, 100)}... Params: ${JSON.stringify(params)} Error: ${err.message}`);
                reject(err);
            } else {
                resolve(row); // row will be undefined if not found
            }
        });
    });
};

/**
 * Promisified version of db.all(). Resolves with an array of rows found.
 */
export const allDb = <T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err: Error | null, rows: T[]) => { // Add type annotation for rows
            if (err) {
                console.error(`[DB Error] SQL: ${sql.substring(0, 100)}... Params: ${JSON.stringify(params)} Error: ${err.message}`);
                reject(err);
            } else {
                resolve(rows); // rows will be an empty array if no matches
            }
        });
    });
};


/**
 * Executes the database initialization sequence: creates all tables, inserts preset/default data.
 * Now returns a Promise that resolves when all initializations are complete.
 * @param db The database instance
 */
const runDatabaseInitializations = async (db: sqlite3.Database): Promise<void> => {
    console.log('[DB Init] 开始数据库初始化序列...');

    try {
        // 1. Enable foreign key constraints
        await runDb(db, 'PRAGMA foreign_keys = ON;'); // Use promisified runDb
        console.log('[DB Init] 外键约束已启用。');

        // 2. Create tables and run initializations based on the registry
        for (const tableDef of tableDefinitions) {
            await runDb(db, tableDef.sql); // Create table (IF NOT EXISTS)
            console.log(`[DB Init] ${tableDef.name} 表已存在或已创建。`);
            if (tableDef.init) {
                // Pass the db instance to the init function
                await tableDef.init(db);
            }
        }

        // Migrations (if any) would run after initial schema setup
        // import { runMigrations } from './migrations';
        // await runMigrations(db);
        // console.log('[DB Init] 迁移检查完成。');

        console.log('[DB Init] 数据库初始化序列成功完成。');

    } catch (error) {
        console.error('[DB Init] 数据库初始化序列失败:', error);
        // Propagate the error to stop the application startup in index.ts
        throw error;
    }
};

/**
 * Gets the database instance. Initializes the connection and runs initializations if not already done.
 * Returns a Promise that resolves with the database instance once ready.
 */
// Renamed original getDb to getDbInstance to avoid confusion with the promisified getDb helper
export const getDbInstance = (): Promise<sqlite3.Database> => {
    if (!dbInstancePromise) {
        dbInstancePromise = new Promise((resolve, reject) => {
            // Remove connectionFailed flag and double check logic

            // Add logging before attempting connection
            console.log(`[DB Connection] Attempting to connect/open database file with explicit create flag: ${dbPath}`);
            // Explicitly add OPEN_READWRITE and OPEN_CREATE flags
            const db = new verboseSqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => { // Mark callback as async
                // --- Strict Error Check FIRST ---
                if (err) {
                    console.error(`[DB Connection] Error opening database file ${dbPath}:`, err.message);
                    // connectionFailed = true; // Remove flag setting
                    dbInstancePromise = null; // Reset promise on error
                    reject(err); // Reject the main promise
                    return; // Explicitly return
                }
                // --- End Strict Error Check ---

                // Remove Double Check Flag logic

                // If no error, proceed with success logging and initialization
                console.log(`[DB Connection] Successfully connected to SQLite database: ${dbPath}`);
                try {
                    // Wait for initializations to complete
                    await runDatabaseInitializations(db);
                    console.log('[DB] Database initialization complete. Ready.');
                    resolve(db); // Resolve the main promise with the db instance
                } catch (initError) {
                    console.error('[DB] Initialization failed after connection, closing connection...');
                    // connectionFailed = true; // Remove flag setting
                    dbInstancePromise = null; // Reset promise on error
                    db.close((closeErr) => {
                        if (closeErr) console.error('[DB] Error closing connection after init failure:', closeErr.message);
                        reject(initError); // Reject with the initialization error
                    });
                    // process.exit(1); // Consider exiting on init failure
                }
            });
        });
    }
    return dbInstancePromise;
};

// Graceful shutdown remains the same, but it might need access to the resolved instance
// Consider a way to get the instance if needed during shutdown, e.g., a global variable set after promise resolution.
// For now, it checks the promise state indirectly.
process.on('SIGINT', async () => { // Mark as async if needed
    if (dbInstancePromise) {
        console.log('[DB] 收到 SIGINT，尝试关闭数据库连接...');
        try {
            // We need the actual instance, not the promise, to close
            // Let's assume if the promise exists, we try to resolve it to get the instance
            const db = await dbInstancePromise;
            db.close((err) => {
                if (err) {
                    console.error('[DB] 关闭数据库时出错:', err.message);
                } else {
                    console.log('[DB] 数据库连接已关闭。');
                }
                process.exit(err ? 1 : 0);
            });
        } catch (error) {
            console.error('[DB] 获取数据库实例以关闭时出错 (可能初始化失败):', error);
            process.exit(1);
        }
    } else {
        console.log('[DB] 收到 SIGINT，但数据库连接从未初始化或已失败。');
        process.exit(0);
    }
});

// Note: We now export getDbInstance (the promise for the connection)
// and the helper functions runDb, getDb, allDb.
// Files needing the db instance will call `const db = await getDbInstance();`
// and then use `await runDb(db, ...)` etc.
