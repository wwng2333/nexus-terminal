import notificationProcessorService, { ProcessedNotification } from './notification.processor.service'; // 导入导出的接口
import { NotificationChannelType, NotificationChannelConfig } from '../types/notification.types';

// 1. 定义通知发送器接口
export interface INotificationSender {
    send(notification: ProcessedNotification): Promise<void>;
}

// 导入具体的发送器实现
import telegramSenderService from './senders/telegram.sender.service';
import emailSenderService from './senders/email.sender.service';
import webhookSenderService from './senders/webhook.sender.service';


class NotificationDispatcherService {
    // 使用 Map 来存储不同渠道类型的发送器实例
    private senders: Map<NotificationChannelType, INotificationSender>;

    constructor() {
        this.senders = new Map();
        // 注册具体的发送器实例
        this.registerSender('telegram', telegramSenderService);
        this.registerSender('email', emailSenderService);
        this.registerSender('webhook', webhookSenderService);

        this.listenForNotifications();
    }

    /**
     * 注册一个通知发送器实例
     * @param channelType 渠道类型
     * @param sender 发送器实例
     */
    registerSender(channelType: NotificationChannelType, sender: INotificationSender) {
        if (this.senders.has(channelType)) {
            console.warn(`[NotificationDispatcher] Sender for channel type '${channelType}' is already registered. Overwriting.`);
        }
        this.senders.set(channelType, sender);
        console.log(`[NotificationDispatcher] Registered sender for channel type '${channelType}'.`);
    }

    private listenForNotifications() {
        notificationProcessorService.on('sendNotification', (processedNotification: ProcessedNotification) => {
            // 使用 setImmediate 避免阻塞
            setImmediate(() => {
                this.dispatchNotification(processedNotification).catch(error => {
                    console.error(`[NotificationDispatcher] Error dispatching notification for channel ${processedNotification.channelType}:`, error);
                });
            });
        });
        console.log('[NotificationDispatcher] Listening for processed notifications.');
    }

    private async dispatchNotification(notification: ProcessedNotification) {
        const sender = this.senders.get(notification.channelType);

        if (!sender) {
            console.warn(`[NotificationDispatcher] No sender registered for channel type: ${notification.channelType}. Skipping notification.`);
            return;
        }

        console.log(`[NotificationDispatcher] Dispatching notification via ${notification.channelType}`);
        try {
            await sender.send(notification);
            console.log(`[NotificationDispatcher] Successfully sent notification via ${notification.channelType}`);
        } catch (error) {
            console.error(`[NotificationDispatcher] Failed to send notification via ${notification.channelType}:`, error);
            // 这里可以添加失败重试或记录失败状态的逻辑
        }
    }
}

// 创建单例并导出
const notificationDispatcherService = new NotificationDispatcherService();

// 导出接口，以便其他发送器可以实现它
// (或者将接口移到 types 文件中)

export default notificationDispatcherService;