import { Database } from 'sqlite3';
import { getDb } from '../database';
import { AuditLogEntry, AuditLogActionType } from '../types/audit.types';

export class AuditLogRepository {
    private db: Database;

    constructor() {
        this.db = getDb();
    }

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
            } catch (error) {
                console.error(`[Audit Log] Failed to stringify details for action ${actionType}:`, error);
                detailsString = JSON.stringify({ error: 'Failed to stringify details', originalDetails: details });
            }
        }

        const sql = 'INSERT INTO audit_logs (timestamp, action_type, details) VALUES (?, ?, ?)';
        const params = [timestamp, actionType, detailsString];

        return new Promise((resolve, reject) => {
            this.db.run(sql, params, (err) => {
                if (err) {
                    console.error(`[Audit Log] Error adding log entry for action ${actionType}: ${err.message}`);
                    // 不拒绝 Promise，记录日志失败不应阻止核心操作
                    // 但可以在这里触发一个 SERVER_ERROR 通知或日志
                    resolve(); // Or potentially reject if logging is critical
                } else {
                    // console.log(`[Audit Log] Logged action: ${actionType}`); // Optional: verbose logging
                    resolve();
                }
            });
        });
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

        if (actionType) {
            whereClauses.push('action_type = ?');
            params.push(actionType);
            countParams.push(actionType);
        }
        if (startDate) {
            whereClauses.push('timestamp >= ?');
            params.push(startDate);
            countParams.push(startDate);
        }
        if (endDate) {
            whereClauses.push('timestamp <= ?');
            params.push(endDate);
            countParams.push(endDate);
        }

        if (whereClauses.length > 0) {
            const whereSql = ` WHERE ${whereClauses.join(' AND ')}`;
            baseSql += whereSql;
            countSql += whereSql;
        }

        baseSql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return new Promise((resolve, reject) => {
            // First get the total count
            this.db.get(countSql, countParams, (err, row: { total: number }) => {
                if (err) {
                    return reject(new Error(`Error counting audit logs: ${err.message}`));
                }
                const total = row.total;

                // Then get the paginated logs
                this.db.all(baseSql, params, (err, rows: AuditLogEntry[]) => {
                    if (err) {
                        return reject(new Error(`Error fetching audit logs: ${err.message}`));
                    }
                    resolve({ logs: rows, total });
                });
            });
        });
    }
}
