import { Request, Response } from 'express';
import { NotificationSettingsRepository } from '../repositories/notification.repository'; // Use repository
import { NotificationSetting, NotificationChannelType, NotificationChannelConfig, WebhookConfig, EmailConfig, TelegramConfig, NotificationEvent } from '../types/notification.types';
import { AuditLogService } from '../services/audit.service'; // Keep for now if other parts use it
import { AppEventType, default as eventService } from '../services/event.service'; // Import event service

// Remove sender imports as they are no longer called directly for testing
// import telegramSenderService from '../services/senders/telegram.sender.service';
// import emailSenderService from '../services/senders/email.sender.service';
// import webhookSenderService from '../services/senders/webhook.sender.service';
// import { ProcessedNotification } from '../services/notification.processor.service'; // Not needed here

// Removed escapeTelegramMarkdownV2 helper function

const auditLogService = new AuditLogService(); // Keep for now if other parts use it, but prefer eventService

export class NotificationController {
    private repository: NotificationSettingsRepository; // Use repository

    constructor() {
        this.repository = new NotificationSettingsRepository(); // Instantiate repository
    }

    // GET /api/v1/notifications
    getAll = async (req: Request, res: Response): Promise<void> => {
        try {
            const settings = await this.repository.getAll(); // Use repository
            res.status(200).json(settings);
        } catch (error: any) {
            res.status(500).json({ message: '获取通知设置失败', error: error.message });
        }
    };

    // POST /api/v1/notifications
    create = async (req: Request, res: Response): Promise<void> => {
        const settingData: Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'> = req.body;

        if (!settingData.channel_type || !settingData.name || !settingData.config) {
             res.status(400).json({ message: '缺少必要的通知设置字段 (channel_type, name, config)' });
             return;
        }

        try {
            const newSettingId = await this.repository.create(settingData); // Use repository
            const newSetting = await this.repository.getById(newSettingId);
            // 记录审计日志 (Use event service)
            if (newSetting) {
                 eventService.emitEvent(AppEventType.NotificationSettingCreated, {
                     userId: (req.session as any).userId, // Assuming userId is in session
                     details: { settingId: newSetting.id, name: newSetting.name, type: newSetting.channel_type }
                 });
            }
            res.status(201).json(newSetting);
        } catch (error: any) {
            res.status(500).json({ message: '创建通知设置失败', error: error.message });
        }
    };

    // PUT /api/v1/notifications/:id
    update = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id, 10);
        const settingData: Partial<Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at'>> = req.body;

        if (isNaN(id)) {
            res.status(400).json({ message: '无效的通知设置 ID' });
            return;
        }
        if (Object.keys(settingData).length === 0) {
            res.status(400).json({ message: '没有提供要更新的数据' });
            return;
        }

        try {
            const success = await this.repository.update(id, settingData); // Use repository
            if (success) {
                const updatedSetting = await this.repository.getById(id);
                // 记录审计日志 (Use event service)
                 eventService.emitEvent(AppEventType.NotificationSettingUpdated, {
                     userId: (req.session as any).userId,
                     details: { settingId: id, updatedFields: Object.keys(settingData) }
                 });
                res.status(200).json(updatedSetting);
            } else {
                res.status(404).json({ message: `未找到 ID 为 ${id} 的通知设置` });
            }
        } catch (error: any) {
            res.status(500).json({ message: '更新通知设置失败', error: error.message });
        }
    };

    // DELETE /api/v1/notifications/:id
    delete = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            res.status(400).json({ message: '无效的通知设置 ID' });
            return;
        }

        try {
            const settingToDelete = await this.repository.getById(id); // Get details before deleting for audit log
            if (!settingToDelete) {
                 res.status(404).json({ message: `未找到 ID 为 ${id} 的通知设置` });
                 return;
            }
            const success = await this.repository.delete(id); // Use repository
            if (success) {
                // 记录审计日志 (Use event service)
                 eventService.emitEvent(AppEventType.NotificationSettingDeleted, {
                     userId: (req.session as any).userId,
                     details: { settingId: id, name: settingToDelete.name, type: settingToDelete.channel_type } // Include name/type in audit
                 });
                res.status(204).send(); // No Content
            } else {
                // Should not happen if getById succeeded, but handle defensively
                res.status(404).json({ message: `删除 ID 为 ${id} 的通知设置失败，可能已被删除` });
            }
        } catch (error: any) {
            res.status(500).json({ message: '删除通知设置失败', error: error.message });
        }
    };

    // --- Refactored Test Endpoints ---

    // Removed executeTestSend method as testing now goes through the event system

    // POST /api/v1/notifications/:id/test
    // Tests an existing, saved setting configuration by triggering a test event
    testSetting = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            res.status(400).json({ message: '无效的通知设置 ID' });
            return;
        }

        try {
            const settingToTest = await this.repository.getById(id);
            if (!settingToTest) {
                res.status(404).json({ message: `未找到 ID 为 ${id} 的通知设置` });
                return;
            }

            // Trigger the standard test event, passing the config to be used by the processor
            eventService.emitEvent(AppEventType.TestNotification, {
                userId: (req.session as any).userId, // Optional: associate test with user
                details: {
                    message: `为设置 ID ${id} (${settingToTest.name}) 触发的测试`,
                    testTargetConfig: settingToTest.config, // Pass the config to use
                    testTargetChannelType: settingToTest.channel_type // Pass the channel type
                }
            });

            // Respond immediately confirming the event was triggered
            res.status(200).json({ message: '测试通知事件已触发。请检查对应渠道的接收情况。' });

        } catch (error: any) {
            console.error(`[NotificationController] Error triggering test for setting ${id}:`, error);
            res.status(500).json({ message: '触发测试通知时发生内部错误', error: error.message });
        }
    };

    // POST /api/v1/notifications/test-unsaved
    // Tests configuration data provided in the request body by triggering a test event
    testUnsavedSetting = async (req: Request, res: Response): Promise<void> => {
        const { channel_type, config } = req.body as { channel_type: NotificationChannelType, config: NotificationChannelConfig };

        if (!channel_type || !config) {
            res.status(400).json({ message: '缺少必要的测试信息 (channel_type, config)' });
            return;
        }

        if (!['webhook', 'email', 'telegram'].includes(channel_type)) {
             res.status(400).json({ message: '无效的渠道类型' });
             return;
        }

        try {
            // Trigger the standard test event, passing the unsaved config to be used by the processor
            eventService.emitEvent(AppEventType.TestNotification, {
                userId: (req.session as any).userId,
                details: {
                    message: `为未保存的 ${channel_type} 配置触发的测试`,
                    testTargetConfig: config, // Pass the unsaved config to use
                    testTargetChannelType: channel_type // Pass the channel type
                }
            });

             // Respond immediately confirming the event was triggered
            res.status(200).json({ message: '测试通知事件已触发。请检查对应渠道的接收情况。' });

        } catch (error: any) {
             console.error(`[NotificationController] Error triggering test for unsaved ${channel_type}:`, error);
            res.status(500).json({ message: '触发测试通知时发生内部错误', error: error.message });
        }
    };
} // End of class NotificationController
