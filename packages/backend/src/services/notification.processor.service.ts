import eventService, { AppEventType, AppEventPayload } from './event.service';
import { NotificationSettingsRepository } from '../repositories/notification.repository';
import { NotificationSetting, NotificationEvent, NotificationChannelType, WebhookConfig, EmailConfig, TelegramConfig, NotificationChannelConfig } from '../types/notification.types';
import i18next, { i18nInitializationPromise } from '../i18n'; // Import the promise
import { EventEmitter } from 'events';

// 定义处理后的通知数据结构
// Exporting for use in dispatcher
export interface ProcessedNotification {
    channelType: NotificationChannelType;
    config: NotificationChannelConfig; // 包含发送所需的配置，如 URL, Token, SMTP 等
    subject?: string; // 主要用于 Email
    body: string; // 格式化后的通知内容主体
    rawPayload: AppEventPayload; // 原始事件负载，可能需要传递给发送器
}


class NotificationProcessorService extends EventEmitter {
    private repository: NotificationSettingsRepository;
    private isInitialized = false; // Flag to track initialization

    constructor() {
        super();
        this.repository = new NotificationSettingsRepository();
        this.initialize(); // Call async initialization method
        // Increase listener limit
        this.setMaxListeners(50);
    }

    // Async initialization method
    private async initialize(): Promise<void> {
        try {
            console.log('[NotificationProcessor] Waiting for i18n initialization...');
            await i18nInitializationPromise; // Wait for i18n to load
            console.log('[NotificationProcessor] i18n initialized. Registering event listeners...');
            this.registerEventListeners();
            this.isInitialized = true;
            console.log('[NotificationProcessor] Initialization complete.');
        } catch (error) {
            console.error('[NotificationProcessor] Failed to initialize due to i18n error:', error);
            // Handle initialization failure, maybe retry or log critical error
        }
    }


    private registerEventListeners() {
        if (this.isInitialized) {
             console.warn('[NotificationProcessor] Attempted to register listeners multiple times.');
             return; // Prevent double registration
        }
        // 监听所有 AppEventType 事件
        Object.values(AppEventType).forEach(eventType => {
            // Special handling for TestNotification is done inside processEvent handlers below
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
         // Separate listener specifically for TestNotification
         eventService.onEvent(AppEventType.TestNotification, (payload) => {
             setImmediate(() => {
                 this.processTestEvent(payload).catch(error => {
                     console.error(`[NotificationProcessor] Error processing test event:`, error);
                 });
             });
        });
        console.log('[NotificationProcessor] Registered listeners.');
    }

     // Handles standard events by fetching settings from DB
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
// --- DEBUG LOG ---
             console.log(`[NotificationProcessor] Translating event key '${eventKey}' for lang '${userLang}'. Result: '${translatedEvent}'`);
             // --- END DEBUG LOG ---
             // --- DEBUG LOG ---
             console.log(`[NotificationProcessor] Translating event key '${eventKey}' for lang '${userLang}'. Result: '${translatedEvent}'`);
             // --- END DEBUG LOG ---


            for (const setting of applicableSettings) {
                 this.processSingleSetting(setting, eventType, payload, translatedEvent, userLang);
            }
        } catch (error) {
            console.error(`[NotificationProcessor] Failed to fetch settings for event ${eventKey}:`, error);
        }
    }

    // Handles the specific TestNotification event using config from payload
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

        // Create a mock setting object for processing
        const mockSetting: NotificationSetting = {
            id: -1, // Indicate it's a test/mock
            name: 'Test Setting',
            enabled: true,
            channel_type: testTargetChannelType,
            config: testTargetConfig,
            enabled_events: [AppEventType.TestNotification as NotificationEvent], // Doesn't really matter here
        };

        const userLang = 'zh-CN'; // TODO: Get user language preference
        // For test events, use 'testNotification' as the key for i18n lookups
        const translatedEvent = i18next.t(`event.${AppEventType.TestNotification}`, { lng: userLang, defaultValue: AppEventType.TestNotification });
         // --- DEBUG LOG ---
         console.log(`[NotificationProcessor] Translating event key '${AppEventType.TestNotification}' for lang '${userLang}'. Result: '${translatedEvent}'`);
         // --- END DEBUG LOG ---


        this.processSingleSetting(mockSetting, AppEventType.TestNotification, payload, translatedEvent, userLang);
    }

     // Processes a single setting (called by both standard and test event handlers)
     private processSingleSetting(
        setting: NotificationSetting,
        eventType: AppEventType, // The actual event type (e.g., LOGIN_SUCCESS or TestNotification)
        payload: AppEventPayload,
        translatedEvent: string,
        userLang: string
    ) {
         try {
            // i18nEventKey is no longer needed for template lookup here
            // const i18nEventKey = eventType === AppEventType.TestNotification ? 'testNotification' : eventType;

            const processedNotification = this.prepareNotificationContent(
                setting,
                // i18nEventKey, // Pass the original event type for context if needed later
                eventType,
                payload,
                translatedEvent, // Pass the already translated event name
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
        eventType: AppEventType, // Use the actual event type for context
        payload: AppEventPayload,
        translatedEvent: string, // The already translated event name (e.g., "登录成功")
        lang: string // Keep lang for potential future use
    ): ProcessedNotification | null {

         // Base data for interpolation, using the translated event name
         const baseInterpolationData = {
            event: translatedEvent, // Use the translated event name here!
            rawEvent: eventType, // Keep original event type
            timestamp: payload.timestamp.toISOString(),
            // Safely stringify details, provide default
            details: typeof payload.details === 'object' ? JSON.stringify(payload.details, null, 2) : (payload.details || ''),
            userId: payload.userId || 'N/A',
            // Flatten details for easier access in simple templates
            ...(typeof payload.details === 'object' ? payload.details : {}),
             // Add specific fields from details if they exist (example for setting deletion)
             settingId: payload.details?.settingId,
             settingName: payload.details?.name,
             settingType: payload.details?.type,
        };


        let subject: string | undefined = undefined;
        let body: string = '';

        // Define GENERIC fallback templates in code
        const genericSubject = `通知: {event}`;
        const genericEmailBody = `<p>事件: {event}</p><p>时间: {timestamp}</p><p>用户ID: {userId}</p><p>详情:</p><pre>{details}</pre>`;
        const genericWebhookBody = JSON.stringify({ event: '{event}', timestamp: '{timestamp}', userId: '{userId}', details: '{details}' });
        const genericTelegramBody = `*{event}*\n时间: {timestamp}\n用户ID: {userId}\n详情:\n\`\`\`\n{details}\n\`\`\``;


        // Use user-defined template first, then the GENERIC fallback
        switch (setting.channel_type) {
            case 'email':
                const emailConfig = setting.config as EmailConfig;
                // Subject is now fixed to the translated event name
                subject = translatedEvent;

                // Use user-defined template (from bodyTemplate field) for the BODY, or generic fallback
                const bodyTemplate = emailConfig?.bodyTemplate || genericEmailBody; // Use optional chaining and correct property
                body = this.interpolate(bodyTemplate, baseInterpolationData);
                break;

            case 'webhook':
                const webhookConfig = setting.config as WebhookConfig;
                // Use user template OR generic fallback
                const webhookTemplate = webhookConfig.bodyTemplate || genericWebhookBody;
                body = this.interpolate(webhookTemplate, baseInterpolationData);
                break;

            case 'telegram':
                const telegramConfig = setting.config as TelegramConfig;
                // Use user template OR generic fallback
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
            rawPayload: payload // Pass original payload for potential use in senders
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
             // Improved: Handle potential undefined/null values gracefully
             return data.hasOwnProperty(key) && data[key] !== null && data[key] !== undefined ? String(data[key]) : match;
        });
    }
}

// 创建单例并导出
// The instance is created immediately, and its async initialize method is called.
// Other parts of the app that import this will get the instance,
// but event processing won't start until initialization completes.
const notificationProcessorService = new NotificationProcessorService();

export default notificationProcessorService;