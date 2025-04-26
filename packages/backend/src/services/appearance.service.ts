import * as appearanceRepository from '../repositories/appearance.repository';
import { AppearanceSettings, UpdateAppearanceDto } from '../types/appearance.types';
import * as terminalThemeRepository from '../repositories/terminal-theme.repository';

/**
 * 获取外观设置
 * @returns Promise<AppearanceSettings>
 */
export const getSettings = async (): Promise<AppearanceSettings> => {
  return appearanceRepository.getAppearanceSettings();
};

/**
 * 更新外观设置
 * @param settingsDto 更新数据
 * @returns Promise<boolean> 是否成功更新
 */
export const updateSettings = async (settingsDto: UpdateAppearanceDto): Promise<boolean> => {
  // 验证 activeTerminalThemeId (如果提供了)
  if (settingsDto.activeTerminalThemeId !== undefined && settingsDto.activeTerminalThemeId !== null) {
      const themeIdNum = settingsDto.activeTerminalThemeId; // ID is now number | null
      // 验证 ID 是否为有效的数字
      if (typeof themeIdNum !== 'number') {
           console.error(`[AppearanceService] 收到的 activeTerminalThemeId 不是有效的数字: ${themeIdNum}`);
           throw new Error(`无效的终端主题 ID 类型，应为数字。`);
      }
      try {
          // 直接使用数字 ID 调用 findThemeById 进行验证
          const themeExists = await terminalThemeRepository.findThemeById(themeIdNum);
          if (!themeExists) {
              console.warn(`[AppearanceService] 尝试更新为不存在的终端主题数字 ID: ${themeIdNum}`);
              throw new Error(`指定的终端主题 ID 不存在: ${themeIdNum}`);
          }
          console.log(`[AppearanceService] 终端主题数字 ID ${themeIdNum} 验证通过。`);
      } catch (e: any) {
          console.error(`[AppearanceService] 验证终端主题数字 ID (${themeIdNum}) 时出错:`, e.message);
          throw new Error(`验证终端主题 ID 时出错: ${e.message || themeIdNum}`);
      }
  } else if (settingsDto.hasOwnProperty('activeTerminalThemeId') && settingsDto.activeTerminalThemeId === null) {
      // 处理显式设置为 null (表示重置为默认/无用户主题)
      console.log(`[AppearanceService] 接收到将 activeTerminalThemeId 设置为 null 的请求。`);
      // 仓库层会处理 null
  }

  // 验证 terminalFontSize (如果提供了)
  if (settingsDto.terminalFontSize !== undefined && settingsDto.terminalFontSize !== null) {
      const size = Number(settingsDto.terminalFontSize);
      if (isNaN(size) || size <= 0) {
          throw new Error(`无效的终端字体大小: ${settingsDto.terminalFontSize}。必须是一个正数。`);
      }
      // 可以选择将验证后的数字类型赋值回 DTO，以确保类型正确传递给仓库层
      settingsDto.terminalFontSize = size;
  }

  // 验证 editorFontSize (如果提供了)
  if (settingsDto.editorFontSize !== undefined && settingsDto.editorFontSize !== null) {
      const size = Number(settingsDto.editorFontSize);
      if (isNaN(size) || size <= 0) {
          throw new Error(`无效的编辑器字体大小: ${settingsDto.editorFontSize}。必须是一个正数。`);
      }
      // 确保类型正确传递给仓库层
      settingsDto.editorFontSize = size;
  }

  // TODO: 如果实现了背景图片上传，这里需要处理文件路径或 URL 的验证/保存逻辑

  return appearanceRepository.updateAppearanceSettings(settingsDto);
};


