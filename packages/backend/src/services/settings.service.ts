import { settingsRepository, Setting } from '../repositories/settings.repository';

// +++ 定义默认的焦点切换顺序 +++
const DEFAULT_FOCUS_SEQUENCE = ["quickCommandsSearch", "commandHistorySearch", "fileManagerSearch", "commandInput", "terminalSearch"];
const FOCUS_SEQUENCE_KEY = 'focusSwitcherSequence'; // +++ 定义设置键常量 +++

export const settingsService = {
  // ... (getAllSettings, getSetting, setSetting, setMultipleSettings, deleteSetting, getIpWhitelistSettings, updateIpWhitelistSettings, getFocusSwitcherSequence 保持不变) ...

  /**
   * 获取所有设置项
   * @returns 返回包含所有设置项的数组
   */
  async getAllSettings(): Promise<Record<string, string>> {
    console.log('[Service] Calling repository.getAllSettings...'); // 添加日志
    const settingsArray = await settingsRepository.getAllSettings();
    console.log('[Service] Got settings array from repository:', JSON.stringify(settingsArray)); // 添加日志
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
    console.log('[Service] Calling repository.setMultipleSettings with:', JSON.stringify(settings)); // 添加日志
    await settingsRepository.setMultipleSettings(settings);
    console.log('[Service] Finished repository.setMultipleSettings.'); // 添加日志
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
      enabled: enabledStr === 'true', // 将字符串 'true' 转换为布尔值
      whitelist: whitelist ?? '', // 如果为 null 则返回空字符串
    };
  },

  /**
   * 更新 IP 白名单设置
   * @param enabled 是否启用 IP 白名单
   * @param whitelist 允许的 IP 地址/CIDR 列表 (字符串形式)
   */
  async updateIpWhitelistSettings(enabled: boolean, whitelist: string): Promise<void> {
    await Promise.all([
      settingsRepository.setSetting('ipWhitelistEnabled', String(enabled)), // 将布尔值转换为字符串
      settingsRepository.setSetting('ipWhitelist', whitelist),
    ]);
  },

  // +++ 新增：获取焦点切换顺序 +++
  /**
   * 获取焦点切换顺序
   * @returns 返回存储的焦点切换顺序数组，如果未设置或无效则返回默认顺序
   */
  async getFocusSwitcherSequence(): Promise<string[]> {
    console.log(`[Service] Attempting to get setting for key: ${FOCUS_SEQUENCE_KEY}`); // +++ 添加日志 +++
    try {
      const sequenceJson = await settingsRepository.getSetting(FOCUS_SEQUENCE_KEY);
      console.log(`[Service] Raw value from repository for ${FOCUS_SEQUENCE_KEY}:`, sequenceJson); // +++ 添加日志 +++
      if (sequenceJson) {
        const sequence = JSON.parse(sequenceJson);
        // 基本验证：确保它是一个数组并且包含字符串
        if (Array.isArray(sequence) && sequence.every(item => typeof item === 'string')) {
          console.log('[Service] Fetched and validated focus switcher sequence:', JSON.stringify(sequence)); // +++ 更新日志 +++
          return sequence;
        } else {
          console.warn('[Service] Invalid focus switcher sequence format found in settings. Returning default.');
        }
      } else {
        console.log('[Service] No focus switcher sequence found in settings. Returning default.');
      }
    } catch (error) {
      console.error(`[Service] Error parsing focus switcher sequence from settings (key: ${FOCUS_SEQUENCE_KEY}):`, error); // +++ 更新日志 +++
    }
    // 如果发生错误或未找到/无效，返回默认值
    console.log('[Service] Returning default focus sequence:', JSON.stringify(DEFAULT_FOCUS_SEQUENCE)); // +++ 添加日志 +++
    return [...DEFAULT_FOCUS_SEQUENCE]; // 返回默认值的副本
  },

  // +++ 新增：设置焦点切换顺序 +++
  /**
   * 设置焦点切换顺序
   * @param sequence 要保存的焦点切换顺序数组
   */
  async setFocusSwitcherSequence(sequence: string[]): Promise<void> {
    console.log('[Service] setFocusSwitcherSequence called with:', JSON.stringify(sequence)); // +++ 添加日志 +++
    // 基本验证
    if (!Array.isArray(sequence) || !sequence.every(item => typeof item === 'string')) {
       console.error('[Service] Attempted to save invalid focus switcher sequence format:', sequence);
       throw new Error('Invalid sequence format provided.'); // 抛出错误阻止保存无效数据
    }
    try {
      const sequenceJson = JSON.stringify(sequence);
      console.log(`[Service] Attempting to save setting. Key: ${FOCUS_SEQUENCE_KEY}, Value: ${sequenceJson}`); // +++ 添加日志 +++
      await settingsRepository.setSetting(FOCUS_SEQUENCE_KEY, sequenceJson);
      console.log(`[Service] Successfully saved setting for key: ${FOCUS_SEQUENCE_KEY}`); // +++ 添加日志 +++
    } catch (error) {
      console.error(`[Service] Error calling settingsRepository.setSetting for key ${FOCUS_SEQUENCE_KEY}:`, error); // +++ 更新日志 +++
      throw new Error('Failed to save focus switcher sequence.'); // 重新抛出错误
    }
  },
};
