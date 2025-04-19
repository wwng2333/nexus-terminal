// packages/frontend/src/stores/iterm-themes.ts
    import type { TerminalTheme } from '../../../backend/src/types/terminal-theme.types';

    // 注意：这里的颜色值是示例，需要根据实际的 .itermcolors 文件精确转换
    export const solarizedDarkPreset: TerminalTheme = {
      _id: 'preset-solarized-dark',
      name: 'Solarized Dark (iTerm)',
      isPreset: true,
      themeData: {
        foreground: '#839496',
        background: '#002b36',
        cursor: '#93a1a1',
        selectionBackground: '#073642',
        selectionForeground: '#93a1a1', // 可能需要指定
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#002b36', // iTerm 的 Bright Black 通常是 Normal Black
        brightRed: '#cb4b16', // Orange
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4', // Violet
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3',
      }
    };

    export const draculaPreset: TerminalTheme = {
      _id: 'preset-dracula',
      name: 'Dracula (iTerm)',
      isPreset: true,
      themeData: {
        foreground: '#f8f8f2',
        background: '#282a36',
        cursor: '#f8f8f2',
        selectionBackground: '#44475a',
        selectionForeground: '#f8f8f2',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      }
    };

    // 可以继续添加更多预设主题...
    // export const oneDarkPreset: TerminalTheme = { ... };

    export const presetTerminalThemes: TerminalTheme[] = [
      solarizedDarkPreset,
      draculaPreset,
      // oneDarkPreset,
    ];