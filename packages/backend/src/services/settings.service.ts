import { settingsRepository, Setting, getSidebarConfig as getSidebarConfigFromRepo, setSidebarConfig as setSidebarConfigInRepo } from '../repositories/settings.repository'; // Import specific repo functions
import { SidebarConfig, PaneName, UpdateSidebarConfigDto } from '../types/settings.types';

// +++ 定义焦点切换配置项接口 (与前端 store 保持一致) +++
interface ConfigurableFocusableItem {
  id: string;
  shortcut?: string;
}

// --- 移除旧的默认字符串数组 ---
// const DEFAULT_FOCUS_SEQUENCE = ["quickCommandsSearch", "commandHistorySearch", "fileManagerSearch", "commandInput", "terminalSearch"];
const FOCUS_SEQUENCE_KEY = 'focusSwitcherSequence'; // 焦点切换顺序设置键
const NAV_BAR_VISIBLE_KEY = 'navBarVisible'; // 导航栏可见性设置键
const LAYOUT_TREE_KEY = 'layoutTree'; // 布局树设置键
const AUTO_COPY_ON_SELECT_KEY = 'autoCopyOnSelect'; // 终端选中自动复制设置键
const STATUS_MONITOR_INTERVAL_SECONDS_KEY = 'statusMonitorIntervalSeconds'; // 状态监控间隔设置键
const DEFAULT_STATUS_MONITOR_INTERVAL_SECONDS = 3; // 默认状态监控间隔

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
  async getFocusSwitcherSequence(): Promise<ConfigurableFocusableItem[]> { // +++ 更新返回类型 +++
    console.log(`[Service] Attempting to get setting for key: ${FOCUS_SEQUENCE_KEY}`);
    try {
      const configJson = await settingsRepository.getSetting(FOCUS_SEQUENCE_KEY);
      console.log(`[Service] Raw value from repository for ${FOCUS_SEQUENCE_KEY}:`, configJson);
      if (configJson) {
        const config = JSON.parse(configJson);
        // +++ 验证新的数据结构 +++
        if (Array.isArray(config) && config.every(item =>
            typeof item === 'object' && item !== null && typeof item.id === 'string' &&
            (item.shortcut === undefined || typeof item.shortcut === 'string')
        )) {
          console.log('[Service] Fetched and validated focus switcher config:', JSON.stringify(config));
          return config as ConfigurableFocusableItem[];
        } else {
          console.warn('[Service] Invalid focus switcher config format found in settings. Returning empty array.');
        }
      } else {
        console.log('[Service] No focus switcher config found in settings. Returning empty array.');
      }
    } catch (error) {
      console.error(`[Service] Error parsing focus switcher config from settings (key: ${FOCUS_SEQUENCE_KEY}):`, error);
    }
    // +++ 返回空数组作为默认值 +++
    console.log('[Service] Returning empty array as default focus config.');
    return [];
  },

  /**
   * 设置焦点切换顺序
   * @param sequence 要保存的焦点切换顺序数组
   */
  async setFocusSwitcherSequence(config: ConfigurableFocusableItem[]): Promise<void> { // +++ 更新参数类型 +++
    console.log('[Service] setFocusSwitcherSequence called with new config format:', JSON.stringify(config));
    // +++ 验证新的数据结构 (虽然控制器层已验证，服务层再次验证更健壮) +++
    if (!Array.isArray(config) || !config.every(item =>
        typeof item === 'object' && item !== null && typeof item.id === 'string' &&
        (item.shortcut === undefined || typeof item.shortcut === 'string')
    )) {
       console.error('[Service] Attempted to save invalid focus switcher config format:', config);
       throw new Error('Invalid config format provided.');
    }
    try {
      const configJson = JSON.stringify(config); // +++ 序列化新的结构 +++
      console.log(`[Service] Attempting to save setting. Key: ${FOCUS_SEQUENCE_KEY}, Value: ${configJson}`);
      await settingsRepository.setSetting(FOCUS_SEQUENCE_KEY, configJson);
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
 }, // *** 确保这里有逗号 ***

 /**
  * 获取终端选中自动复制设置
  * @returns 返回是否启用该功能 (boolean)，如果未设置则默认为 false
  */
 async getAutoCopyOnSelect(): Promise<boolean> {
   console.log(`[Service] Attempting to get setting for key: ${AUTO_COPY_ON_SELECT_KEY}`);
   try {
     const enabledStr = await settingsRepository.getSetting(AUTO_COPY_ON_SELECT_KEY);
     console.log(`[Service] Raw value from repository for ${AUTO_COPY_ON_SELECT_KEY}:`, enabledStr);
     // 如果设置存在且值为 'true'，则返回 true，否则都返回 false (包括未设置或值为 'false' 的情况)
     return enabledStr === 'true';
   } catch (error) {
     console.error(`[Service] Error getting auto copy on select setting (key: ${AUTO_COPY_ON_SELECT_KEY}):`, error);
     // 出错时返回默认值 false
     return false;
   }
 }, // *** 确保这里有逗号 ***

 /**
  * 设置终端选中自动复制
  * @param enabled 是否启用 (boolean)
  */
 async setAutoCopyOnSelect(enabled: boolean): Promise<void> {
   console.log(`[Service] setAutoCopyOnSelect called with: ${enabled}`);
   try {
     const enabledStr = String(enabled); // 将布尔值转换为 'true' 或 'false'
     console.log(`[Service] Attempting to save setting. Key: ${AUTO_COPY_ON_SELECT_KEY}, Value: ${enabledStr}`);
     await settingsRepository.setSetting(AUTO_COPY_ON_SELECT_KEY, enabledStr);
     console.log(`[Service] Successfully saved setting for key: ${AUTO_COPY_ON_SELECT_KEY}`);
   } catch (error) {
     console.error(`[Service] Error calling settingsRepository.setSetting for key ${AUTO_COPY_ON_SELECT_KEY}:`, error);
     throw new Error('Failed to save auto copy on select setting.');
   }
 }, // *** 确保这里有逗号 ***

 /**
  * 获取状态监控轮询间隔 (秒)
  * @returns 返回间隔秒数 (number)，如果未设置或无效则返回默认值
  */
 async getStatusMonitorIntervalSeconds(): Promise<number> {
   console.log(`[Service] Attempting to get setting for key: ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}`);
   try {
     const intervalStr = await settingsRepository.getSetting(STATUS_MONITOR_INTERVAL_SECONDS_KEY);
     console.log(`[Service] Raw value from repository for ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}:`, intervalStr);
     if (intervalStr) {
       const intervalNum = parseInt(intervalStr, 10);
       // 验证是否为正整数
       if (!isNaN(intervalNum) && intervalNum > 0) {
         return intervalNum;
       } else {
         console.warn(`[Service] Invalid status monitor interval value found ('${intervalStr}'). Returning default.`);
       }
     } else {
       console.log(`[Service] No status monitor interval found in settings. Returning default.`);
     }
   } catch (error) {
     console.error(`[Service] Error getting status monitor interval setting (key: ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}):`, error);
   }
   // 返回默认值
   return DEFAULT_STATUS_MONITOR_INTERVAL_SECONDS;
 }, // *** 确保这里有逗号 ***

 /**
  * 设置状态监控轮询间隔 (秒)
  * @param interval 间隔秒数 (number)
  */
 async setStatusMonitorIntervalSeconds(interval: number): Promise<void> {
   console.log(`[Service] setStatusMonitorIntervalSeconds called with: ${interval}`);
   // 验证输入是否为正整数
   if (!Number.isInteger(interval) || interval <= 0) {
     console.error(`[Service] Attempted to save invalid status monitor interval: ${interval}`);
     throw new Error('Invalid interval value provided. Must be a positive integer.');
   }
   try {
     const intervalStr = String(interval);
     console.log(`[Service] Attempting to save setting. Key: ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}, Value: ${intervalStr}`);
     await settingsRepository.setSetting(STATUS_MONITOR_INTERVAL_SECONDS_KEY, intervalStr);
     console.log(`[Service] Successfully saved setting for key: ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}`);
   } catch (error) {
     console.error(`[Service] Error calling settingsRepository.setSetting for key ${STATUS_MONITOR_INTERVAL_SECONDS_KEY}:`, error);
     throw new Error('Failed to save status monitor interval setting.');
   }
 }, // *** 确保这里有逗号 ***

 // --- Sidebar Config Specific Functions ---

 /**
  * 获取侧栏配置
  * @returns Promise<SidebarConfig>
  */
 async getSidebarConfig(): Promise<SidebarConfig> {
     console.log('[SettingsService] Getting sidebar config...');
     // Directly call the specific repository function
     const config = await getSidebarConfigFromRepo();
     console.log('[SettingsService] Returning sidebar config:', config);
     return config;
 },

 /**
  * 设置侧栏配置
  * @param configDto - The sidebar configuration object from DTO
  * @returns Promise<void>
  */
 async setSidebarConfig(configDto: UpdateSidebarConfigDto): Promise<void> {
     console.log('[SettingsService] Setting sidebar config:', configDto);

     // --- Validation ---
     if (!configDto || typeof configDto !== 'object' || !Array.isArray(configDto.left) || !Array.isArray(configDto.right)) {
         throw new Error('无效的侧栏配置格式。必须包含 left 和 right 数组。');
     }

     // Validate PaneName (using the type imported)
     const validPaneNames: Set<PaneName> = new Set([
         'connections', 'terminal', 'commandBar', 'fileManager',
         'editor', 'statusMonitor', 'commandHistory', 'quickCommands',
         'dockerManager'
     ]);

     const validatePaneArray = (arr: any[], side: string) => {
         if (!arr.every(item => typeof item === 'string' && validPaneNames.has(item as PaneName))) {
             const invalidItems = arr.filter(item => typeof item !== 'string' || !validPaneNames.has(item as PaneName));
             throw new Error(`侧栏配置 (${side}) 包含无效的面板名称: ${invalidItems.join(', ')}`);
         }
     };

     validatePaneArray(configDto.left, 'left');
     validatePaneArray(configDto.right, 'right');

     // Prevent duplicates (optional, uncomment if needed)
     // const allPanes = [...configDto.left, ...configDto.right];
     // const uniquePanes = new Set(allPanes);
     // if (allPanes.length !== uniquePanes.size) {
     //     throw new Error('侧栏配置中不允许包含重复的面板。');
     // }

     // Prepare the data in the exact SidebarConfig format expected by the repo
     const configToSave: SidebarConfig = {
         left: configDto.left,
         right: configDto.right,
     };

     // Directly call the specific repository function
     await setSidebarConfigInRepo(configToSave);
     console.log('[SettingsService] Sidebar config successfully set.');
 } // <-- No comma after the last method in the object

}; // <-- End of settingsService object definition
