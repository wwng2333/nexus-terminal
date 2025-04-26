import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { NotificationSetting } from '../types/notification.types';
import { AuditLogService } from '../services/audit.service';

const auditLogService = new AuditLogService();

export class NotificationController {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    // GET /api/v1/notifications
    getAll = async (req: Request, res: Response): Promise<void> => {
        try {
            const settings = await this.notificationService.getAllSettings();
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
            const newSettingId = await this.notificationService.createSetting(settingData);
            const newSetting = await this.notificationService.getSettingById(newSettingId); 
            // 记录审计日志
            if (newSetting) {
                auditLogService.logAction('NOTIFICATION_SETTING_CREATED', { settingId: newSetting.id, name: newSetting.name, type: newSetting.channel_type });
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
            const success = await this.notificationService.updateSetting(id, settingData);
            if (success) {
                const updatedSetting = await this.notificationService.getSettingById(id);
                // 记录审计日志
                auditLogService.logAction('NOTIFICATION_SETTING_UPDATED', { settingId: id, updatedFields: Object.keys(settingData) });
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
            const success = await this.notificationService.deleteSetting(id);
            if (success) {
                // 记录审计日志
                auditLogService.logAction('NOTIFICATION_SETTING_DELETED', { settingId: id });
                res.status(204).send(); // No Content
            } else {
                res.status(404).json({ message: `未找到 ID 为 ${id} 的通知设置` });
            }
        } catch (error: any) {
            res.status(500).json({ message: '删除通知设置失败', error: error.message });
        }
    };

    // POST /api/v1/notifications/:id/test
    testSetting = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id, 10);
        const { config } = req.body;

        if (isNaN(id)) {
            res.status(400).json({ message: '无效的通知设置 ID' });
            return;
        }
        if (!config) {
             res.status(400).json({ message: '缺少用于测试的配置信息' });
             return;
        }

        try {
            const originalSetting = await this.notificationService.getSettingById(id);
            if (!originalSetting) {
                res.status(404).json({ message: `未找到 ID 为 ${id} 的通知设置` });
                return; 
            }

            const result = await this.notificationService.testSetting(originalSetting.channel_type, config);

            if (result.success) {
                // 记录审计日志 (可选，根据需要决定是否记录测试操作)
              
                res.status(200).json({ message: result.message });
            } else {
                 // 记录审计日志 (可选)
                
                res.status(500).json({ message: result.message });
            }
        } catch (error: any) {
            res.status(500).json({ message: '测试通知设置时发生内部错误', error: error.message });
        }
    };

    // POST /api/v1/notifications/test-unsaved
    testUnsavedSetting = async (req: Request, res: Response): Promise<void> => {
        const { channel_type, config } = req.body;

        if (!channel_type || !config) {
            res.status(400).json({ message: '缺少必要的测试信息 (channel_type, config)' });
            return;
        }

        // Basic validation for channel type
        if (!['webhook', 'email', 'telegram'].includes(channel_type)) {
             res.status(400).json({ message: '无效的渠道类型' });
             return;
        }

        try {
            const result = await this.notificationService.testSetting(channel_type, config);

            if (result.success) {
                res.status(200).json({ message: result.message });
            } else {
                res.status(500).json({ message: result.message });
            }
        } catch (error: any) {
            res.status(500).json({ message: '测试通知设置时发生内部错误', error: error.message });
        }
    };
}
