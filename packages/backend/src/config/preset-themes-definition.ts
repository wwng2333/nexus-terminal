import type { ITheme } from 'xterm';
import type { TerminalTheme } from '../types/terminal-theme.types';

// 定义基础的 ITheme 结构，用于类型提示
interface PresetITheme extends ITheme {
  name?: string; // itermcolors 文件可能包含 name
}

// 定义预设主题数组的类型，确保包含 preset_key
type PresetThemeDefinition = Omit<TerminalTheme, '_id' | 'createdAt' | 'updatedAt'> & { preset_key: string };

// 默认主题 (可以从 default-themes.ts 导入或直接定义)
const defaultThemeData: PresetITheme = {
    background: '#ffffff',
    foreground: '#000000',
    cursor: '#000000',
    cursorAccent: '#ffffff',
    selectionBackground: '#a7a7a7', // 使用更柔和的灰色作为选择背景
    black: '#000000',
    red: '#c50f1f',
    green: '#13a10e',
    yellow: '#c19c00',
    blue: '#0037da',
    magenta: '#881798',
    cyan: '#3a96dd',
    white: '#cccccc',
    brightBlack: '#767676',
    brightRed: '#e74856',
    brightGreen: '#16c60c',
    brightYellow: '#f9f1a5',
    brightBlue: '#3b78ff',
    brightMagenta: '#b4009e',
    brightCyan: '#61d6d6',
    brightWhite: '#ffffff',
};

// 其他预设主题 (从 iterm-themes.ts 迁移并添加 preset_key)
// 注意：需要将原 iterm-themes.ts 中的主题数据转换为 ITheme 格式
// 这里仅作示例，你需要将实际的主题数据填充进来

const solarizedDark: PresetITheme = {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4', // Note: Original Solarized might use a different magenta
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
};

const oneDark: PresetITheme = {
    foreground: '#abb2bf',
    background: '#282c34',
    cursor: '#abb2bf',
    selectionBackground: '#3e4451', // A slightly lighter background for selection
    black: '#282c34', // Often same as background
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf', // Often same as foreground
    brightBlack: '#5c6370', // A darker grey
    brightRed: '#e06c75', // Often same as normal red
    brightGreen: '#98c379', // Often same as normal green
    brightYellow: '#e5c07b', // Often same as normal yellow
    brightBlue: '#61afef', // Often same as normal blue
    brightMagenta: '#c678dd', // Often same as normal magenta
    brightCyan: '#56b6c2', // Often same as normal cyan
    brightWhite: '#ffffff', // Pure white for bright white
};

// ... (添加其他所有需要的预设主题)

// 导出预设主题数组
export const presetTerminalThemes: PresetThemeDefinition[] = [
  {
    preset_key: 'default', // 指定一个唯一的 key
    name: '默认', // 显示名称
    themeData: defaultThemeData,
    isPreset: true,
  },
  {
    preset_key: 'solarized-dark',
    name: 'Solarized Dark',
    themeData: solarizedDark,
    isPreset: true,
  },
  {
    preset_key: 'one-dark',
    name: 'One Dark',
    themeData: oneDark,
    isPreset: true,
  },
  // ... (添加其他所有预设主题对象)
];