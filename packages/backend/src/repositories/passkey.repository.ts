import { getDbInstance, runDb, getDb as getDbRow, allDb } from '../database/connection';

// 定义 Passkey 数据库记录的接口
export interface PasskeyRecord {
    id: number;
    credential_id: string; // Base64URL encoded
    public_key: string;    // Base64URL encoded
    counter: number;
    transports: string | null;
    name: string | null;
    created_at: number;
    updated_at: number;
}


type DbPasskeyRow = PasskeyRecord;

export class PasskeyRepository {

    /**
     * 保存新的 Passkey 凭证
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
        const params = [credentialId, publicKey, counter, transports, name ?? null];
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, params);
            // Ensure lastID is valid before returning
            if (typeof result.lastID !== 'number' || result.lastID <= 0) {
                 throw new Error('保存 Passkey 后未能获取有效的 lastID');
            }
            return result.lastID;
        } catch (err: any) {
            console.error('保存 Passkey 时出错:', err.message);
            if (err.message.includes('UNIQUE constraint failed')) {
                 throw new Error(`Credential ID "${credentialId}" 已存在。`);
            }
            throw new Error(`保存 Passkey 时出错: ${err.message}`);
        }
    }

    /**
     * 根据 Credential ID 获取 Passkey 记录
     * @returns Promise<PasskeyRecord | null> 找到的记录或 null
     */
    async getPasskeyByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
        const sql = `SELECT * FROM passkeys WHERE credential_id = ?`;
        try {
            const db = await getDbInstance();
            const row = await getDbRow<DbPasskeyRow>(db, sql, [credentialId]);
            return row || null;
        } catch (err: any) {
            console.error('按 Credential ID 获取 Passkey 时出错:', err.message);
            throw new Error(`按 Credential ID 获取 Passkey 时出错: ${err.message}`);
        }
    }

    /**
     * 获取所有已注册的 Passkey 记录 (仅选择必要字段)
     * @returns Promise<Partial<PasskeyRecord>[]> 所有记录的部分信息的数组
     */
    async getAllPasskeys(): Promise<Array<Pick<PasskeyRecord, 'id' | 'credential_id' | 'name' | 'transports' | 'created_at'>>> {
        const sql = `SELECT id, credential_id, name, transports, created_at FROM passkeys ORDER BY created_at DESC`;
        try {
            const db = await getDbInstance();
            const rows = await allDb<Pick<PasskeyRecord, 'id' | 'credential_id' | 'name' | 'transports' | 'created_at'>>(db, sql);
            return rows;
        } catch (err: any) {
            console.error('获取所有 Passkey 时出错:', err.message);
            throw new Error(`获取所有 Passkey 时出错: ${err.message}`);
        }
    }

    /**
     * 更新 Passkey 的签名计数器
     * @returns Promise<void>
     */
    async updatePasskeyCounter(credentialId: string, newCounter: number): Promise<void> {
        const sql = `UPDATE passkeys SET counter = ?, updated_at = strftime('%s', 'now') WHERE credential_id = ?`;
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, [newCounter, credentialId]);
            if (result.changes === 0) {
                // Consider if this should be an error or just a warning/no-op
                console.warn(`未找到 Credential ID 为 ${credentialId} 的 Passkey 进行计数器更新`);
                // throw new Error(`未找到 Credential ID 为 ${credentialId} 的 Passkey 进行更新`);
            }
        } catch (err: any) {
            console.error('更新 Passkey 计数器时出错:', err.message);
            throw new Error(`更新 Passkey 计数器时出错: ${err.message}`);
        }
    }

     /**
     * 根据 ID 删除 Passkey
     * @returns Promise<boolean> 是否成功删除
     */
     async deletePasskeyById(id: number): Promise<boolean> {
        const sql = `DELETE FROM passkeys WHERE id = ?`;
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, [id]);
             if (result.changes > 0) {
                 console.log(`ID 为 ${id} 的 Passkey 已删除。`);
                 return true;
             } else {
                 console.warn(`尝试删除不存在的 Passkey ID: ${id}`);
                 return false;
             }
        } catch (err: any) {
            console.error('按 ID 删除 Passkey 时出错:', err.message);
            throw new Error(`按 ID 删除 Passkey 时出错: ${err.message}`);
        }
    }

    /**
     * 根据 Credential ID 删除 Passkey
     * @returns Promise<boolean> 是否成功删除
     */
    async deletePasskeyByCredentialId(credentialId: string): Promise<boolean> {
        const sql = `DELETE FROM passkeys WHERE credential_id = ?`;
        try {
            const db = await getDbInstance();
            const result = await runDb(db, sql, [credentialId]);
            if (result.changes > 0) {
                console.log(`Credential ID 为 ${credentialId} 的 Passkey 已删除。`);
                return true;
            } else {
                console.warn(`尝试删除不存在的 Credential ID: ${credentialId}`);
                return false;
            }
        } catch (err: any) {
            console.error('按 Credential ID 删除 Passkey 时出错:', err.message);
            throw new Error(`按 Credential ID 删除 Passkey 时出错: ${err.message}`);
        }
    }

    /**
     * 根据 credential_id 或 name 前缀模糊查找 Passkey 记录（自动补全）
     * @returns Promise<PasskeyRecord[]> 匹配的记录数组
     */
    // Adjust return type based on selected columns if not selecting all (*)
    async searchPasskeyByPrefix(prefix: string): Promise<DbPasskeyRow[]> {
        const sql = `SELECT * FROM passkeys WHERE credential_id LIKE ? OR name LIKE ? ORDER BY created_at DESC`;
        const likePrefix = `${prefix}%`;
        try {
            const db = await getDbInstance();
            const rows = await allDb<DbPasskeyRow>(db, sql, [likePrefix, likePrefix]);
            return rows;
        } catch (err: any) {
            console.error('模糊查找 Passkey 时出错:', err.message);
            throw new Error(`模糊查找 Passkey 时出错: ${err.message}`);
        }
    }
}

