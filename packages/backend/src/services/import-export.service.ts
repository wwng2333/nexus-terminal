import * as ConnectionRepository from '../repositories/connection.repository';
import * as ProxyRepository from '../repositories/proxy.repository';
import { getDb } from '../database'; // Need db instance for transaction

const db = getDb(); // Get db instance for transaction management

// Define structure for imported connection data (can be shared in types)
interface ImportedConnectionData {
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    encrypted_password?: string | null;
    encrypted_private_key?: string | null;
    encrypted_passphrase?: string | null;
    tag_ids?: number[];
    proxy?: {
        name: string;
        type: 'SOCKS5' | 'HTTP';
        host: string;
        port: number;
        username?: string | null;
        auth_method?: 'none' | 'password' | 'key';
        encrypted_password?: string | null;
        encrypted_private_key?: string | null;
        encrypted_passphrase?: string | null;
    } | null;
}

// Define structure for exported connection data (can be shared in types)
interface ExportedConnectionData extends Omit<ImportedConnectionData, 'id'> {
    // Exclude fields not needed for export like id, created_at etc.
}

// Define structure for import results
export interface ImportResult {
    successCount: number;
    failureCount: number;
    errors: { connectionName?: string; message: string }[];
}

/**
 * 导出所有连接配置
 */
export const exportConnections = async (): Promise<ExportedConnectionData[]> => {
    // 1. Fetch all connections with tags (basic info)
    // We need full connection info including encrypted fields and proxy details for export
    // Let's adapt the repository or add a new method if needed.
    // For now, let's assume findFullConnectionById can be adapted or a similar findAll method exists.
    // Re-using the logic from controller for now, ideally repo handles joins.

    const connectionsWithProxies = await new Promise<any[]>((resolve, reject) => {
        db.all(
            `SELECT
                c.id, c.name, c.host, c.port, c.username, c.auth_method,
                c.encrypted_password, c.encrypted_private_key, c.encrypted_passphrase,
                c.proxy_id,
                p.id as proxy_db_id, p.name as proxy_name, p.type as proxy_type,
                p.host as proxy_host, p.port as proxy_port, p.username as proxy_username,
                p.auth_method as proxy_auth_method,
                p.encrypted_password as proxy_encrypted_password,
                p.encrypted_private_key as proxy_encrypted_private_key,
                p.encrypted_passphrase as proxy_encrypted_passphrase
             FROM connections c
             LEFT JOIN proxies p ON c.proxy_id = p.id
             ORDER BY c.name ASC`,
            (err, rows: any[]) => {
                if (err) {
                    console.error('Service: 查询连接和代理信息以供导出时出错:', err.message);
                    return reject(new Error('导出连接失败：查询连接信息出错'));
                }
                resolve(rows);
            }
        );
    });

    const connectionTags = await new Promise<{[connId: number]: number[]}>((resolve, reject) => {
        db.all('SELECT connection_id, tag_id FROM connection_tags', (err, rows: {connection_id: number, tag_id: number}[]) => {
            if (err) {
                console.error('Service: 查询连接标签以供导出时出错:', err.message);
                return reject(new Error('导出连接失败：查询标签信息出错'));
            }
            const tagsMap: {[connId: number]: number[]} = {};
            rows.forEach(row => {
                if (!tagsMap[row.connection_id]) tagsMap[row.connection_id] = [];
                tagsMap[row.connection_id].push(row.tag_id);
            });
            resolve(tagsMap);
        });
    });

    // 2. Format data for export
    const formattedData: ExportedConnectionData[] = connectionsWithProxies.map(row => {
        const connection: ExportedConnectionData = {
            name: row.name,
            host: row.host,
            port: row.port,
            username: row.username,
            auth_method: row.auth_method,
            encrypted_password: row.encrypted_password,
            encrypted_private_key: row.encrypted_private_key,
            encrypted_passphrase: row.encrypted_passphrase,
            tag_ids: connectionTags[row.id] || [],
            proxy: null // Initialize proxy as null
        };

        if (row.proxy_db_id) {
            connection.proxy = {
                name: row.proxy_name,
                type: row.proxy_type,
                host: row.proxy_host,
                port: row.proxy_port,
                username: row.proxy_username,
                auth_method: row.proxy_auth_method,
                encrypted_password: row.proxy_encrypted_password,
                encrypted_private_key: row.proxy_encrypted_private_key,
                encrypted_passphrase: row.proxy_encrypted_passphrase,
            };
        }
        return connection;
    });

    return formattedData;
};


/**
 * 导入连接配置
 * @param fileBuffer Buffer containing the JSON file content
 */
export const importConnections = async (fileBuffer: Buffer): Promise<ImportResult> => {
    let importedData: ImportedConnectionData[];
    try {
        const fileContent = fileBuffer.toString('utf8');
        importedData = JSON.parse(fileContent);
        if (!Array.isArray(importedData)) {
            throw new Error('JSON 文件内容必须是一个数组。');
        }
    } catch (error: any) {
        console.error('Service: 解析导入文件失败:', error);
        throw new Error(`解析 JSON 文件失败: ${error.message}`); // Re-throw for controller
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: { connectionName?: string; message: string }[] = [];
    const connectionsToInsert: Omit<ConnectionRepository.FullConnectionData, 'id' | 'created_at' | 'updated_at' | 'last_connected_at'>[] = [];

    // Use a transaction for atomicity
    return new Promise<ImportResult>((resolveOuter, rejectOuter) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', async (beginErr: Error | null) => {
                if (beginErr) {
                    console.error('Service: 开始导入事务失败:', beginErr);
                    return rejectOuter(new Error(`开始事务失败: ${beginErr.message}`));
                }

                try {
                    // Process each connection data from the imported file
                    for (const connData of importedData) {
                        try {
                            // 1. Validate connection data (basic)
                            if (!connData.name || !connData.host || !connData.port || !connData.username || !connData.auth_method) {
                                throw new Error('缺少必要的连接字段 (name, host, port, username, auth_method)。');
                            }
                            if (connData.auth_method === 'password' && !connData.encrypted_password) {
                                throw new Error('密码认证缺少 encrypted_password。');
                            }
                            if (connData.auth_method === 'key' && !connData.encrypted_private_key) {
                                throw new Error('密钥认证缺少 encrypted_private_key。');
                            }
                            // Add more validation as needed

                            let proxyIdToUse: number | null = null;

                            // 2. Handle proxy (find or create)
                            if (connData.proxy) {
                                const proxyData = connData.proxy;
                                // Validate proxy data
                                if (!proxyData.name || !proxyData.type || !proxyData.host || !proxyData.port) {
                                    throw new Error('代理信息不完整 (缺少 name, type, host, port)。');
                                }
                                // Add more proxy validation if needed

                                // Try to find existing proxy
                                const existingProxy = await ProxyRepository.findProxyByNameTypeHostPort(proxyData.name, proxyData.type, proxyData.host, proxyData.port);

                                if (existingProxy) {
                                    proxyIdToUse = existingProxy.id;
                                } else {
                                    // Proxy doesn't exist, create it
                                    const newProxyData = {
                                        name: proxyData.name,
                                        type: proxyData.type,
                                        host: proxyData.host,
                                        port: proxyData.port,
                                        username: proxyData.username || null,
                                        auth_method: proxyData.auth_method || 'none',
                                        encrypted_password: proxyData.encrypted_password || null,
                                        encrypted_private_key: proxyData.encrypted_private_key || null,
                                        encrypted_passphrase: proxyData.encrypted_passphrase || null,
                                    };
                                    proxyIdToUse = await ProxyRepository.createProxy(newProxyData);
                                    console.log(`Service: 导入连接 ${connData.name}: 新代理 ${proxyData.name} 创建成功 (ID: ${proxyIdToUse})`);
                                }
                            }

                            // 3. Prepare connection data for bulk insert
                            connectionsToInsert.push({
                                name: connData.name,
                                host: connData.host,
                                port: connData.port,
                                username: connData.username,
                                auth_method: connData.auth_method,
                                encrypted_password: connData.encrypted_password || null,
                                encrypted_private_key: connData.encrypted_private_key || null,
                                encrypted_passphrase: connData.encrypted_passphrase || null,
                                proxy_id: proxyIdToUse,
                                // tag_ids will be handled separately after insertion
                            });

                        } catch (connError: any) {
                            // Error processing this specific connection
                            failureCount++;
                            errors.push({ connectionName: connData.name || '未知连接', message: connError.message });
                            console.warn(`Service: 处理导入连接 "${connData.name || '未知'}" 时出错: ${connError.message}`);
                        }
                    } // End for loop

                    // 4. Bulk insert connections
                    let insertedResults: { connectionId: number, originalData: any }[] = [];
                    if (connectionsToInsert.length > 0) {
                         insertedResults = await ConnectionRepository.bulkInsertConnections(connectionsToInsert);
                         successCount = insertedResults.length;
                    }

                    // 5. Associate tags for successfully inserted connections
                    for (const result of insertedResults) {
                        const originalTagIds = result.originalData?.tag_ids;
                        if (Array.isArray(originalTagIds) && originalTagIds.length > 0) {
                            const validTagIds = originalTagIds.filter((id: any) => typeof id === 'number' && id > 0);
                            if (validTagIds.length > 0) {
                                try {
                                    await ConnectionRepository.updateConnectionTags(result.connectionId, validTagIds);
                                } catch (tagError: any) {
                                    // Log warning but don't fail the entire import for tag association error
                                    console.warn(`Service: 导入连接 ${result.originalData.name}: 关联标签失败 (ID: ${result.connectionId}): ${tagError.message}`);
                                    // Optionally, add this to the 'errors' array reported back
                                    errors.push({ connectionName: result.originalData.name, message: `关联标签失败: ${tagError.message}` });
                                    // Decrement successCount or increment failureCount if tag failure should count as overall failure
                                    // failureCount++; // Example: Count tag failures
                                }
                            }
                        }
                    }


                    // 6. Commit or Rollback
                    if (failureCount > 0 && successCount === 0) { // Only rollback if ALL fail, or adjust logic as needed
                        console.warn(`Service: 导入连接存在 ${failureCount} 个错误，且无成功记录，正在回滚事务...`);
                        db.run('ROLLBACK', (rollbackErr: Error | null) => {
                            if (rollbackErr) console.error("Service: 回滚事务失败:", rollbackErr);
                            // Reject outer promise with collected errors
                            rejectOuter(new Error(`导入失败，存在 ${failureCount} 个错误。`));
                        });
                    } else {
                        // Commit even if some failed, report partial success
                        db.run('COMMIT', (commitErr: Error | null) => {
                            if (commitErr) {
                                console.error('Service: 提交导入事务时出错:', commitErr);
                                rejectOuter(new Error(`提交导入事务失败: ${commitErr.message}`));
                            } else {
                                console.log(`Service: 导入事务提交。成功: ${successCount}, 失败: ${failureCount}`);
                                resolveOuter({ successCount, failureCount, errors }); // Resolve outer promise
                            }
                        });
                    }

                } catch (innerError: any) {
                    // Catch errors during the process (e.g., bulk insert failure)
                    console.error('Service: 导入事务内部出错:', innerError);
                    db.run('ROLLBACK', (rollbackErr: Error | null) => {
                         if (rollbackErr) console.error("Service: 回滚事务失败:", rollbackErr);
                         rejectOuter(innerError); // Reject outer promise
                    });
                }
            }); // End BEGIN TRANSACTION
        }); // End db.serialize
    }); // End new Promise
};
