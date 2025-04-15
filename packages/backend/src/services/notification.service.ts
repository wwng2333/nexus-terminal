import axios, { AxiosRequestConfig } from 'axios';
import { NotificationSettingsRepository } from '../repositories/notification.repository';
import {
    NotificationSetting,
    NotificationEvent,
    NotificationPayload,
    WebhookConfig,
    EmailConfig, // Ensure EmailConfig is imported
    TelegramConfig,
    NotificationChannelConfig
} from '../types/notification.types';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer'; // Import Mail type for transporter

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

    // --- Test Notification Method ---
    async testEmailSetting(config: EmailConfig): Promise<{ success: boolean; message: string }> {
        if (!config.to || !config.smtpHost || !config.smtpPort || !config.from) {
            return { success: false, message: '测试邮件失败：缺少必要的 SMTP 配置信息 (收件人, 服务器, 端口, 发件人)。' };
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
            subject: '星枢终端 (Nexus Terminal) 测试邮件',
            text: `这是一封来自星枢终端 (Nexus Terminal) 的测试邮件。\n\n如果收到此邮件，表示您的 SMTP 配置工作正常。\n\n时间: ${new Date().toISOString()}`,
            html: `<p>这是一封来自 <b>星枢终端 (Nexus Terminal)</b> 的测试邮件。</p><p>如果收到此邮件，表示您的 SMTP 配置工作正常。</p><p>时间: ${new Date().toISOString()}</p>`,
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


    // --- Core Notification Sending Logic ---

    async sendNotification(event: NotificationEvent, details?: Record<string, any> | string): Promise<void> {
        console.log(`[Notification] Event triggered: ${event}`, details || '');
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
                        return this._sendWebhook(setting, payload);
                    case 'email':
                        return this._sendEmail(setting, payload);
                    case 'telegram':
                        return this._sendTelegram(setting, payload);
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


    private async _sendWebhook(setting: NotificationSetting, payload: NotificationPayload): Promise<void> {
        const config = setting.config as WebhookConfig;
        if (!config.url) {
            console.error(`[Notification] Webhook setting ID ${setting.id} is missing URL.`);
            return;
        }

        const defaultBody = JSON.stringify(payload, null, 2);
        const requestBody = this._renderTemplate(config.bodyTemplate, payload, defaultBody);

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

    private async _sendEmail(setting: NotificationSetting, payload: NotificationPayload): Promise<void> {
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

        const defaultSubject = `星枢终端通知: ${payload.event}`;
        const subject = this._renderTemplate(config.subjectTemplate, payload, defaultSubject);

        // Basic default body (plain text)
        const detailsString = typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details || {}, null, 2);
        const defaultBody = `事件: ${payload.event}\n时间: ${new Date(payload.timestamp).toISOString()}\n详情:\n${detailsString}`;
        // Note: Email body templates are not implemented in this version. Using default text.
        const body = defaultBody;

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

    private async _sendTelegram(setting: NotificationSetting, payload: NotificationPayload): Promise<void> {
        const config = setting.config as TelegramConfig;
        if (!config.botToken || !config.chatId) {
            console.error(`[Notification] Telegram setting ID ${setting.id} is missing botToken or chatId.`);
            return;
        }

        // Default message format
        const detailsStr = payload.details ? `\n详情: \`\`\`\n${typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details, null, 2)}\n\`\`\`` : '';
        const defaultMessage = `*星枢终端通知*\n\n事件: \`${payload.event}\`\n时间: ${new Date(payload.timestamp).toISOString()}${detailsStr}`;

        const messageText = this._renderTemplate(config.messageTemplate, payload, defaultMessage);
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
}

// Optional: Export a singleton instance if needed throughout the backend
// export const notificationService = new NotificationService();
