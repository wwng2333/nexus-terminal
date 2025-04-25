import axios from 'axios';
import { settingsService } from './settings.service';
import { CaptchaSettings, CaptchaProvider } from '../types/settings.types';

// CAPTCHA 验证 API 端点
const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'; // v2

export class CaptchaService {

    /**
     * 验证提供的 CAPTCHA 令牌。
     * 根据系统设置自动选择合适的提供商进行验证。
     * @param token - 从前端获取的 CAPTCHA 令牌 (h-captcha-response 或 g-recaptcha-response)
     * @returns Promise<boolean> - 令牌是否有效
     * @throws Error 如果配置无效或验证请求失败
     */
    async verifyToken(token: string): Promise<boolean> {
        if (!token) {
            console.warn('[CaptchaService] 验证失败：未提供令牌。');
            return false; // 没有令牌，直接视为无效
        }

        const captchaConfig = await settingsService.getCaptchaConfig();

        if (!captchaConfig.enabled) {
            console.log('[CaptchaService] CAPTCHA 未启用，跳过验证。');
            return true; // 未启用则视为验证通过
        }

        switch (captchaConfig.provider) {
            case 'hcaptcha':
                if (!captchaConfig.hcaptchaSecretKey) {
                    throw new Error('hCaptcha 配置无效：缺少 Secret Key。');
                }
                return this._verifyHCaptcha(token, captchaConfig.hcaptchaSecretKey);
            case 'recaptcha':
                if (!captchaConfig.recaptchaSecretKey) {
                    throw new Error('Google reCAPTCHA 配置无效：缺少 Secret Key。');
                }
                return this._verifyReCaptcha(token, captchaConfig.recaptchaSecretKey);
            case 'none':
                console.log('[CaptchaService] CAPTCHA 提供商设置为 "none"，跳过验证。');
                return true; // 提供商为 none 也视为通过
            default:
                console.error(`[CaptchaService] 未知的 CAPTCHA 提供商: ${captchaConfig.provider}`);
                throw new Error(`未知的 CAPTCHA 提供商配置: ${captchaConfig.provider}`);
        }
    }

    /**
     * 调用 hCaptcha API 验证令牌。
     * @param token - h-captcha-response 令牌
     * @param secretKey - hCaptcha Secret Key
     * @returns Promise<boolean> - 令牌是否有效
     */
    private async _verifyHCaptcha(token: string, secretKey: string): Promise<boolean> {
        console.log('[CaptchaService] 正在验证 hCaptcha 令牌...');
        try {
            // 正确方式：将数据放在 POST body 中，并使用 URLSearchParams 格式化
            const params = new URLSearchParams();
            params.append('secret', secretKey);
            params.append('response', token);
            // params.append('remoteip', userIpAddress); // 如果需要传递用户 IP

            const response = await axios.post(HCAPTCHA_VERIFY_URL, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            console.log('[CaptchaService] hCaptcha 验证响应:', response.data);
            if (response.data && response.data.success === true) {
                console.log('[CaptchaService] hCaptcha 令牌验证成功。');
                return true;
            } else {
                console.warn('[CaptchaService] hCaptcha 令牌验证失败:', response.data['error-codes'] || '未知错误');
                return false;
            }
        } catch (error: any) {
            console.error('[CaptchaService] 调用 hCaptcha 验证 API 时出错:', error.response?.data || error.message);
            // 抛出错误，让上层处理（例如，提示用户稍后重试）
            throw new Error(`hCaptcha 验证请求失败: ${error.message}`);
        }
    }

    /**
     * 调用 Google reCAPTCHA API 验证令牌。
     * @param token - g-recaptcha-response 令牌
     * @param secretKey - Google reCAPTCHA Secret Key
     * @returns Promise<boolean> - 令牌是否有效
     */
    private async _verifyReCaptcha(token: string, secretKey: string): Promise<boolean> {
        console.log('[CaptchaService] 正在验证 Google reCAPTCHA 令牌...');
        try {
            // 正确方式：将数据放在 POST body 中，并使用 URLSearchParams 格式化
            const params = new URLSearchParams();
            params.append('secret', secretKey);
            params.append('response', token);
            // params.append('remoteip', userIpAddress); // 如果需要传递用户 IP

            const response = await axios.post(RECAPTCHA_VERIFY_URL, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            console.log('[CaptchaService] Google reCAPTCHA 验证响应:', response.data);
            if (response.data && response.data.success === true) {
                // 可选：检查 hostname, score (v3), action (v3) 等
                console.log('[CaptchaService] Google reCAPTCHA 令牌验证成功。');
                return true;
            } else {
                console.warn('[CaptchaService] Google reCAPTCHA 令牌验证失败:', response.data['error-codes'] || '未知错误');
                return false;
            }
        } catch (error: any) {
            console.error('[CaptchaService] 调用 Google reCAPTCHA 验证 API 时出错:', error.response?.data || error.message);
            // 抛出错误，让上层处理
            throw new Error(`Google reCAPTCHA 验证请求失败: ${error.message}`);
        }
    }
}

// 导出一个单例供其他服务使用
export const captchaService = new CaptchaService();