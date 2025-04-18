import * as appearanceRepository from '../repositories/appearance.repository';
import { AppearanceSettings, UpdateAppearanceDto } from '../types/appearance.types';
import * as terminalThemeRepository from '../repositories/terminal-theme.repository'; // 需要验证 activeTerminalThemeId

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
      const themeIdNum = parseInt(settingsDto.activeTerminalThemeId, 10);
      if (isNaN(themeIdNum)) {
          throw new Error(`无效的终端主题 ID 格式: ${settingsDto.activeTerminalThemeId}`);
      }
      try {
          const themeExists = await terminalThemeRepository.findThemeById(themeIdNum);
          if (!themeExists) {
              throw new Error(`指定的终端主题 ID 不存在: ${settingsDto.activeTerminalThemeId}`);
          }
      } catch (e: any) { // Catch potential errors from findThemeById as well
          console.error(`验证终端主题 ID (${settingsDto.activeTerminalThemeId}) 时出错:`, e.message);
          // Rethrow a more specific error or the original one
          throw new Error(`验证终端主题 ID 时出错: ${e.message || settingsDto.activeTerminalThemeId}`);
      }
  } else if (settingsDto.hasOwnProperty('activeTerminalThemeId')) {
      // Handle explicit setting to null/undefined (meaning reset to default/no theme)
      // The repository update logic handles null/undefined correctly, so no specific validation needed here.
      // We just need to ensure the key exists in the DTO if it's meant to be cleared.
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

// 注意：背景图片上传/处理逻辑需要根据最终决定（URL vs 上传）来添加。
