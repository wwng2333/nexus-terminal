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
    // AuthenticatorDevice is not typically needed here
} from '@simplewebauthn/server'; // Import types directly from the package
import { PasskeyRepository, PasskeyRecord } from '../repositories/passkey.repository';
import { settingsService } from './settings.service'; // Import the exported object

// 定义 Relying Party (RP) 信息 - 这些应该来自配置或设置
// TODO: 从 SettingsService 或环境变量获取这些值
const rpName = 'Nexus Terminal';
// 重要: rpID 应该是你的网站域名 (不包含协议和端口)
// 对于本地开发，通常是 'localhost'
const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : 'YOUR_PRODUCTION_DOMAIN'; // 需要替换为实际域名
// 重要: origin 应该是你的前端应用的完整源 (包含协议和端口)
const expectedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'; // 确保与前端 URL 匹配

export class PasskeyService {
    private passkeyRepository: PasskeyRepository;
    // No need to instantiate settingsService if it's an object export
    // private settingsService: typeof settingsService; // Use typeof for the object type

    constructor() {
        this.passkeyRepository = new PasskeyRepository();
        // this.settingsService = settingsService; // Assign the imported object if needed
        // TODO: Load rpID, rpName, expectedOrigin using settingsService.getSetting()
    }

    /**
     * 生成 Passkey 注册选项 (挑战)
     */
    async generateRegistrationOptions(userName: string = 'nexus-user') { // WebAuthn 需要一个用户名
        // 暂时不获取已存在的凭证，允许同一用户注册多个设备
        // const existingCredentials = await this.passkeyRepository.getAllPasskeys();

        const options: GenerateRegistrationOptionsOpts = {
            rpName,
            rpID,
            userID: Buffer.from(userName), // userID should be a Buffer/Uint8Array
            userName: userName,
            // 不建议排除已存在的凭证，除非有特定原因
            // excludeCredentials: existingCredentials.map(cred => ({
            //     id: cred.credential_id, // 需要是 Base64URL 格式，存储时确保是这个格式
            //     type: 'public-key',
            //     transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            // })),
            authenticatorSelection: {
                // authenticatorAttachment: 'platform', // 倾向于平台认证器 (如 Windows Hello, Touch ID)
                userVerification: 'preferred', // 倾向于需要用户验证 (PIN, 生物识别)
                residentKey: 'preferred', // 倾向于创建可发现凭证 (存储在认证器上)
            },
            // 可选：增加超时时间
             timeout: 60000, // 60 秒
             // attestation: 'none', // Temporarily remove to resolve TS error, 'none' is often default
        };

        const registrationOptions = await generateRegistrationOptions(options);

        // TODO: 需要将生成的 challenge 临时存储起来 (例如在 session 或 内存缓存中)，以便后续验证
        // 这里暂时返回 challenge，让 Controller 处理存储
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
            // Use type assertion to bypass strict type checking for registrationInfo properties
            const registrationInfo = verification.registrationInfo as any;
            const { credentialPublicKey, credentialID, counter } = registrationInfo;
            // Optional: Access other potential properties if needed
            // const { credentialDeviceType, credentialBackedUp } = registrationInfo;


            // 将公钥和 ID 转换为 Base64URL 字符串存储 (如果它们还不是)
            // @simplewebauthn/server 返回的是 Buffer，需要转换
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
        // 可选：可以只允许已注册的凭证进行认证
        // const allowedCredentials = (await this.passkeyRepository.getAllPasskeys()).map(cred => ({
        //     id: cred.credential_id, // 确保是 Base64URL 格式
        //     type: 'public-key',
        //     transports: cred.transports ? JSON.parse(cred.transports) : undefined,
        // }));

        const options: GenerateAuthenticationOptionsOpts = {
            rpID,
            // allowCredentials: allowedCredentials, // 如果只想允许已注册的凭证
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

        // 将存储的公钥从 Base64URL 转回 Buffer
        // const authenticatorPublicKeyBuffer = Buffer.from(authenticator.public_key, 'base64url'); // Moved lookup after verification

        // Prepare the verification options object - authenticator is looked up internally by the library
        // based on the response's credential ID, or requires allowCredentials
        const verificationOptions: VerifyAuthenticationResponseOpts = {
            response: authenticationResponse,
            expectedChallenge: expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
            // We need to provide a way for the library to get the authenticator details.
            // Option 1: Provide `allowCredentials` (if known beforehand)
            // Option 2: Let the library handle it (requires authenticator to be discoverable/resident key)
            // Option 3 (Most robust): Provide the authenticator directly after fetching it.
            // The library likely uses the credential ID from the response to find the authenticator,
            // especially with discoverable credentials, or requires `allowCredentials`.
            // Re-adding the authenticator property based on the new error message,
            // ensuring the structure matches what the library likely expects.
            authenticator: {
                credentialID: Buffer.from(authenticator.credential_id, 'base64url'),
                credentialPublicKey: Buffer.from(authenticator.public_key, 'base64url'),
                counter: authenticator.counter,
                transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
            },
            requireUserVerification: true, // simplewebauthn defaults this to true now
        } as any; // Use type assertion to bypass strict property check for 'authenticator'

        let verification: VerifiedAuthenticationResponse;
         try {
            verification = await verifyAuthenticationResponse(verificationOptions);
         } catch (error: any) {
            // If verification fails, log the error but potentially re-throw a more generic one
            console.error('Passkey 认证验证时发生异常:', error);
            const err = error as Error;
            // Check if the error is due to the authenticator not being found (already handled)
            if (!err.message.includes(credentialIdBase64Url)) {
                 throw new Error(`Passkey authentication verification failed: ${err.message || err}`);
            }
            // If error is related to authenticator not found, rethrow the original specific error
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
