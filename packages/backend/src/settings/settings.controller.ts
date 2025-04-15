import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';

export const settingsController = {
  /**
   * 获取所有设置项
   */
  async getAllSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await settingsService.getAllSettings();
      res.json(settings);
    } catch (error: any) {
      console.error('获取所有设置时出错:', error);
      res.status(500).json({ message: '获取设置失败', error: error.message });
    }
  },

  /**
   * 批量更新设置项
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      // TODO: 添加输入验证，确保 req.body 是 Record<string, string>
      const settingsToUpdate: Record<string, string> = req.body;
      if (typeof settingsToUpdate !== 'object' || settingsToUpdate === null) {
        res.status(400).json({ message: '无效的请求体，应为 JSON 对象' });
        return;
      }
      // 可以在这里添加更严格的验证，例如检查值的类型等

      await settingsService.setMultipleSettings(settingsToUpdate);
      res.status(200).json({ message: '设置已成功更新' });
    } catch (error: any) {
      console.error('更新设置时出错:', error);
      res.status(500).json({ message: '更新设置失败', error: error.message });
    }
  },

  // 注意：通常不直接通过 API 提供单个设置项的获取、设置或删除，
  // 而是通过批量获取/更新来管理。如果需要单独操作，可以添加相应方法。
  // 例如：
  // async getSetting(req: Request, res: Response): Promise<void> { ... }
  // async setSetting(req: Request, res: Response): Promise<void> { ... }
  // async deleteSetting(req: Request, res: Response): Promise<void> { ... }
};
