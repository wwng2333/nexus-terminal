import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    VerifiedRegistrationResponse,
    // VerifiedAuthenticationResponse, // Remove original import
} from '@simplewebauthn/server';
import type { VerifiedAuthenticationResponse as SimpleVerifiedAuthenticationResponse } from '@simplewebauthn/server'; // Import with alias
import type {
    GenerateRegistrationOptionsOpts,
    GenerateAuthenticationOptionsOpts,
    VerifyRegistrationResponseOpts,
    VerifyAuthenticationResponseOpts,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { PasskeyRepository, PasskeyRecord } from '../repositories/passkey.repository';
import { getDbInstance, getDb } from '../database/connection'; // Import database functions
import type { User } from '../auth/auth.controller'; // Import User type (assuming it's defined or importable from auth.controller)

// Define extended verification response type including user info
export interface VerifiedAuthenticationResponse extends SimpleVerifiedAuthenticationResponse {
   userInfo?: {
       userId: number;
       username: string;
   };
}
// 定义 Relying Party (RP) 信息 - 这些应该来自配置或设置
const rpName = 'Nexus Terminal';
// rpID 和 expectedOrigin 将从请求动态获取，不再在此处硬编码
// const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : 'YOUR_PRODUCTION_DOMAIN';
// const expectedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

export class PasskeyService {
    private passkeyRepository: PasskeyRepository;


    constructor() {
        this.passkeyRepository = new PasskeyRepository();

    }

    /**
     * 生成 Passkey 注册选项 (挑战)
     * @param hostname 请求的主机名 (例如 'myapp.example.com' 或 'localhost')
     * @param userName WebAuthn 需要的用户名
     */
    async generateRegistrationOptions(hostname: string, userName: string = 'nexus-user') {
        // 暂时不获取已存在的凭证，允许同一用户注册多个设备

        const rpID = hostname; // 使用请求的主机名作为 RP ID

        const options: GenerateRegistrationOptionsOpts = {
            rpName,
            rpID,
            userID: Buffer.from(userName), // userID should be a Buffer/Uint8Array
            userName: userName,

            authenticatorSelection: {
                userVerification: 'preferred', // 倾向于需要用户验证 (PIN, 生物识别)
                residentKey: 'preferred', // 倾向于创建可发现凭证 (存储在认证器上)
            },
            // 可选：增加超时时间
             timeout: 60000, // 60 秒
        };

        const registrationOptions = await generateRegistrationOptions(options);

        return registrationOptions;
    }

    /**
     * 验证 Passkey 注册响应
     * @param userId 当前登录用户的 ID
     * @param registrationResponse 来自客户端的注册响应
     * @param expectedChallenge 之前生成的、临时存储的挑战
     * @param hostname 请求的主机名
     * @param origin 请求的源 (例如 'https://myapp.example.com' 或 'http://localhost:5173')
     * @param passkeyName 用户为这个 Passkey 起的名字 (可选)
     */
    async verifyRegistration(
        userId: number, // 新增 userId 参数
        registrationResponse: RegistrationResponseJSON,
        expectedChallenge: string,
        hostname: string,
        origin: string,
        passkeyName?: string
    ): Promise<VerifiedRegistrationResponse> {

        console.log(`[PasskeyService VerifyReg] Received parameters: userId=${userId}, expectedChallenge=${expectedChallenge}, hostname=${hostname}, origin=${origin}, name=${passkeyName}`); // Log received parameters
        console.log(`[PasskeyService VerifyReg] Received registrationResponse: ${JSON.stringify(registrationResponse)}`); // Log the raw registrationResponse

        const expectedRPID = hostname;
        const expectedOrigin = origin;

        const verificationOptions: VerifyRegistrationResponseOpts = {
            response: registrationResponse,
            expectedChallenge: expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: expectedRPID,
            requireUserVerification: true, // 强制要求用户验证, simplewebauthn defaults this to true now
        };
        console.log(`[PasskeyService VerifyReg] Constructed verificationOptions: ${JSON.stringify(verificationOptions)}`); // Log options before verification

        let verification: VerifiedRegistrationResponse;
        try {
            console.log('[PasskeyService VerifyReg] Calling @simplewebauthn/server verifyRegistrationResponse...');
            verification = await verifyRegistrationResponse(verificationOptions);
            console.log(`[PasskeyService VerifyReg] verifyRegistrationResponse returned: verified=${verification.verified}, registrationInfo exists=${!!verification.registrationInfo}`); // Log verification result
        } catch (error: any) {
            console.error('Passkey 注册验证时发生异常:', error);
            // Provide more context in the error
            const err = error as Error;
            throw new Error(`Passkey registration verification failed: ${err.message || err}`);
        }


        // --- 移除日志记录 ---
        // console.log('[PasskeyService] Verification result:', JSON.stringify(verification, null, 2));
        // --- 结束日志记录 ---

        if (verification.verified && verification.registrationInfo) {
            const registrationInfo = verification.registrationInfo as any; // Keep type assertion for now
            console.log(`[PasskeyService VerifyReg] Verification successful. Extracted registrationInfo: ${JSON.stringify(registrationInfo)}`); // Log extracted info

            // Log the critical fields BEFORE using them
            console.log(`[PasskeyService VerifyReg] BEFORE Buffer.from(credentialID): Type=${typeof registrationInfo.credentialID}, Value=${registrationInfo.credentialID}`);
            console.log(`[PasskeyService VerifyReg] BEFORE Buffer.from(credentialPublicKey): Type=${typeof registrationInfo.credentialPublicKey}, Value=${registrationInfo.credentialPublicKey}`);

            const counter = registrationInfo.counter; // 直接获取 counter

            // --- 直接使用 registrationInfo 的属性 ---
            const credentialIdBase64Url = Buffer.from(registrationInfo.credentialID).toString('base64url');
            const publicKeyBase64Url = Buffer.from(registrationInfo.credentialPublicKey).toString('base64url');

            // 获取 transports 信息
            const transports = registrationResponse.response.transports ?? null;

            // 保存到数据库，传入 userId
            await this.passkeyRepository.savePasskey(
                userId, // 传递 userId
                credentialIdBase64Url,
                publicKeyBase64Url,
                counter,
                transports ? JSON.stringify(transports) : null,
                passkeyName
            );
            console.log(`用户 ${userId} Passkey 注册成功: ${credentialIdBase64Url}, Name: ${passkeyName ?? 'N/A'}`);
        } else {
            console.error('Passkey 注册验证失败:', verification);
        }

        return verification;
    }

    /**
     * 生成 Passkey 认证选项 (挑战)
     * @param hostname 请求的主机名
     */
    async generateAuthenticationOptions(hostname: string): Promise<ReturnType<typeof generateAuthenticationOptions>> {

        const rpID = hostname;

        const options: GenerateAuthenticationOptionsOpts = {
            rpID,

            userVerification: 'preferred', // 倾向于需要用户验证
             timeout: 60000, // 60 秒
        };

        const authenticationOptions = await generateAuthenticationOptions(options);

        // TODO: 需要将生成的 challenge 临时存储起来，以便后续验证
        // 这里暂时返回 challenge，让 Controller 处理存储
        return authenticationOptions;
    }

    /**
     * 验证 Passkey 认证响应
     * @param authenticationResponse 来自客户端的认证响应
     * @param expectedChallenge 之前生成的、临时存储的挑战
     * @param hostname 请求的主机名
     * @param origin 请求的源
     */
    async verifyAuthentication(
        authenticationResponse: AuthenticationResponseJSON,
        expectedChallenge: string,
        hostname: string,
        origin: string
    ): Promise<VerifiedAuthenticationResponse> { // Return our extended type

        const credentialIdBase64Url = authenticationResponse.id; // 客户端传回的 ID 已经是 Base64URL
        const authenticator = await this.passkeyRepository.getPasskeyByCredentialId(credentialIdBase64Url);

        if (!authenticator) {
            throw new Error(`未找到 Credential ID 为 ${credentialIdBase64Url} 的认证器`);
        }

        const expectedRPID = hostname;
        const expectedOrigin = origin;

        const verificationOptions: VerifyAuthenticationResponseOpts = {
            response: authenticationResponse,
            expectedChallenge: expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: expectedRPID,

            authenticator: {
                credentialID: Buffer.from(authenticator.credential_id, 'base64url'),
                credentialPublicKey: Buffer.from(authenticator.public_key, 'base64url'),
                counter: authenticator.counter,
                transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
            },
            requireUserVerification: true,
        } as any;

        let verification: VerifiedAuthenticationResponse;
         try {
            verification = await verifyAuthenticationResponse(verificationOptions);
         } catch (error: any) {
            console.error('Passkey 认证验证时发生异常:', error);
            const err = error as Error;
            if (!err.message.includes(credentialIdBase64Url)) {
                 throw new Error(`Passkey authentication verification failed: ${err.message || err}`);
            }
            throw error;
         }

        if (verification.verified && verification.authenticationInfo) {
            const { newCounter } = verification.authenticationInfo;
            // 更新数据库中的计数器
            await this.passkeyRepository.updatePasskeyCounter(authenticator.credential_id, newCounter);
            console.log(`Passkey 认证成功: ${authenticator.credential_id}`);

            // --- Added: Fetch user information ---
            const db = await getDbInstance();
            // Assuming PasskeyRecord has user_id
            const user = await getDb<User>(db, 'SELECT id, username FROM users WHERE id = ?', [authenticator.user_id]);
            if (!user) {
                // This theoretically shouldn't happen if the authenticator exists
                console.error(`Passkey authentication successful but associated user not found: UserID ${authenticator.user_id}, CredentialID ${authenticator.credential_id}`);
                throw new Error('Passkey authentication successful but failed to find associated user information.');
            }
            // Attach user info to the verification result
            (verification as VerifiedAuthenticationResponse).userInfo = {
                userId: user.id,
                username: user.username,
            };
            // --- End: Fetch user information ---

        } else {
             console.error('Passkey 认证验证失败:', verification);
        }

        return verification;
    }

     /**
     * 获取所有已注册 Passkey 的简要信息 (用于管理)
     */
    async listPasskeys(): Promise<Partial<PasskeyRecord>[]> {
        // 只返回 ID, Name, Transports, CreatedAt 以减少暴露敏感信息
        const keys = await this.passkeyRepository.getAllPasskeys();
        return keys.map(k => ({
            id: k.id,
            name: k.name,
            transports: k.transports,
            created_at: k.created_at
        }));
    }

    /**
     * 根据 ID 删除 Passkey
     * @param id Passkey 记录的 ID
     */
    async deletePasskey(id: number): Promise<void> {
        await this.passkeyRepository.deletePasskeyById(id);
    }

    /**
     * 根据 Credential ID 获取 Passkey 记录 (供认证验证使用)
     * @param credentialIdBase64Url Base64URL 编码的 Credential ID
     */
    async getPasskeyByCredentialId(credentialIdBase64Url: string): Promise<PasskeyRecord | null> {
        // 注意：PasskeyRepository 需要有 getPasskeyByCredentialId 方法
        // 并且 PasskeyRecord 需要包含 user_id 以便后续查找用户
        return this.passkeyRepository.getPasskeyByCredentialId(credentialIdBase64Url);
    }
}
