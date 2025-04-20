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
      const settingsToUpdate: Record<string, string> = req.body;
      if (typeof settingsToUpdate !== 'object' || settingsToUpdate === null) {
        res.status(400).json({ message: '无效的请求体，应为 JSON 对象' });
        return;
      }

      const allowedSettingsKeys = [
          'language', 'ipWhitelist', 'maxLoginAttempts', 'loginBanDuration',
          'showPopupFileEditor', 'shareFileEditorTabs', 'ipWhitelistEnabled',
          'autoCopyOnSelect', 'dockerStatusIntervalSeconds', 'dockerDefaultExpand',
          'statusMonitorIntervalSeconds' // +++ 添加状态监控间隔键 +++
      ];
      const filteredSettings: Record<string, string> = {};
      for (const key in settingsToUpdate) {
          if (allowedSettingsKeys.includes(key)) {
              filteredSettings[key] = settingsToUpdate[key];
          }
      }

      if (Object.keys(filteredSettings).length > 0) {
          await settingsService.setMultipleSettings(filteredSettings);
      }

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

  /**
   * 获取焦点切换顺序
   */
  async getFocusSwitcherSequence(req: Request, res: Response): Promise<void> {
    try {
      console.log('[Controller] Received request to get focus switcher sequence.');
      const sequence = await settingsService.getFocusSwitcherSequence();
      console.log('[Controller] Sending focus switcher sequence to client:', JSON.stringify(sequence));
      res.json(sequence);
    } catch (error: any) {
      console.error('[Controller] 获取焦点切换顺序时出错:', error);
      res.status(500).json({ message: '获取焦点切换顺序失败', error: error.message });
    }
  },

  /**
   * 设置焦点切换顺序
   */
  async setFocusSwitcherSequence(req: Request, res: Response): Promise<void> {
    console.log('[Controller] Received request to set focus switcher sequence.');
    try {
      const { sequence } = req.body;
      console.log('[Controller] Request body sequence:', JSON.stringify(sequence));

      if (!Array.isArray(sequence) || !sequence.every(item => typeof item === 'string')) {
        console.warn('[Controller] Invalid sequence format received:', sequence);
        res.status(400).json({ message: '无效的请求体，"sequence" 必须是一个字符串数组' });
        return;
      }

      console.log('[Controller] Calling settingsService.setFocusSwitcherSequence...');
      await settingsService.setFocusSwitcherSequence(sequence);
      console.log('[Controller] settingsService.setFocusSwitcherSequence completed successfully.');

      console.log('[Controller] Logging audit action: FOCUS_SWITCHER_SEQUENCE_UPDATED');
      auditLogService.logAction('FOCUS_SWITCHER_SEQUENCE_UPDATED', { sequence });

      console.log('[Controller] Sending success response.');
      res.status(200).json({ message: '焦点切换顺序已成功更新' });
    } catch (error: any) {
      console.error('[Controller] 设置焦点切换顺序时出错:', error);
      if (error.message === 'Invalid sequence format provided.') {
          res.status(400).json({ message: '设置焦点切换顺序失败: 无效的格式', error: error.message });
      } else {
          res.status(500).json({ message: '设置焦点切换顺序失败', error: error.message });
      }
    }
  },

 /**
  * 获取导航栏可见性设置
  */
 async getNavBarVisibility(req: Request, res: Response): Promise<void> {
   try {
     console.log('[Controller] Received request to get nav bar visibility.');
     const isVisible = await settingsService.getNavBarVisibility();
     console.log(`[Controller] Sending nav bar visibility to client: ${isVisible}`);
     res.json({ visible: isVisible });
   } catch (error: any) {
     console.error('[Controller] 获取导航栏可见性时出错:', error);
     res.status(500).json({ message: '获取导航栏可见性失败', error: error.message });
   }
 },

 /**
  * 设置导航栏可见性
  */
 async setNavBarVisibility(req: Request, res: Response): Promise<void> {
   console.log('[Controller] Received request to set nav bar visibility.');
   try {
     const { visible } = req.body;
     console.log('[Controller] Request body visible:', visible);

     if (typeof visible !== 'boolean') {
       console.warn('[Controller] Invalid visible format received:', visible);
       res.status(400).json({ message: '无效的请求体，"visible" 必须是一个布尔值' });
       return;
     }

     console.log('[Controller] Calling settingsService.setNavBarVisibility...');
     await settingsService.setNavBarVisibility(visible);
     console.log('[Controller] settingsService.setNavBarVisibility completed successfully.');

     // auditLogService.logAction('NAV_BAR_VISIBILITY_UPDATED', { visible });

     console.log('[Controller] Sending success response.');
     res.status(200).json({ message: '导航栏可见性已成功更新' });
   } catch (error: any) {
     console.error('[Controller] 设置导航栏可见性时出错:', error);
     res.status(500).json({ message: '设置导航栏可见性失败', error: error.message });
   }
 },

  /**
   * 获取布局树设置
   */
  async getLayoutTree(req: Request, res: Response): Promise<void> {
    try {
      console.log('[Controller] Received request to get layout tree.');
      const layoutJson = await settingsService.getLayoutTree();
      if (layoutJson) {
        try {
          const layout = JSON.parse(layoutJson);
          console.log('[Controller] Sending layout tree to client.');
          res.json(layout);
        } catch (parseError) {
          console.error('[Controller] Failed to parse layout tree JSON from DB:', parseError);
          res.status(500).json({ message: '获取布局树失败：存储的数据格式无效' });
        }
      } else {
        console.log('[Controller] No layout tree found in settings, sending null.');
        res.json(null);
      }
    } catch (error: any) {
      console.error('[Controller] 获取布局树时出错:', error);
      res.status(500).json({ message: '获取布局树失败', error: error.message });
    }
  },

  /**
   * 设置布局树
   */
  async setLayoutTree(req: Request, res: Response): Promise<void> {
    console.log('[Controller] Received request to set layout tree.');
    try {
      const layoutTree = req.body;

      if (typeof layoutTree !== 'object' || layoutTree === null) {
         console.warn('[Controller] Invalid layout tree format received (not an object):', layoutTree);
         res.status(400).json({ message: '无效的请求体，应为 JSON 对象格式的布局树' });
         return;
      }

      const layoutJson = JSON.stringify(layoutTree);

      console.log('[Controller] Calling settingsService.setLayoutTree...');
      await settingsService.setLayoutTree(layoutJson);
      console.log('[Controller] settingsService.setLayoutTree completed successfully.');

      // auditLogService.logAction('LAYOUT_TREE_UPDATED');

      console.log('[Controller] Sending success response.');
      res.status(200).json({ message: '布局树已成功更新' });
    } catch (error: any) {
      console.error('[Controller] 设置布局树时出错:', error);
       if (error.message === 'Invalid layout tree JSON format.') {
           res.status(400).json({ message: '设置布局树失败: 无效的 JSON 格式', error: error.message });
       } else {
           res.status(500).json({ message: '设置布局树失败', error: error.message });
       }
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
      await ipBlacklistService.removeFromBlacklist(ipToDelete);
      // auditLogService.logAction('IP_BLACKLIST_REMOVED', { ip: ipToDelete });
      res.status(200).json({ message: `IP 地址 ${ipToDelete} 已从黑名单中移除` });
    } catch (error: any) {
      console.error(`从 IP 黑名单删除 ${req.params.ip} 时出错:`, error);
      res.status(500).json({ message: '从 IP 黑名单删除失败', error: error.message });
    }
  }, // *** 确保这里有逗号 ***

  /**
   * 获取终端选中自动复制设置
   */
  async getAutoCopyOnSelect(req: Request, res: Response): Promise<void> {
    try {
      console.log('[Controller] Received request to get auto copy on select setting.');
      const isEnabled = await settingsService.getAutoCopyOnSelect();
      console.log(`[Controller] Sending auto copy on select setting to client: ${isEnabled}`);
      res.json({ enabled: isEnabled });
    } catch (error: any) {
      console.error('[Controller] 获取终端选中自动复制设置时出错:', error);
      res.status(500).json({ message: '获取终端选中自动复制设置失败', error: error.message });
    }
  }, // *** 确保这里有逗号 ***

  /**
   * 设置终端选中自动复制
   */
  async setAutoCopyOnSelect(req: Request, res: Response): Promise<void> {
    console.log('[Controller] Received request to set auto copy on select setting.');
    try {
      const { enabled } = req.body;
      console.log('[Controller] Request body enabled:', enabled);

      if (typeof enabled !== 'boolean') {
        console.warn('[Controller] Invalid enabled format received:', enabled);
        res.status(400).json({ message: '无效的请求体，"enabled" 必须是一个布尔值' });
        return;
      }

      console.log('[Controller] Calling settingsService.setAutoCopyOnSelect...');
      await settingsService.setAutoCopyOnSelect(enabled);
      console.log('[Controller] settingsService.setAutoCopyOnSelect completed successfully.');

      // auditLogService.logAction('AUTO_COPY_ON_SELECT_UPDATED', { enabled }); // 可选：添加审计日志

      console.log('[Controller] Sending success response.');
      res.status(200).json({ message: '终端选中自动复制设置已成功更新' });
    } catch (error: any) {
      console.error('[Controller] 设置终端选中自动复制时出错:', error);
      res.status(500).json({ message: '设置终端选中自动复制失败', error: error.message });
    }
  } // *** 最后的方法后面不需要逗号 ***
};
