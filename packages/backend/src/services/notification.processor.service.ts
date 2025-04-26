import eventService, { AppEventType, AppEventPayload } from './event.service';
import { NotificationSettingsRepository } from '../repositories/notification.repository';
import { NotificationSetting, NotificationEvent, NotificationChannelType, WebhookConfig, EmailConfig, TelegramConfig, NotificationChannelConfig } from '../types/notification.types';
import i18next, { i18nInitializationPromise } from '../i18n';
import { EventEmitter } from 'events';

// 定义处理后的通知数据结构
export interface ProcessedNotification {
    channelType: NotificationChannelType;
    config: NotificationChannelConfig; // 包含发送所需的配置，如 URL, Token, SMTP 等
    subject?: string; // 主要用于 Email
    body: string; // 格式化后的通知内容主体
    rawPayload: AppEventPayload; // 原始事件负载，可能需要传递给发送器
}


class NotificationProcessorService extends EventEmitter {
    private repository: NotificationSettingsRepository;
    private isInitialized = false;

    constructor() {
        super();
        this.repository = new NotificationSettingsRepository();
        this.initialize();
        this.setMaxListeners(50);
    }

    private async initialize(): Promise<void> {
        try {
            console.log('[NotificationProcessor] Waiting for i18n initialization...');
            await i18nInitializationPromise;
            console.log('[NotificationProcessor] i18n initialized. Registering event listeners...');
            this.registerEventListeners();
            this.isInitialized = true;
            console.log('[NotificationProcessor] Initialization complete.');
        } catch (error) {
            console.error('[NotificationProcessor] Failed to initialize due to i18n error:', error);
        }
    }


    private registerEventListeners() {
        if (this.isInitialized) {
             console.warn('[NotificationProcessor] Attempted to register listeners multiple times.');
             return;
        }
        // 监听所有 AppEventType 事件
        Object.values(AppEventType).forEach(eventType => {
            if (eventType !== AppEventType.TestNotification) {
                eventService.onEvent(eventType, (payload) => {
                    // 使用 setImmediate 或 process.nextTick 避免阻塞事件循环
                    setImmediate(() => {
                        this.processStandardEvent(eventType, payload).catch(error => {
                            console.error(`[NotificationProcessor] Error processing event ${eventType}:`, error);
                        });
                    });
                });
            }
        });
         eventService.onEvent(AppEventType.TestNotification, (payload) => {
             setImmediate(() => {
                 this.processTestEvent(payload).catch(error => {
                     console.error(`[NotificationProcessor] Error processing test event:`, error);
                 });
             });
        });
        console.log('[NotificationProcessor] Registered listeners.');
    }

     private async processStandardEvent(eventType: AppEventType, payload: AppEventPayload) {
         if (!this.isInitialized) {
             console.warn(`[NotificationProcessor] Received event ${eventType} before initialization. Skipping.`);
             return;
         }
        console.log(`[NotificationProcessor] Received standard event: ${eventType}`, payload);
        const eventKey = eventType as NotificationEvent; // 类型转换，假设 AppEventType 和 NotificationEvent 对应

        try {
            const applicableSettings = await this.repository.getEnabledByEvent(eventKey);
            console.log(`[NotificationProcessor] Found ${applicableSettings.length} applicable settings for event ${eventKey}`);

            if (applicableSettings.length === 0) {
                return; // 没有配置需要处理
            }

            // TODO: 获取用户语言偏好，目前硬编码为 'zh-CN'
            const userLang = 'zh-CN'; // 后续应从用户设置或请求中获取

            // 1. 翻译事件名称
            const translatedEvent = i18next.t(`event.${eventKey}`, { lng: userLang, defaultValue: eventKey });


            for (const setting of applicableSettings) {
                 this.processSingleSetting(setting, eventType, payload, translatedEvent, userLang);
            }
        } catch (error) {
            console.error(`[NotificationProcessor] Failed to fetch settings for event ${eventKey}:`, error);
        }
    }

    private async processTestEvent(payload: AppEventPayload) {
         if (!this.isInitialized) {
             console.warn(`[NotificationProcessor] Received test event before initialization. Skipping.`);
             return;
         }
        console.log(`[NotificationProcessor] Received test event`, payload);
        const { testTargetConfig, testTargetChannelType } = payload.details || {};

        if (!testTargetConfig || !testTargetChannelType) {
            console.error('[NotificationProcessor] Test event payload missing testTargetConfig or testTargetChannelType.');
            return;
        }

        const mockSetting: NotificationSetting = {
            id: -1,
            name: 'Test Setting',
            enabled: true,
            channel_type: testTargetChannelType,
            config: testTargetConfig,
            enabled_events: [AppEventType.TestNotification as NotificationEvent],
        };

        const userLang = 'zh-CN'; // TODO: Get user language preference
        const translatedEvent = i18next.t(`event.${AppEventType.TestNotification}`, { lng: userLang, defaultValue: AppEventType.TestNotification });


        this.processSingleSetting(mockSetting, AppEventType.TestNotification, payload, translatedEvent, userLang);
    }

     private processSingleSetting(
        setting: NotificationSetting,
        eventType: AppEventType,
        payload: AppEventPayload,
        translatedEvent: string,
        userLang: string
    ) {
         try {

            const processedNotification = this.prepareNotificationContent(
                setting,
                eventType,
                payload,
                translatedEvent,
                userLang
            );

            if (processedNotification) {
                this.emit('sendNotification', processedNotification);
                console.log(`[NotificationProcessor] Emitting sendNotification for ${setting.channel_type} (Setting ID: ${setting.id}, Event: ${eventType})`);
            }
        } catch (error) {
            console.error(`[NotificationProcessor] Error preparing notification for setting ID ${setting.id} and event ${eventType}:`, error);
        }
    }


    private prepareNotificationContent(
        setting: NotificationSetting,
        eventType: AppEventType,
        payload: AppEventPayload,
        translatedEvent: string, // The already translated event name (e.g., "登录成功")
        lang: string
    ): ProcessedNotification | null {

         const baseInterpolationData = {
            event: translatedEvent,
            rawEvent: eventType,
            timestamp: payload.timestamp.toISOString(),
            details: typeof payload.details === 'object' ? JSON.stringify(payload.details, null, 2) : (payload.details || ''),
            userId: payload.userId || 'N/A',
            ...(typeof payload.details === 'object' ? payload.details : {}),
             settingId: payload.details?.settingId,
             settingName: payload.details?.name,
             settingType: payload.details?.type,
        };


        let subject: string | undefined = undefined;
        let body: string = '';

        const genericSubject = `通知: {event}`;
        const genericEmailBody = `<p>事件: {event}</p><p>时间: {timestamp}</p><p>用户ID: {userId}</p><p>详情:</p><pre>{details}</pre>`;
        const genericWebhookBody = JSON.stringify({ event: '{event}', timestamp: '{timestamp}', userId: '{userId}', details: '{details}' });
        const genericTelegramBody = `*{event}*\n时间: {timestamp}\n用户ID: {userId}\n详情:\n\`\`\`\n{details}\n\`\`\``;


        switch (setting.channel_type) {
            case 'email':
                const emailConfig = setting.config as EmailConfig;
                subject = translatedEvent;

                const bodyTemplate = emailConfig?.bodyTemplate || genericEmailBody;
                body = this.interpolate(bodyTemplate, baseInterpolationData);
                break;

            case 'webhook':
                const webhookConfig = setting.config as WebhookConfig;
                const webhookTemplate = webhookConfig.bodyTemplate || genericWebhookBody;
                body = this.interpolate(webhookTemplate, baseInterpolationData);
                break;

            case 'telegram':
                const telegramConfig = setting.config as TelegramConfig;
                const telegramTemplate = telegramConfig.messageTemplate || genericTelegramBody;
                body = this.interpolate(telegramTemplate, baseInterpolationData);
                break;

            default:
                console.warn(`[NotificationProcessor] Unsupported channel type: ${setting.channel_type}`);
                return null;
        }

        return {
            channelType: setting.channel_type,
            config: setting.config,
            subject: subject,
            body: body,
            rawPayload: payload
        };
    }

    /**
     * 简单的字符串模板插值替换
     * @param template 模板字符串，例如 "Hello {name}"
     * @param data 数据对象，例如 { name: "World" }
     * @returns 替换后的字符串
     */
    private interpolate(template: string, data: Record<string, any>): string {
        if (!template) return '';
        // 使用正则表达式全局替换 {key} 格式的占位符
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            // 如果 data 中存在对应的 key，则返回值，否则返回原始匹配（例如 "{unknownKey}"）
             return data.hasOwnProperty(key) && data[key] !== null && data[key] !== undefined ? String(data[key]) : match;
        });
    }
}

// 创建单例并导出
const notificationProcessorService = new NotificationProcessorService();

export default notificationProcessorService;