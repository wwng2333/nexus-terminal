import axios, { AxiosRequestConfig } from 'axios';
import { NotificationSettingsRepository } from '../repositories/notification.repository';
import {
    NotificationSetting,
    NotificationEvent,
    NotificationPayload,
    WebhookConfig,
    EmailConfig,
    TelegramConfig,
    NotificationChannelConfig,
    NotificationChannelType // Import the missing type
} from '../types/notification.types';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer'; // Import Mail type for transporter
import i18next, { defaultLng, supportedLngs } from '../i18n'; // Import i18next instance and config
import { settingsService } from './settings.service'; // Import settings service

export class NotificationService {
    private repository: NotificationSettingsRepository;

    constructor() {
        this.repository = new NotificationSettingsRepository();
    }

    async getAllSettings(): Promise<NotificationSetting[]> {
        return this.repository.getAll();
    }

    async getSettingById(id: number): Promise<NotificationSetting | null> {
        return this.repository.getById(id);
    }

     async createSetting(settingData: Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        // Add validation if needed
        return this.repository.create(settingData);
    }

    async updateSetting(id: number, settingData: Partial<Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
        // Add validation if needed
        // Ensure password is not overwritten if not provided explicitly? Or handle in controller/route.
        // For now, we assume the full config (including potentially sensitive fields) is passed for updates if needed.
        return this.repository.update(id, settingData);
    }

    async deleteSetting(id: number): Promise<boolean> {
        return this.repository.delete(id);
    }

    // --- Test Notification Methods ---

    // Generic test method dispatcher
    async testSetting(channelType: NotificationChannelType, config: NotificationChannelConfig): Promise<{ success: boolean; message: string }> {
        switch (channelType) {
            case 'email':
                return this._testEmailSetting(config as EmailConfig);
            case 'webhook':
                return this._testWebhookSetting(config as WebhookConfig);
            case 'telegram':
                return this._testTelegramSetting(config as TelegramConfig);
            default:
                console.warn(`[Notification Test] Unsupported channel type for testing: ${channelType}`);
                return { success: false, message: `不支持测试此渠道类型 (${channelType})` };
        }
    }

    // Specific test method for Email
    private async _testEmailSetting(config: EmailConfig): Promise<{ success: boolean; message: string }> {
        if (!config.to || !config.smtpHost || !config.smtpPort || !config.from) {
            return { success: false, message: '测试邮件失败：缺少必要的 SMTP 配置信息 (收件人, 主机, 端口, 发件人)。' };
        }

        // Let TypeScript infer the options type for SMTP
        const transporterOptions = {
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure ?? true, // Default to true (TLS)
            auth: (config.smtpUser || config.smtpPass) ? {
                user: config.smtpUser,
                pass: config.smtpPass, // Ensure password is included if user is present
            } : undefined,
            // Consider adding TLS options if needed, e.g., ignore self-signed certs
            // tls: {
            //     rejectUnauthorized: false // Use with caution!
            // }
        };

        const transporter = nodemailer.createTransport(transporterOptions);

        const mailOptions: Mail.Options = {
            from: config.from,
            to: config.to, // Use the 'to' from config for testing
            subject: 'Nexus Terminal Test Notification',
            text: `This is a test email from Nexus Terminal.\n\nIf you received this, your SMTP configuration is working.\n\nTimestamp: ${new Date().toISOString()}`,
            html: `<p>This is a test email from <b>Nexus Terminal</b>.</p><p>If you received this, your SMTP configuration is working.</p><p>Timestamp: ${new Date().toISOString()}</p>`,
        };

        try {
            console.log(`[Notification Test] Attempting to send test email via ${config.smtpHost}:${config.smtpPort} to ${config.to}`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Notification Test] Test email sent successfully: ${info.messageId}`);
            // Verify connection if possible (optional)
            // await transporter.verify();
            // console.log('[Notification Test] SMTP Connection verified.');
            return { success: true, message: '测试邮件发送成功！请检查收件箱。' };
        } catch (error: any) {
            console.error(`[Notification Test] Error sending test email:`, error);
            return { success: false, message: `测试邮件发送失败: ${error.message || '未知错误'}` };
        }
    }

    // Specific test method for Webhook
    private async _testWebhookSetting(config: WebhookConfig): Promise<{ success: boolean; message: string }> {
        if (!config.url) {
            return { success: false, message: '测试 Webhook 失败：缺少 URL。' };
        }

        // Use a valid event type for the test payload
        const testPayload: NotificationPayload = {
            event: 'SETTINGS_UPDATED', // Use a valid event type
            timestamp: Date.now(),
            details: { message: 'This is a test notification from Nexus Terminal (Webhook).' } // Add channel type
        };

        // Use the same rendering logic as actual sending
        const defaultBody = JSON.stringify(testPayload, null, 2);
        const requestBody = this._renderTemplate(config.bodyTemplate, testPayload, defaultBody);

        const requestConfig: AxiosRequestConfig = {
            method: config.method || 'POST',
            url: config.url,
            headers: {
                'Content-Type': 'application/json',
                ...(config.headers || {}),
            },
            data: requestBody,
            timeout: 15000, // Slightly longer timeout for testing
        };

        try {
            console.log(`[Notification Test] Sending test Webhook to ${config.url}`);
            const response = await axios(requestConfig);
            console.log(`[Notification Test] Test Webhook sent successfully to ${config.url}. Status: ${response.status}`);
            return { success: true, message: `测试 Webhook 发送成功 (状态码: ${response.status})。` };
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.response?.data || error.message || '未知错误';
            console.error(`[Notification Test] Error sending test Webhook to ${config.url}:`, errorMessage);
            return { success: false, message: `测试 Webhook 发送失败: ${errorMessage}` };
        }
    }

     // Specific test method for Telegram
    private async _testTelegramSetting(config: TelegramConfig): Promise<{ success: boolean; message: string }> {
        if (!config.botToken || !config.chatId) {
            return { success: false, message: '测试 Telegram 失败：缺少机器人 Token 或聊天 ID。' };
        }

         // Use a valid event type for the test payload
         const testPayload: NotificationPayload = {
            event: 'SETTINGS_UPDATED', // Use a valid event type
            timestamp: Date.now(),
            details: { message: 'This is a test notification from Nexus Terminal (Telegram).' } // Add channel type
        };

        // Use the same rendering logic as actual sending
        const defaultMessage = `*Nexus Terminal Test Notification*\n\nEvent: \`${testPayload.event}\`\nTimestamp: ${new Date(testPayload.timestamp).toISOString()}\nDetails: \`\`\`\n${JSON.stringify(testPayload.details, null, 2)}\n\`\`\``;
        const messageText = this._renderTemplate(config.messageTemplate, testPayload, defaultMessage);

        const telegramApiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

        try {
             console.log(`[Notification Test] Sending test Telegram message to chat ID ${config.chatId}`);
            const response = await axios.post(telegramApiUrl, {
                chat_id: config.chatId,
                text: messageText,
                parse_mode: 'Markdown',
            }, { timeout: 15000 }); // Slightly longer timeout for testing

            if (response.data?.ok) {
                 console.log(`[Notification Test] Test Telegram message sent successfully.`);
                 return { success: true, message: '测试 Telegram 消息发送成功！' };
            } else {
                 console.error(`[Notification Test] Telegram API returned error:`, response.data?.description);
                 return { success: false, message: `测试 Telegram 发送失败: ${response.data?.description || 'API 返回失败'}` };
            }
        } catch (error: any) {
             const errorMessage = error.response?.data?.description || error.response?.data || error.message || '未知错误';
            console.error(`[Notification Test] Error sending test Telegram message:`, errorMessage);
            return { success: false, message: `测试 Telegram 发送失败: ${errorMessage}` };
        }
    }


    // --- Core Notification Sending Logic ---

    async sendNotification(event: NotificationEvent, details?: Record<string, any> | string): Promise<void> {
        console.log(`[Notification] Event triggered: ${event}`, details || '');

        // 1. Get user's preferred language (or default)
        let userLang = defaultLng;
        try {
            // Assuming settingsService is available or needs instantiation if not singleton
            const langSetting = await settingsService.getSetting('language');
            if (langSetting && supportedLngs.includes(langSetting)) {
                userLang = langSetting;
            }
        } catch (error) {
            console.error(`[Notification] Error fetching language setting for event ${event}:`, error);
            // Proceed with default language
        }
        console.log(`[Notification] Using language '${userLang}' for event ${event}`);

        const payload: NotificationPayload = {
            event,
            timestamp: Date.now(),
            details: details || undefined,
        };

        try {
            const applicableSettings = await this.repository.getEnabledByEvent(event);
            console.log(`[Notification] Found ${applicableSettings.length} applicable setting(s) for event ${event}`);

            if (applicableSettings.length === 0) {
                return; // No enabled settings for this event
            }

            const sendPromises = applicableSettings.map(setting => {
                switch (setting.channel_type) {
                    case 'webhook':
                        return this._sendWebhook(setting, payload, userLang); // Pass userLang
                    case 'email':
                        return this._sendEmail(setting, payload, userLang); // Pass userLang
                    case 'telegram':
                        return this._sendTelegram(setting, payload, userLang); // Pass userLang
                    default:
                        console.warn(`[Notification] Unknown channel type: ${setting.channel_type} for setting ID ${setting.id}`);
                        return Promise.resolve(); // Don't fail all if one is unknown
                }
            });

            // Wait for all notifications to be attempted
            await Promise.allSettled(sendPromises);
            console.log(`[Notification] Finished attempting notifications for event ${event}`);

        } catch (error) {
            console.error(`[Notification] Error fetching or processing settings for event ${event}:`, error);
            // Decide if this error itself should trigger a notification (e.g., SERVER_ERROR)
            // Be careful to avoid infinite loops
        }
    }

    // --- Private Sending Helpers ---

    private _renderTemplate(template: string | undefined, payload: NotificationPayload, defaultText: string): string {
        if (!template) return defaultText;
        let rendered = template;
        rendered = rendered.replace(/\{\{event\}\}/g, payload.event);
        rendered = rendered.replace(/\{\{timestamp\}\}/g, new Date(payload.timestamp).toISOString());
        // Simple details replacement, might need more robust templating engine for complex objects
        const detailsString = typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details || {}, null, 2);
        rendered = rendered.replace(/\{\{details\}\}/g, detailsString);
        return rendered;
    }

    // Updated to accept userLang
    private async _sendWebhook(setting: NotificationSetting, payload: NotificationPayload, userLang: string): Promise<void> {
        const config = setting.config as WebhookConfig;
        if (!config.url) {
            console.error(`[Notification] Webhook setting ID ${setting.id} is missing URL.`);
            return;
        }

        // Translate payload details if they match a known key structure
        const translatedDetails = this._translatePayloadDetails(payload.details, userLang);
        const translatedPayload = { ...payload, details: translatedDetails };

        const defaultBody = JSON.stringify(translatedPayload, null, 2);
        // Note: Webhook body templates might need adjustments if they expect specific structures
        // or if they should also be translated. For now, we only translate the 'details'.
        const requestBody = this._renderTemplate(config.bodyTemplate, translatedPayload, defaultBody);

        const requestConfig: AxiosRequestConfig = {
            method: config.method || 'POST',
            url: config.url,
            headers: {
                'Content-Type': 'application/json', // Default, can be overridden by config.headers
                ...(config.headers || {}),
            },
            data: requestBody,
            timeout: 10000, // Add a timeout (e.g., 10 seconds)
        };

        try {
            console.log(`[Notification] Sending Webhook to ${config.url} for event ${payload.event}`);
            const response = await axios(requestConfig);
            console.log(`[Notification] Webhook sent successfully to ${config.url}. Status: ${response.status}`);
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.response?.data || error.message;
            console.error(`[Notification] Error sending Webhook to ${config.url} for setting ID ${setting.id}:`, errorMessage);
        }
    }

    // Updated to accept userLang
    private async _sendEmail(setting: NotificationSetting, payload: NotificationPayload, userLang: string): Promise<void> {
        const config = setting.config as EmailConfig;
        if (!config.to || !config.smtpHost || !config.smtpPort || !config.from) {
             console.error(`[Notification] Email setting ID ${setting.id} is missing required SMTP configuration (to, smtpHost, smtpPort, from).`);
            return;
        } // <-- Add missing closing brace here

         // Let TypeScript infer the options type for SMTP
        const transporterOptions = {
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure ?? true, // Default to true (TLS)
            auth: (config.smtpUser || config.smtpPass) ? {
                user: config.smtpUser,
                pass: config.smtpPass, // Ensure password is included if user is present
            } : undefined,
            // tls: { rejectUnauthorized: false } // Add if needed for self-signed certs, USE WITH CAUTION
        };

        const transporter = nodemailer.createTransport(transporterOptions);

        // Translate subject and body using i18next
        // const i18nOptions = { lng: userLang, ...payload.details }; // Original line causing error
        const i18nOptions: Record<string, any> = { lng: userLang };
        if (payload.details && typeof payload.details === 'object') {
          Object.assign(i18nOptions, payload.details); // Merge details if it's an object
        } else if (payload.details !== undefined) {
          i18nOptions.details = payload.details; // Pass non-object details directly if needed
        }

        // Try to translate the event itself for the subject, fallback to event name
        const defaultSubjectKey = `event.${payload.event}`;
        const defaultSubjectFallback = `星枢终端通知: ${payload.event}`;
        const subjectText = i18next.t(defaultSubjectKey, { ...i18nOptions, defaultValue: defaultSubjectFallback });
        const subject = this._renderTemplate(config.subjectTemplate, payload, subjectText); // Allow template override

        // Translate the main body content based on event type if a key exists
        const bodyKey = `eventBody.${payload.event}`;
        const detailsString = typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details || {}, null, 2);
        const defaultBodyText = `事件: ${payload.event}\n时间: ${new Date(payload.timestamp).toISOString()}\n详情:\n${detailsString}`;
        const body = i18next.t(bodyKey, { ...i18nOptions, defaultValue: defaultBodyText });
        // Note: Email body templates are not implemented in this version. Using translated/default text.

        const mailOptions: Mail.Options = {
            from: config.from,
            to: config.to,
            subject: subject,
            text: body,
            // html: `<p>${body.replace(/\n/g, '<br>')}</p>` // Simple HTML version
        };

        try {
            console.log(`[Notification] Sending Email via ${config.smtpHost}:${config.smtpPort} to ${config.to} for event ${payload.event}`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Notification] Email sent successfully to ${config.to} for setting ID ${setting.id}. Message ID: ${info.messageId}`);
        } catch (error: any) {
            console.error(`[Notification] Error sending email for setting ID ${setting.id} via ${config.smtpHost}:`, error);
        }
    }

    // Updated to accept userLang
    private async _sendTelegram(setting: NotificationSetting, payload: NotificationPayload, userLang: string): Promise<void> {
        const config = setting.config as TelegramConfig;
        if (!config.botToken || !config.chatId) {
            console.error(`[Notification] Telegram setting ID ${setting.id} is missing botToken or chatId.`);
            return;
        }

        // Translate message using i18next
        // const i18nOptions = { lng: userLang, ...payload.details }; // Original line causing error
        const i18nOptions: Record<string, any> = { lng: userLang };
        if (payload.details && typeof payload.details === 'object') {
          Object.assign(i18nOptions, payload.details); // Merge details if it's an object
        } else if (payload.details !== undefined) {
          i18nOptions.details = payload.details; // Pass non-object details directly if needed
        }
        const messageKey = `eventBody.${payload.event}`; // Use same key as email body for consistency
        const detailsStr = payload.details ? `\n详情: \`\`\`\n${typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details, null, 2)}\n\`\`\`` : '';
        const defaultMessageText = `*星枢终端通知*\n\n事件: \`${payload.event}\`\n时间: ${new Date(payload.timestamp).toISOString()}${detailsStr}`;
        const translatedBody = i18next.t(messageKey, { ...i18nOptions, defaultValue: defaultMessageText });

        // Allow template override
        const messageText = this._renderTemplate(config.messageTemplate, payload, translatedBody);
        const telegramApiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

        try {
             console.log(`[Notification] Sending Telegram message to chat ID ${config.chatId} for event ${payload.event}`);
            const response = await axios.post(telegramApiUrl, {
                chat_id: config.chatId,
                text: messageText,
                parse_mode: 'Markdown', // Or 'HTML' depending on template needs
            }, { timeout: 10000 }); // Add timeout
             console.log(`[Notification] Telegram message sent successfully. Response OK:`, response.data?.ok);
        } catch (error: any) {
             const errorMessage = error.response?.data?.description || error.response?.data || error.message;
            console.error(`[Notification] Error sending Telegram message for setting ID ${setting.id}:`, errorMessage);
        }
    }

    // Helper to attempt translation of known payload structures
    private _translatePayloadDetails(details: any, lng: string): any {
        if (!details || typeof details !== 'object') {
            return details; // Return as is if not an object or null/undefined
        }

        // Example: Translate connection test results
        if (details.testResult === 'success' && details.connectionName) {
            return {
                ...details,
                message: i18next.t('connection.testSuccess', { lng, name: details.connectionName, defaultValue: `Connection test successful for '${details.connectionName}'!` })
            };
        }
        if (details.testResult === 'failed' && details.connectionName && details.error) {
             return {
                ...details,
                message: i18next.t('connection.testFailed', { lng, name: details.connectionName, error: details.error, defaultValue: `Connection test failed for '${details.connectionName}': ${details.error}` })
            };
        }

        // Example: Translate settings update messages (can be expanded)
        if (details.updatedKeys && Array.isArray(details.updatedKeys)) {
             if (details.updatedKeys.includes('ipWhitelist')) {
                 return { ...details, message: i18next.t('settings.ipWhitelistUpdated', { lng, defaultValue: 'IP Whitelist updated successfully.' }) };
             }
             // Generic settings update
             return { ...details, message: i18next.t('settings.updated', { lng, defaultValue: 'Settings updated successfully.' }) };
        }


        // Add more translation logic for other event details structures here...

        return details; // Return original details if no specific translation logic matched
    }
}

// Optional: Export a singleton instance if needed throughout the backend
// export const notificationService = new NotificationService();
