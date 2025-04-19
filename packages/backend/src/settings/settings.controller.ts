import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';
import { AuditLogService } from '../services/audit.service'; // 引入 AuditLogService
import { ipBlacklistService } from '../services/ip-blacklist.service'; // 引入 IP 黑名单服务

const auditLogService = new AuditLogService(); // 实例化 AuditLogService

export const settingsController = {
  // ... (getAllSettings, updateSettings, getFocusSwitcherSequence 保持不变) ...

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

      // --- 过滤掉外观设置和焦点切换顺序相关的键 ---
      const allowedSettingsKeys = [
          'language', 'ipWhitelist', 'maxLoginAttempts', 'loginBanDuration',
          'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled'
          // 不在此处处理 'focusSwitcherSequence'
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
      const updatedKeys = Object.keys(filteredSettings);
      if (updatedKeys.length > 0) {
          if (updatedKeys.includes('ipWhitelist') || updatedKeys.includes('ipWhitelistEnabled')) {
              auditLogService.logAction('IP_WHITELIST_UPDATED', { updatedKeys });
          } else {
              auditLogService.logAction('SETTINGS_UPDATED', { updatedKeys });
          }
      }
      res.status(200).json({ message: '设置已成功更新' });
    } catch (error: any) {
      console.error('更新设置时出错:', error);
      res.status(500).json({ message: '更新设置失败', error: error.message });
    }
  },

  // +++ 新增：获取焦点切换顺序 +++
  /**
   * 获取焦点切换顺序
   */
  async getFocusSwitcherSequence(req: Request, res: Response): Promise<void> {
    try {
      console.log('[Controller] Received request to get focus switcher sequence.'); // +++ 添加日志 +++
      const sequence = await settingsService.getFocusSwitcherSequence();
      console.log('[Controller] Sending focus switcher sequence to client:', JSON.stringify(sequence)); // +++ 添加日志 +++
      res.json(sequence);
    } catch (error: any) {
      console.error('[Controller] 获取焦点切换顺序时出错:', error); // +++ 更新日志前缀 +++
      res.status(500).json({ message: '获取焦点切换顺序失败', error: error.message });
    }
  },

  // +++ 新增：设置焦点切换顺序 +++
  /**
   * 设置焦点切换顺序
   */
  async setFocusSwitcherSequence(req: Request, res: Response): Promise<void> {
    console.log('[Controller] Received request to set focus switcher sequence.'); // +++ 添加日志 +++
    try {
      const { sequence } = req.body;
      console.log('[Controller] Request body sequence:', JSON.stringify(sequence)); // +++ 添加日志 +++

      // 输入验证
      if (!Array.isArray(sequence) || !sequence.every(item => typeof item === 'string')) {
        console.warn('[Controller] Invalid sequence format received:', sequence); // +++ 添加日志 +++
        res.status(400).json({ message: '无效的请求体，"sequence" 必须是一个字符串数组' });
        return;
      }

      console.log('[Controller] Calling settingsService.setFocusSwitcherSequence...'); // +++ 添加日志 +++
      await settingsService.setFocusSwitcherSequence(sequence);
      console.log('[Controller] settingsService.setFocusSwitcherSequence completed successfully.'); // +++ 添加日志 +++

      // 记录审计日志 (可选)
      console.log('[Controller] Logging audit action: FOCUS_SWITCHER_SEQUENCE_UPDATED'); // +++ 添加日志 +++
      auditLogService.logAction('FOCUS_SWITCHER_SEQUENCE_UPDATED', { sequence });

      console.log('[Controller] Sending success response.'); // +++ 添加日志 +++
      res.status(200).json({ message: '焦点切换顺序已成功更新' });
    } catch (error: any) {
      console.error('[Controller] 设置焦点切换顺序时出错:', error); // +++ 更新日志前缀 +++
      // 区分是服务层抛出的验证错误还是其他错误
      if (error.message === 'Invalid sequence format provided.') {
          res.status(400).json({ message: '设置焦点切换顺序失败: 无效的格式', error: error.message });
      } else {
          res.status(500).json({ message: '设置焦点切换顺序失败', error: error.message });
      }
    }
  },

 // +++ 新增：获取导航栏可见性 +++
 /**
  * 获取导航栏可见性设置
  */
 async getNavBarVisibility(req: Request, res: Response): Promise<void> {
   try {
     console.log('[Controller] Received request to get nav bar visibility.');
     const isVisible = await settingsService.getNavBarVisibility();
     console.log(`[Controller] Sending nav bar visibility to client: ${isVisible}`);
     res.json({ visible: isVisible }); // 返回包含 visible 键的对象
   } catch (error: any) {
     console.error('[Controller] 获取导航栏可见性时出错:', error);
     res.status(500).json({ message: '获取导航栏可见性失败', error: error.message });
   }
 },

 // +++ 新增：设置导航栏可见性 +++
 /**
  * 设置导航栏可见性
  */
 async setNavBarVisibility(req: Request, res: Response): Promise<void> {
   console.log('[Controller] Received request to set nav bar visibility.');
   try {
     const { visible } = req.body;
     console.log('[Controller] Request body visible:', visible);

     // 输入验证
     if (typeof visible !== 'boolean') {
       console.warn('[Controller] Invalid visible format received:', visible);
       res.status(400).json({ message: '无效的请求体，"visible" 必须是一个布尔值' });
       return;
     }

     console.log('[Controller] Calling settingsService.setNavBarVisibility...');
     await settingsService.setNavBarVisibility(visible);
     console.log('[Controller] settingsService.setNavBarVisibility completed successfully.');

     // 记录审计日志 (可选)
     // console.log('[Controller] Logging audit action: NAV_BAR_VISIBILITY_UPDATED');
     // auditLogService.logAction('NAV_BAR_VISIBILITY_UPDATED', { visible });

     console.log('[Controller] Sending success response.');
     res.status(200).json({ message: '导航栏可见性已成功更新' });
   } catch (error: any) {
     console.error('[Controller] 设置导航栏可见性时出错:', error);
     res.status(500).json({ message: '设置导航栏可见性失败', error: error.message });
   }
 },

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
