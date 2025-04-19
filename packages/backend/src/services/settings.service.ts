import { settingsRepository, Setting } from '../repositories/settings.repository';

// +++ 定义默认的焦点切换顺序 +++
const DEFAULT_FOCUS_SEQUENCE = ["quickCommandsSearch", "commandHistorySearch", "fileManagerSearch", "commandInput", "terminalSearch"];
const FOCUS_SEQUENCE_KEY = 'focusSwitcherSequence'; // 焦点切换顺序设置键
const NAV_BAR_VISIBLE_KEY = 'navBarVisible'; // 导航栏可见性设置键
const LAYOUT_TREE_KEY = 'layoutTree'; // 布局树设置键

export const settingsService = {
  /**
   * 获取所有设置项
   * @returns 返回包含所有设置项的键值对记录
   */
  async getAllSettings(): Promise<Record<string, string>> {
    console.log('[Service] Calling repository.getAllSettings...');
    const settingsArray = await settingsRepository.getAllSettings();
    console.log('[Service] Got settings array from repository:', JSON.stringify(settingsArray));
    const settingsRecord: Record<string, string> = {};
    settingsArray.forEach(setting => {
      settingsRecord[setting.key] = setting.value;
    });
    return settingsRecord;
  },

  /**
   * 获取单个设置项的值
   * @param key 设置项的键
   * @returns 返回设置项的值，如果不存在则返回 null
   */
  async getSetting(key: string): Promise<string | null> {
    return settingsRepository.getSetting(key);
  },

  /**
   * 设置单个设置项的值 (如果键已存在则更新)
   * @param key 设置项的键
   * @param value 设置项的值
   */
  async setSetting(key: string, value: string): Promise<void> {
    await settingsRepository.setSetting(key, value);
  },

  /**
   * 批量设置多个设置项的值
   * @param settings 包含多个设置项键值对的对象
   */
  async setMultipleSettings(settings: Record<string, string>): Promise<void> {
    console.log('[Service] Calling repository.setMultipleSettings with:', JSON.stringify(settings));
    await settingsRepository.setMultipleSettings(settings);
    console.log('[Service] Finished repository.setMultipleSettings.');
  },

  /**
   * 删除单个设置项
   * @param key 要删除的设置项的键
   */
  async deleteSetting(key: string): Promise<void> {
    await settingsRepository.deleteSetting(key);
  },

  /**
   * 获取 IP 白名单设置
   * @returns 返回包含启用状态和白名单列表的对象
   */
  async getIpWhitelistSettings(): Promise<{ enabled: boolean; whitelist: string }> {
    const enabledStr = await settingsRepository.getSetting('ipWhitelistEnabled');
    const whitelist = await settingsRepository.getSetting('ipWhitelist');
    return {
      enabled: enabledStr === 'true',
      whitelist: whitelist ?? '',
    };
  },

  /**
   * 更新 IP 白名单设置
   * @param enabled 是否启用 IP 白名单
   * @param whitelist 允许的 IP 地址/CIDR 列表 (字符串形式)
   */
  async updateIpWhitelistSettings(enabled: boolean, whitelist: string): Promise<void> {
    await Promise.all([
      settingsRepository.setSetting('ipWhitelistEnabled', String(enabled)),
      settingsRepository.setSetting('ipWhitelist', whitelist),
    ]);
  },

  /**
   * 获取焦点切换顺序
   * @returns 返回存储的焦点切换顺序数组，如果未设置或无效则返回默认顺序
   */
  async getFocusSwitcherSequence(): Promise<string[]> {
    console.log(`[Service] Attempting to get setting for key: ${FOCUS_SEQUENCE_KEY}`);
    try {
      const sequenceJson = await settingsRepository.getSetting(FOCUS_SEQUENCE_KEY);
      console.log(`[Service] Raw value from repository for ${FOCUS_SEQUENCE_KEY}:`, sequenceJson);
      if (sequenceJson) {
        const sequence = JSON.parse(sequenceJson);
        if (Array.isArray(sequence) && sequence.every(item => typeof item === 'string')) {
          console.log('[Service] Fetched and validated focus switcher sequence:', JSON.stringify(sequence));
          return sequence;
        } else {
          console.warn('[Service] Invalid focus switcher sequence format found in settings. Returning default.');
        }
      } else {
        console.log('[Service] No focus switcher sequence found in settings. Returning default.');
      }
    } catch (error) {
      console.error(`[Service] Error parsing focus switcher sequence from settings (key: ${FOCUS_SEQUENCE_KEY}):`, error);
    }
    console.log('[Service] Returning default focus sequence:', JSON.stringify(DEFAULT_FOCUS_SEQUENCE));
    return [...DEFAULT_FOCUS_SEQUENCE];
  },

  /**
   * 设置焦点切换顺序
   * @param sequence 要保存的焦点切换顺序数组
   */
  async setFocusSwitcherSequence(sequence: string[]): Promise<void> {
    console.log('[Service] setFocusSwitcherSequence called with:', JSON.stringify(sequence));
    if (!Array.isArray(sequence) || !sequence.every(item => typeof item === 'string')) {
       console.error('[Service] Attempted to save invalid focus switcher sequence format:', sequence);
       throw new Error('Invalid sequence format provided.');
    }
    try {
      const sequenceJson = JSON.stringify(sequence);
      console.log(`[Service] Attempting to save setting. Key: ${FOCUS_SEQUENCE_KEY}, Value: ${sequenceJson}`);
      await settingsRepository.setSetting(FOCUS_SEQUENCE_KEY, sequenceJson);
      console.log(`[Service] Successfully saved setting for key: ${FOCUS_SEQUENCE_KEY}`);
    } catch (error) {
      console.error(`[Service] Error calling settingsRepository.setSetting for key ${FOCUS_SEQUENCE_KEY}:`, error);
      throw new Error('Failed to save focus switcher sequence.');
    }
  }, // *** 确保这里有逗号 ***

  /**
   * 获取导航栏可见性设置
   * @returns 返回导航栏是否可见 (boolean)，如果未设置则默认为 true
   */
  async getNavBarVisibility(): Promise<boolean> {
    console.log(`[Service] Attempting to get setting for key: ${NAV_BAR_VISIBLE_KEY}`);
    try {
      const visibleStr = await settingsRepository.getSetting(NAV_BAR_VISIBLE_KEY);
      console.log(`[Service] Raw value from repository for ${NAV_BAR_VISIBLE_KEY}:`, visibleStr);
      // 如果设置存在且值为 'false'，则返回 false，否则都返回 true (包括未设置的情况)
      return visibleStr !== 'false';
    } catch (error) {
      console.error(`[Service] Error getting nav bar visibility setting (key: ${NAV_BAR_VISIBLE_KEY}):`, error);
      // 出错时返回默认值 true
      return true;
    }
  }, // *** 确保这里有逗号 ***

  /**
   * 设置导航栏可见性
   * @param visible 是否可见 (boolean)
   */
  async setNavBarVisibility(visible: boolean): Promise<void> {
    console.log(`[Service] setNavBarVisibility called with: ${visible}`);
    try {
      const visibleStr = String(visible); // 将布尔值转换为 'true' 或 'false'
      console.log(`[Service] Attempting to save setting. Key: ${NAV_BAR_VISIBLE_KEY}, Value: ${visibleStr}`);
      await settingsRepository.setSetting(NAV_BAR_VISIBLE_KEY, visibleStr);
      console.log(`[Service] Successfully saved setting for key: ${NAV_BAR_VISIBLE_KEY}`);
    } catch (error) {
      console.error(`[Service] Error calling settingsRepository.setSetting for key ${NAV_BAR_VISIBLE_KEY}:`, error);
      throw new Error('Failed to save nav bar visibility setting.');
    }
  }, // *** 确保这里有逗号 ***

 /**
  * 获取布局树设置
  * @returns 返回存储的布局树 JSON 字符串，如果未设置则返回 null
  */
 async getLayoutTree(): Promise<string | null> {
   console.log(`[Service] Attempting to get setting for key: ${LAYOUT_TREE_KEY}`);
   try {
     const layoutJson = await settingsRepository.getSetting(LAYOUT_TREE_KEY);
     console.log(`[Service] Raw value from repository for ${LAYOUT_TREE_KEY}:`, layoutJson ? layoutJson.substring(0, 100) + '...' : null); // 只打印部分内容
     return layoutJson; // 直接返回 JSON 字符串或 null
   } catch (error) {
     console.error(`[Service] Error getting layout tree setting (key: ${LAYOUT_TREE_KEY}):`, error);
     return null; // 出错时返回 null
   }
 }, // *** 确保这里有逗号 ***

 /**
  * 设置布局树
  * @param layoutJson 布局树的 JSON 字符串
  */
 async setLayoutTree(layoutJson: string): Promise<void> {
   console.log(`[Service] setLayoutTree called with JSON (first 100 chars): ${layoutJson.substring(0, 100)}...`);
   // 可选：在这里添加 JSON 格式验证
   try {
      JSON.parse(layoutJson); // 尝试解析以验证格式
   } catch (e) {
      console.error('[Service] Invalid JSON format provided for layout tree:', e);
      throw new Error('Invalid layout tree JSON format.');
   }

   try {
     console.log(`[Service] Attempting to save setting. Key: ${LAYOUT_TREE_KEY}`);
     await settingsRepository.setSetting(LAYOUT_TREE_KEY, layoutJson);
     console.log(`[Service] Successfully saved setting for key: ${LAYOUT_TREE_KEY}`);
   } catch (error) {
     console.error(`[Service] Error calling settingsRepository.setSetting for key ${LAYOUT_TREE_KEY}:`, error);
     throw new Error('Failed to save layout tree setting.');
   }
 } // *** 最后的方法后面不需要逗号 ***
};
