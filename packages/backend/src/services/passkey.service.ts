import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    VerifiedRegistrationResponse,
    VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    GenerateRegistrationOptionsOpts,
    GenerateAuthenticationOptionsOpts,
    VerifyRegistrationResponseOpts,
    VerifyAuthenticationResponseOpts,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from '@simplewebauthn/server'; 
import { PasskeyRepository, PasskeyRecord } from '../repositories/passkey.repository';


// 定义 Relying Party (RP) 信息 - 这些应该来自配置或设置
const rpName = 'Nexus Terminal';
// 重要: rpID 应该是你的网站域名 (不包含协议和端口)
// 对于本地开发，通常是 'localhost'
const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : 'YOUR_PRODUCTION_DOMAIN'; // 需要替换为实际域名
// 重要: origin 应该是你的前端应用的完整源 (包含协议和端口)
const expectedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'; // 确保与前端 URL 匹配

export class PasskeyService {
    private passkeyRepository: PasskeyRepository;


    constructor() {
        this.passkeyRepository = new PasskeyRepository();

    }

    /**
     * 生成 Passkey 注册选项 (挑战)
     */
    async generateRegistrationOptions(userName: string = 'nexus-user') { // WebAuthn 需要一个用户名
        // 暂时不获取已存在的凭证，允许同一用户注册多个设备


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
     * @param registrationResponse 来自客户端的注册响应
     * @param expectedChallenge 之前生成的、临时存储的挑战
     * @param passkeyName 用户为这个 Passkey 起的名字 (可选)
     */
    async verifyRegistration(
        registrationResponse: RegistrationResponseJSON,
        expectedChallenge: string,
        passkeyName?: string
    ): Promise<VerifiedRegistrationResponse> {

        const verificationOptions: VerifyRegistrationResponseOpts = {
            response: registrationResponse,
            expectedChallenge: expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: true, // 强制要求用户验证, simplewebauthn defaults this to true now
        };

        let verification: VerifiedRegistrationResponse;
        try {
             verification = await verifyRegistrationResponse(verificationOptions);
        } catch (error: any) {
            console.error('Passkey 注册验证时发生异常:', error);
            // Provide more context in the error
            const err = error as Error;
            throw new Error(`Passkey registration verification failed: ${err.message || err}`);
        }


        if (verification.verified && verification.registrationInfo) {
            const registrationInfo = verification.registrationInfo as any;
            const { credentialPublicKey, credentialID, counter } = registrationInfo;


            const credentialIdBase64Url = Buffer.from(credentialID).toString('base64url');
            const publicKeyBase64Url = Buffer.from(credentialPublicKey).toString('base64url');

            // 获取 transports 信息
            const transports = registrationResponse.response.transports ?? null;

            // 保存到数据库
            await this.passkeyRepository.savePasskey(
                credentialIdBase64Url,
                publicKeyBase64Url,
                counter,
                transports ? JSON.stringify(transports) : null,
                passkeyName
            );
            console.log(`Passkey 注册成功: ${credentialIdBase64Url}, Name: ${passkeyName ?? 'N/A'}`);
        } else {
            console.error('Passkey 注册验证失败:', verification);
        }

        return verification;
    }

    /**
     * 生成 Passkey 认证选项 (挑战)
     */
    async generateAuthenticationOptions(): Promise<ReturnType<typeof generateAuthenticationOptions>> {


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
     */
    async verifyAuthentication(
        authenticationResponse: AuthenticationResponseJSON,
        expectedChallenge: string
    ): Promise<VerifiedAuthenticationResponse> {

        const credentialIdBase64Url = authenticationResponse.id; // 客户端传回的 ID 已经是 Base64URL
        const authenticator = await this.passkeyRepository.getPasskeyByCredentialId(credentialIdBase64Url);

        if (!authenticator) {
            throw new Error(`未找到 Credential ID 为 ${credentialIdBase64Url} 的认证器`);
        }


        const verificationOptions: VerifyAuthenticationResponseOpts = {
            response: authenticationResponse,
            expectedChallenge: expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,

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
}
