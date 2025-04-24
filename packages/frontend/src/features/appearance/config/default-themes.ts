import type { ITheme } from 'xterm';

// 默认 xterm 主题
// (与 backend/src/config/default-themes.ts 中的定义保持一致)
export const defaultXtermTheme: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: '#264f78', // 使用 selectionBackground
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
};

// 默认 UI 主题 (CSS 变量)
// (与 backend/src/config/default-themes.ts 中的定义保持一致)
export const defaultUiTheme: Record<string, string> = {
  '--app-bg-color': '#ffffff',
  '--text-color': '#333333',
  '--text-color-secondary': '#666666',
  '--border-color': '#cccccc',
  '--link-color': '#333333', // 修复：扩展为 #rrggbb
  '--link-hover-color': '#0056b3',
  '--link-active-color': '#007bff',
  '--link-active-bg-color': '#e0e0ff', /* Added */
  '--nav-item-active-bg-color': 'var(--link-active-bg-color)', /* Added */
  '--header-bg-color': '#f0f0f0',
  '--footer-bg-color': '#f0f0f0',
  '--button-bg-color': '#007bff',
  '--button-text-color': '#ffffff',
  '--button-hover-bg-color': '#0056b3',
  // Added new variables
  '--icon-color': 'var(--text-color-secondary)', // 图标颜色
  '--icon-hover-color': 'var(--link-hover-color)', // 图标悬停颜色
  '--split-line-color': 'var(--border-color)', /* 分割线颜色 */
  '--split-line-hover-color': 'var(--border-color)', /* 分割线悬停颜色 */
  '--input-focus-border-color': 'var(--link-active-color)', /* 输入框聚焦边框颜色 */
  '--input-focus-glow': 'var(--link-active-color)', /* 输入框聚焦光晕值 */
  '--ssh-tab-active': 'transparent', /* Added SSH Tab Active */
  '--ssh-tab-background': 'transparent', /* Added SSH Tab Background */
  '--overlay-bg-color': '#000000', /* Added Overlay Background - 修复：改为 #rrggbb 格式 */
  // End added variables
  '--font-family-sans-serif': 'sans-serif',
  '--base-padding': '1rem',
  '--base-margin': '0.5rem',
};
