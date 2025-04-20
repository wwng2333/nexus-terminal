// packages/backend/src/repositories/audit.repository.ts
import { Database } from 'sqlite3';
// Import new async helpers and the instance getter
import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection';
import { AuditLogEntry, AuditLogActionType } from '../types/audit.types';

// Define the expected row structure from the database if it matches AuditLogEntry
type DbAuditLogRow = AuditLogEntry;

export class AuditLogRepository {
    // Remove constructor or leave it empty
    // constructor() { }

    /**
     * 添加一条审计日志记录
     * @param actionType 操作类型
     * @param details 可选的详细信息 (对象或字符串)
     */
    async addLog(actionType: AuditLogActionType, details?: Record<string, any> | string | null): Promise<void> {
        const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
        let detailsString: string | null = null;

        if (details) {
            try {
                detailsString = typeof details === 'string' ? details : JSON.stringify(details);
            } catch (error: any) {
                console.error(`[Audit Log] Failed to stringify details for action ${actionType}:`, error.message);
                detailsString = JSON.stringify({ error: 'Failed to stringify details', originalDetails: String(details) }); // Ensure originalDetails is stringifiable
            }
        }

        const sql = 'INSERT INTO audit_logs (timestamp, action_type, details) VALUES (?, ?, ?)';
        const params = [timestamp, actionType, detailsString];

        try {
            const db = await getDbInstance();
            await runDb(db, sql, params);
            // console.log(`[Audit Log] Logged action: ${actionType}`); // Optional: verbose logging
        } catch (err: any) {
            console.error(`[Audit Log] Error adding log entry for action ${actionType}: ${err.message}`);
            // Decide if logging failure should throw an error or just be logged
            // throw new Error(`Error adding log entry: ${err.message}`); // Uncomment to make it critical
        }
    }

    /**
     * 获取审计日志列表 (支持分页和基本过滤)
     * @param limit 每页数量
     * @param offset 偏移量
     * @param actionType 可选的操作类型过滤
     * @param startDate 可选的开始时间戳 (秒)
     * @param endDate 可选的结束时间戳 (秒)
     */
    async getLogs(
        limit: number = 50,
        offset: number = 0,
        actionType?: AuditLogActionType,
        startDate?: number,
        endDate?: number
    ): Promise<{ logs: AuditLogEntry[], total: number }> {
        let baseSql = 'SELECT * FROM audit_logs';
        let countSql = 'SELECT COUNT(*) as total FROM audit_logs';
        const whereClauses: string[] = [];
        const params: (string | number)[] = [];
        const countParams: (string | number)[] = [];

        if (actionType) { whereClauses.push('action_type = ?'); params.push(actionType); countParams.push(actionType); }
        if (startDate) { whereClauses.push('timestamp >= ?'); params.push(startDate); countParams.push(startDate); }
        if (endDate) { whereClauses.push('timestamp <= ?'); params.push(endDate); countParams.push(endDate); }

        if (whereClauses.length > 0) {
            const whereSql = ` WHERE ${whereClauses.join(' AND ')}`;
            baseSql += whereSql;
            countSql += whereSql;
        }

        baseSql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        try {
            const db = await getDbInstance();
            // First get the total count
            const countRow = await getDbRow<{ total: number }>(db, countSql, countParams);
            const total = countRow?.total ?? 0;

            // Then get the paginated logs
            const logs = await allDb<DbAuditLogRow>(db, baseSql, params);

            return { logs, total };
        } catch (err: any) {
            console.error(`Error fetching audit logs:`, err.message);
            throw new Error(`Error fetching audit logs: ${err.message}`);
        }
    }
}

// Export the class (Removed redundant export below as class is already exported)
// export { AuditLogRepository };
