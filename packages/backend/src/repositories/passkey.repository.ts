import { Database } from 'sqlite3';
import { getDb } from '../database';

// 定义 Passkey 数据库记录的接口
export interface PasskeyRecord {
    id: number;
    credential_id: string; // Base64URL encoded
    public_key: string;    // Base64URL encoded
    counter: number;
    transports: string | null; // JSON string or null
    name: string | null;
    created_at: number;
    updated_at: number;
}

export class PasskeyRepository {
    private db: Database;

    constructor() {
        this.db = getDb();
    }

    /**
     * 保存新的 Passkey 凭证
     * @param credentialId Base64URL 编码的凭证 ID
     * @param publicKey Base64URL 编码的公钥
     * @param counter 签名计数器
     * @param transports 传输方式 (JSON 字符串)
     * @param name 用户提供的名称 (可选)
     * @returns Promise<number> 新插入记录的 ID
     */
    async savePasskey(
        credentialId: string,
        publicKey: string,
        counter: number,
        transports: string | null,
        name?: string
    ): Promise<number> {
        const sql = `
            INSERT INTO passkeys (credential_id, public_key, counter, transports, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [credentialId, publicKey, counter, transports, name ?? null], function (err) {
                if (err) {
                    console.error('保存 Passkey 时出错:', err.message);
                    return reject(new Error(`保存 Passkey 时出错: ${err.message}`));
                }
                resolve(this.lastID);
            });
        });
    }

    /**
     * 根据 Credential ID 获取 Passkey 记录
     * @param credentialId Base64URL 编码的凭证 ID
     * @returns Promise<PasskeyRecord | null> 找到的记录或 null
     */
    async getPasskeyByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
        const sql = `SELECT * FROM passkeys WHERE credential_id = ?`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [credentialId], (err, row: PasskeyRecord) => {
                if (err) {
                    console.error('按 Credential ID 获取 Passkey 时出错:', err.message);
                    return reject(new Error(`按 Credential ID 获取 Passkey 时出错: ${err.message}`));
                }
                resolve(row || null);
            });
        });
    }

    /**
     * 获取所有已注册的 Passkey 记录
     * @returns Promise<PasskeyRecord[]> 所有记录的数组
     */
    async getAllPasskeys(): Promise<PasskeyRecord[]> {
        const sql = `SELECT id, credential_id, name, transports, created_at FROM passkeys ORDER BY created_at DESC`; // 仅选择必要字段
        return new Promise((resolve, reject) => {
            this.db.all(sql, [], (err, rows: PasskeyRecord[]) => {
                if (err) {
                    console.error('获取所有 Passkey 时出错:', err.message);
                    return reject(new Error(`获取所有 Passkey 时出错: ${err.message}`));
                }
                resolve(rows);
            });
        });
    }

    /**
     * 更新 Passkey 的签名计数器
     * @param credentialId Base64URL 编码的凭证 ID
     * @param newCounter 新的计数器值
     * @returns Promise<void>
     */
    async updatePasskeyCounter(credentialId: string, newCounter: number): Promise<void> {
        const sql = `UPDATE passkeys SET counter = ?, updated_at = strftime('%s', 'now') WHERE credential_id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [newCounter, credentialId], function (err) {
                if (err) {
                    console.error('更新 Passkey 计数器时出错:', err.message);
                    return reject(new Error(`更新 Passkey 计数器时出错: ${err.message}`));
                }
                if (this.changes === 0) {
                    return reject(new Error(`未找到 Credential ID 为 ${credentialId} 的 Passkey 进行更新`));
                }
                resolve();
            });
        });
    }

     /**
     * 根据 ID 删除 Passkey
     * @param id Passkey 记录的 ID
     * @returns Promise<void>
     */
     async deletePasskeyById(id: number): Promise<void> {
        const sql = `DELETE FROM passkeys WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [id], function (err) {
                if (err) {
                    console.error('按 ID 删除 Passkey 时出错:', err.message);
                    return reject(new Error(`按 ID 删除 Passkey 时出错: ${err.message}`));
                }
                if (this.changes === 0) {
                    return reject(new Error(`未找到 ID 为 ${id} 的 Passkey 进行删除`));
                }
                console.log(`ID 为 ${id} 的 Passkey 已删除。`);
                resolve();
            });
        });
    }

    /**
     * 根据 Credential ID 删除 Passkey
     * @param credentialId Base64URL 编码的凭证 ID
     * @returns Promise<void>
     */
    async deletePasskeyByCredentialId(credentialId: string): Promise<void> {
        const sql = `DELETE FROM passkeys WHERE credential_id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [credentialId], function (err) {
                if (err) {
                    console.error('按 Credential ID 删除 Passkey 时出错:', err.message);
                    return reject(new Error(`按 Credential ID 删除 Passkey 时出错: ${err.message}`));
                }
                 if (this.changes === 0) {
                    // It's possible the user tries to delete a non-existent key, maybe not an error?
                    console.warn(`尝试删除不存在的 Credential ID: ${credentialId}`);
                } else {
                    console.log(`Credential ID 为 ${credentialId} 的 Passkey 已删除。`);
                }
                resolve();
            });
        });
    }

    /**
     * 根据 credential_id 或 name 前缀模糊查找 Passkey 记录（自动补全）
     * @param prefix 前缀字符串
     * @returns Promise<PasskeyRecord[]> 匹配的记录数组
     */
    async searchPasskeyByPrefix(prefix: string): Promise<PasskeyRecord[]> {
        const sql = `SELECT * FROM passkeys WHERE credential_id LIKE ? OR name LIKE ? ORDER BY created_at DESC`;
        const likePrefix = `${prefix}%`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [likePrefix, likePrefix], (err, rows: PasskeyRecord[]) => {
                if (err) {
                    console.error('模糊查找 Passkey 时出错:', err.message);
                    return reject(new Error(`模糊查找 Passkey 时出错: ${err.message}`));
                }
                resolve(rows);
            });
        });
    }
}
