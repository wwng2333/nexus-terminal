import crypto from 'crypto';

// 从环境变量获取加密密钥，提供一个不安全的默认值用于开发
// 警告：生产环境中必须设置一个强随机的 32 字节密钥 (例如通过 openssl rand -base64 32 生成)
const encryptionKeyEnv = process.env.ENCRYPTION_KEY;
if (!encryptionKeyEnv && process.env.NODE_ENV === 'production') {
    console.error('错误：生产环境中必须设置 ENCRYPTION_KEY 环境变量！');
    process.exit(1);
}
// 使用一个 32 字节的字符串作为不安全的开发默认值
const defaultDevKey = '12345678901234567890123456789012';
const encryptionKey = Buffer.from(
    encryptionKeyEnv || defaultDevKey,
    'utf8' // 或者 'base64' 如果环境变量是 base64 编码的
); // Buffer.from utf8 string of 32 chars is 32 bytes

// 重新检查，虽然 Buffer.from 应该保证了长度，但以防万一
if (encryptionKey.length !== 32) {
    console.error(`错误：加密密钥长度必须是 32 字节，当前长度为 ${encryptionKey.length}。`);
    process.exit(1);
}
if (!encryptionKeyEnv) { // 仅在未设置环境变量时显示警告
    console.warn('警告：正在使用默认的不安全加密密钥，请在生产环境中设置 ENCRYPTION_KEY 环境变量！');
}


const algorithm = 'aes-256-gcm';
const ivLength = 16; // GCM 推荐的 IV 长度为 12 或 16 字节
const tagLength = 16; // GCM 认证标签长度

/**
 * 加密文本 (例如连接密码)
 * @param text - 需要加密的明文
 * @returns Base64 编码的字符串，格式为 "iv:encrypted:tag"
 */
export const encrypt = (text: string): string => {
    try {
        const iv = crypto.randomBytes(ivLength);
        const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        // 将 iv、密文和认证标签组合并编码
        return Buffer.concat([iv, encrypted, tag]).toString('base64');
    } catch (error) {
        console.error('加密失败:', error);
        throw new Error('加密过程中发生错误');
    }
};

/**
 * 解密文本
 * @param encryptedText - Base64 编码的加密字符串 ("iv:encrypted:tag")
 * @returns 解密后的明文
 */
export const decrypt = (encryptedText: string): string => {
    try {
        const data = Buffer.from(encryptedText, 'base64');
        if (data.length < ivLength + tagLength) {
            throw new Error('无效的加密数据格式');
        }

        // 从组合数据中提取 iv、密文和认证标签
        const iv = data.slice(0, ivLength);
        const encrypted = data.slice(ivLength, data.length - tagLength);
        const tag = data.slice(data.length - tagLength);

        const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
        decipher.setAuthTag(tag); // 设置认证标签以供验证

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('解密失败:', error);
        // 在实际应用中，解密失败通常意味着数据被篡改或密钥错误
        // 不应向客户端泄露具体错误细节
        throw new Error('解密过程中发生错误或数据无效');
    }
};
