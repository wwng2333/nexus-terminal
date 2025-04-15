import { settingsRepository, Setting } from '../repositories/settings.repository';

export const settingsService = {
  /**
   * 获取所有设置项
   * @returns 返回包含所有设置项的数组
   */
  async getAllSettings(): Promise<Record<string, string>> {
    const settingsArray = await settingsRepository.getAllSettings();
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
    await settingsRepository.setMultipleSettings(settings);
  },

  /**
   * 删除单个设置项
   * @param key 要删除的设置项的键
   */
  async deleteSetting(key: string): Promise<void> {
    await settingsRepository.deleteSetting(key);
  },
};
