import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';
import { AuditLogService } from '../services/audit.service'; // 引入 AuditLogService
import { ipBlacklistService } from '../services/ip-blacklist.service'; // 引入 IP 黑名单服务

const auditLogService = new AuditLogService(); // 实例化 AuditLogService

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

      // --- 过滤掉外观设置相关的键 ---
      const allowedSettingsKeys = [
          'language', 'ipWhitelist', 'maxLoginAttempts', 'loginBanDuration',
          'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled' // 添加 ipWhitelistEnabled
          // 在这里添加其他允许的通用设置键
      ];
      const filteredSettings: Record<string, string> = {};
      for (const key in settingsToUpdate) {
          if (allowedSettingsKeys.includes(key)) {
              filteredSettings[key] = settingsToUpdate[key];
          }
      }
      // --- 结束过滤 ---

      // 只传递过滤后的设置给 service
      if (Object.keys(filteredSettings).length > 0) {
          await settingsService.setMultipleSettings(filteredSettings);
      }

      // 记录审计日志
      // 区分 IP 白名单更新和其他设置更新
      // 注意：现在审计日志可能需要更精细的逻辑，因为它只记录了实际更新的通用设置
      const updatedKeys = Object.keys(filteredSettings); // 使用过滤后的键
      if (updatedKeys.length > 0) { // 只有实际更新了才记录
          if (updatedKeys.includes('ipWhitelist') || updatedKeys.includes('ipWhitelistEnabled')) {
              auditLogService.logAction('IP_WHITELIST_UPDATED', { updatedKeys });
          } else {
              auditLogService.logAction('SETTINGS_UPDATED', { updatedKeys });
          }
      }
      res.status(200).json({ message: '设置已成功更新' }); // 即使没有更新通用设置也返回成功
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

  /**
   * 获取 IP 黑名单列表 (分页)
   */
  async getIpBlacklist(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string || '50', 10);
      const offset = parseInt(req.query.offset as string || '0', 10);
      const result = await ipBlacklistService.getBlacklist(limit, offset);
      res.json(result);
    } catch (error: any) {
      console.error('获取 IP 黑名单时出错:', error);
      res.status(500).json({ message: '获取 IP 黑名单失败', error: error.message });
    }
  },

  /**
   * 从 IP 黑名单中删除一个 IP
   */
  async deleteIpFromBlacklist(req: Request, res: Response): Promise<void> {
    try {
      const ipToDelete = req.params.ip;
      if (!ipToDelete) {
        res.status(400).json({ message: '缺少要删除的 IP 地址' });
        return;
      }
      // TODO: 可以添加对 IP 格式的验证
      await ipBlacklistService.removeFromBlacklist(ipToDelete);
      // 记录审计日志 (可选)
      // auditLogService.logAction('IP_BLACKLIST_REMOVED', { ip: ipToDelete });
      res.status(200).json({ message: `IP 地址 ${ipToDelete} 已从黑名单中移除` });
    } catch (error: any) {
      console.error(`从 IP 黑名单删除 ${req.params.ip} 时出错:`, error);
      res.status(500).json({ message: '从 IP 黑名单删除失败', error: error.message });
    }
  }
};
