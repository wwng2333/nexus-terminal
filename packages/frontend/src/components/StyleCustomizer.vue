<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppearanceStore } from '../stores/appearance.store'; // 使用新的 store
import { storeToRefs } from 'pinia';
import type { ITheme } from 'xterm';
import type { TerminalTheme } from '../../../backend/src/types/terminal-theme.types'; // 引入类型
import { defaultXtermTheme } from '../stores/default-themes'; // 引入默认主题

const { t } = useI18n();
const appearanceStore = useAppearanceStore();
const {
  appearanceSettings, // <-- 添加这个 ref
  currentUiTheme,
  // currentTerminalTheme, // 这个是计算属性，只读，在编辑时不需要直接用
  activeTerminalThemeId,
  availableTerminalThemes,
  currentTerminalFontFamily,
  currentTerminalFontSize,
  currentEditorFontSize, // <-- 新增
  pageBackgroundImage,
  // pageBackgroundOpacity, // Removed
  terminalBackgroundImage,
  // terminalBackgroundOpacity, // Removed
} = storeToRefs(appearanceStore);

// --- 本地状态用于编辑 ---
const editableUiTheme = ref<Record<string, string>>({});
const editableTerminalFontFamily = ref('');
const editableTerminalFontSize = ref(14);
const editableEditorFontSize = ref(14); // <-- 新增，编辑器字体大小
// const editablePageBackgroundOpacity = ref(1.0); // Removed
// const editableTerminalBackgroundOpacity = ref(1.0); // Removed
const editableUiThemeString = ref(''); // 用于 textarea 绑定
const themeParseError = ref<string | null>(null); // 用于显示 JSON 解析错误

// 终端主题管理相关状态
const isEditingTheme = ref(false); // 是否正在编辑某个主题
const themeSearchTerm = ref(''); // 主题搜索词
// 使用 reactive 确保嵌套对象 themeData 的响应性
// 修正：editingTheme 应该是一个 ref 包含 TerminalTheme 或 null
const editingTheme = ref<TerminalTheme | null>(null); // 正在编辑的主题数据副本 (完整结构)
const newThemeName = ref(''); // 新建主题的名称 (不再需要，直接编辑 editingTheme.value.name)

// 文件上传相关
const pageBgFileInput = ref<HTMLInputElement | null>(null);
const terminalBgFileInput = ref<HTMLInputElement | null>(null);
const themeImportInput = ref<HTMLInputElement | null>(null);
const uploadError = ref<string | null>(null);
const importError = ref<string | null>(null);
const saveThemeError = ref<string | null>(null); // 用于显示保存主题时的错误
const editableTerminalThemeString = ref(''); // 用于终端主题 textarea 绑定
const terminalThemeParseError = ref<string | null>(null); // 用于显示终端主题 JSON 解析错误
const terminalThemePlaceholder = '{\n  "background": "#000000",\n  "foreground": "#ffffff",\n  "cursor": "#ffffff",\n  "selectionBackground": "#555555",\n  "black": "#000000",\n  "red": "#ff0000",\n  "green": "#00ff00",\n  "yellow": "#ffff00",\n  "blue": "#0000ff",\n  "magenta": "#ff00ff",\n  "cyan": "#00ffff",\n  "white": "#ffffff",\n  "brightBlack": "#555555",\n  "brightRed": "#ff5555",\n  "brightGreen": "#55ff55",\n  "brightYellow": "#ffff55",\n  "brightBlue": "#5555ff",\n  "brightMagenta": "#ff55ff",\n  "brightCyan": "#55ffff",\n  "brightWhite": "#ffffff"\n}'; // 终端主题编辑器的 placeholder

// 初始化本地编辑状态
import { defaultUiTheme } from '../stores/default-themes'; // 确保导入默认主题
import { safeJsonParse } from '../stores/appearance.store'; // 导入辅助函数

const initializeEditableState = () => {
  // 获取用户保存的主题或空对象
  // 注意：直接从 store 的 appearanceSettings 获取原始字符串，避免依赖 currentUiTheme 计算属性可能带来的延迟或缓存问题
  const userThemeJson = appearanceSettings.value.customUiTheme;
  const userTheme = safeJsonParse(userThemeJson, {});

  // 合并默认主题和用户主题，确保所有默认键存在，并优先使用用户值
  const mergedTheme = { ...defaultUiTheme, ...userTheme }; // 用户值覆盖默认值

  // 深拷贝合并后的主题到 editableUiTheme
  editableUiTheme.value = JSON.parse(JSON.stringify(mergedTheme));

  // --- 其他初始化保持不变 ---
  editableTerminalFontFamily.value = currentTerminalFontFamily.value;
  editableTerminalFontSize.value = currentTerminalFontSize.value;
  editableEditorFontSize.value = currentEditorFontSize.value; // <-- 新增
  uploadError.value = null;
  importError.value = null;
  saveThemeError.value = null;
  themeParseError.value = null; // 初始化解析错误

  // 初始化 textarea 内容 (基于合并后的主题)
  try {
      const themeObject = editableUiTheme.value; // 使用合并后的主题
      if (themeObject && typeof themeObject === 'object' && Object.keys(themeObject).length > 0) {
          const lines = Object.entries(themeObject).map(([key, value]) => `${key}: ${value}`);
          editableUiThemeString.value = lines.join('\n');
      } else {
          editableUiThemeString.value = '';
      }
  } catch (e) {
      console.error("初始化 UI 主题字符串失败:", e);
      editableUiThemeString.value = ''; // Fallback to empty
  }
};

onMounted(initializeEditableState);

// 监听 store 变化以更新本地状态 (例如重置或外部更改)
// 只监听不需要编辑的状态或用于初始化的状态
// 监听 store 中可能影响初始化状态的值
// 主要监听 appearanceSettings (包含 customUiTheme) 和 activeTerminalThemeId
// 不再直接监听 currentUiTheme 计算属性，因为 initializeEditableState 现在直接处理合并逻辑
watch([
    () => appearanceStore.appearanceSettings, // 监听整个设置对象的变化
    activeTerminalThemeId
], (newVals, oldVals) => {
    // newVals[0] 是新的 appearanceSettings 对象
    // newVals[1] 是新的 activeTerminalThemeId
    const newSettings = newVals[0];
    const oldSettings = oldVals ? oldVals[0] : {}; // 可能没有旧值
    const newActiveThemeId = newVals[1];
    const oldActiveThemeId = oldVals ? oldVals[1] : null;

    // 仅当非编辑状态时，或活动终端主题ID变化时，或 UI 主题设置本身发生变化时 (例如重置)，才重新初始化
    if (!isEditingTheme.value || newActiveThemeId !== oldActiveThemeId || newSettings?.customUiTheme !== oldSettings?.customUiTheme) {
        console.log('[StyleCustomizer] Watch triggered re-initialization.');
        initializeEditableState(); // 调用修改后的初始化函数
    } else {
        // 如果正在编辑，只更新非编辑相关的部分 (不包括 UI 主题，因为它由 initializeEditableState 处理)
        console.log('[StyleCustomizer] Watch triggered partial update (editing).');
        // editableUiTheme.value = JSON.parse(JSON.stringify(newVals[0] || {})); // 移除或注释掉，避免覆盖编辑状态
        // 确保从正确的 newVals 索引获取值，现在 watch 的依赖项变了
        // 假设 appearanceSettings 是第一个依赖，activeTerminalThemeId 是第二个
        // 字体等信息需要从 newSettings 中获取
        editableTerminalFontFamily.value = newSettings?.terminalFontFamily || '';
        editableTerminalFontSize.value = newSettings?.terminalFontSize || 14;
        editableEditorFontSize.value = newSettings?.editorFontSize || 14; // <-- 新增同步
    }
}, { deep: true });


const emit = defineEmits(['close']);

const closeCustomizer = () => {
  // 如果正在编辑主题，直接关闭并重置状态
  if (isEditingTheme.value) {
      isEditingTheme.value = false; // 退出编辑状态
      editingTheme.value = null;
      saveThemeError.value = null; // 同时清除可能存在的保存错误
  }
  emit('close'); // 总是触发关闭事件
};

// 当前活动的标签页
const currentTab = ref<'ui' | 'terminal' | 'background' | 'other'>('ui'); // <-- 添加 'other'

// --- 处理函数 ---

// 保存 UI 主题更改
const handleSaveUiTheme = async () => {
  try {
    await appearanceStore.saveCustomUiTheme(editableUiTheme.value);
    alert(t('styleCustomizer.uiThemeSaved')); // 简单提示
  } catch (error: any) {
    console.error("保存 UI 主题失败:", error);
    alert(t('styleCustomizer.uiThemeSaveFailed', { message: error.message }));
  }
};

// 重置 UI 主题
const handleResetUiTheme = async () => {
    try {
        await appearanceStore.resetCustomUiTheme();
        // watch 会自动更新 editableUiTheme.value
        alert(t('styleCustomizer.uiThemeReset'));
    } catch (error: any) {
        console.error("重置 UI 主题失败:", error);
         alert(t('styleCustomizer.uiThemeResetFailed', { message: error.message }));
    }
};

// --- Textarea 和 Color Picker 同步 ---

// 计算属性：将本地编辑的 UI 主题对象格式化为内部键值对字符串（无大括号，无行尾逗号）
const formattedEditableUiThemeJson = computed(() => {
    try {
        const themeObject = editableUiTheme.value;
        if (!themeObject || typeof themeObject !== 'object' || Object.keys(themeObject).length === 0) {
            return ''; // Return empty string if no theme or empty
        }
        // Generate key-value pairs, indented, one per line
        // Generate key-value pairs, indented, one per line, without quotes for easier editing
        const lines = Object.entries(themeObject).map(([key, value]) => {
            // Output key and value directly without leading spaces
            return `${key}: ${value}`;
        });
        // Join with newline
        return lines.join('\n');
    } catch (e) {
        console.error("序列化可编辑 UI 主题键值对失败:", e);
        return ''; // 回退为空字符串
    }
});

// 监听计算属性的变化（通常由颜色选择器引起），更新 textarea 的内容
watch(formattedEditableUiThemeJson, (newJson) => {
    // 只有在 textarea 没有聚焦时才更新，避免覆盖用户输入
    // 或者，如果解析错误存在，也允许更新以显示正确格式
    if (document.activeElement?.id !== 'uiThemeTextarea' || themeParseError.value) {
        editableUiThemeString.value = newJson;
        if (themeParseError.value && document.activeElement?.id !== 'uiThemeTextarea') {
             themeParseError.value = null; // 如果外部更改修复了错误，清除错误提示
        }
    }
});

// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
// 处理 textarea 内容变化（失去焦点时）
const handleUiThemeStringChange = () => {
    themeParseError.value = null; // 清除之前的错误
    let inputText = editableUiThemeString.value.trim();

    // 如果内容为空，则视为空对象
    if (!inputText) {
        editableUiTheme.value = {};
        return;
    }

    // 准备构建 JSON 字符串
    let jsonStringToParse = inputText
        .split('\n') // 按行分割
        .map(line => line.trim()) // 去除每行首尾空格
        .filter(line => line && line.includes(':')) // 过滤空行和不包含冒号的行
        .map(line => {
            // 尝试为 key 和 value 添加引号（如果缺少）
            const parts = line.split(/:(.*)/s); // 按第一个冒号分割，保留后面的所有内容
            if (parts.length < 2) return null; // 无效行

            let key = parts[0].trim();
            let value = parts[1].trim();

            // 为 key 添加引号（如果需要）
            // 移除 key 可能存在的引号再用 stringify 包裹
            if (key.startsWith('"') && key.endsWith('"')) {
                key = key.slice(1, -1);
            }
             if (key.startsWith("'") && key.endsWith("'")) {
                key = key.slice(1, -1);
            }
            key = JSON.stringify(key); // 使用 JSON.stringify 保证正确转义

            // 为 value 添加引号（如果需要，且不是数字/布尔值/null）
            // 移除可能的尾随逗号
            if (value.endsWith(',')) {
                value = value.slice(0, -1).trim();
            }
            // 移除 value 可能存在的引号再判断
            let originalValue = value;
             if (value.startsWith('"') && value.endsWith('"')) {
                originalValue = value.slice(1, -1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                 originalValue = value.slice(1, -1);
            }

            // 判断是否需要加引号
            if (isNaN(Number(originalValue)) && originalValue !== 'true' && originalValue !== 'false' && originalValue !== 'null') {
                 value = JSON.stringify(originalValue); // 使用原始未加引号的值进行 stringify
            } else {
                // 对于数字、布尔值、null，不需要加引号
                value = originalValue;
            }


            return `  ${key}: ${value}`; // 返回带缩进的键值对
        })
        .filter(line => line !== null) // 过滤掉处理失败的行
        .join(',\n'); // 用逗号和换行符连接

    // 添加外层大括号
    const fullJsonString = `{\n${jsonStringToParse}\n}`;

    try {
        const parsedTheme = JSON.parse(fullJsonString);
        // 基础验证：确保是对象
        if (typeof parsedTheme !== 'object' || parsedTheme === null || Array.isArray(parsedTheme)) {
            throw new Error(t('styleCustomizer.errorInvalidJsonObject'));
        }
        // 更新本地的 editableUiTheme ref，这将触发颜色选择器的更新
        editableUiTheme.value = parsedTheme;
        // 注意：此时尚未保存到后端，用户需要点击“保存 UI 主题”按钮
    } catch (error: any) {
        console.error('解析 UI 主题配置失败:', error);
        // 尝试提供更具体的错误信息
        let errorMessage = error.message || t('styleCustomizer.errorInvalidJsonConfig');
        if (error instanceof SyntaxError) {
            errorMessage = `${t('styleCustomizer.errorJsonSyntax')}: ${error.message}`; // 需要添加翻译
        }
        themeParseError.value = errorMessage;
    }
};


// 保存终端字体
const handleSaveTerminalFont = async () => {
    try {
        await appearanceStore.setTerminalFontFamily(editableTerminalFontFamily.value);
        alert(t('styleCustomizer.terminalFontSaved'));
    } catch (error: any) {
        console.error("保存终端字体失败:", error);
        alert(t('styleCustomizer.terminalFontSaveFailed', { message: error.message }));
    }
};

// 保存终端字体大小
const handleSaveTerminalFontSize = async () => {
    try {
        const size = Number(editableTerminalFontSize.value);
        if (isNaN(size) || size <= 0) {
            alert(t('styleCustomizer.errorInvalidFontSize')); // 需要添加翻译
            return;
        }
        await appearanceStore.setTerminalFontSize(size);
        alert(t('styleCustomizer.terminalFontSizeSaved')); // 需要添加翻译
    } catch (error: any) {
        console.error("保存终端字体大小失败:", error);
        alert(t('styleCustomizer.terminalFontSizeSaveFailed', { message: error.message })); // 需要添加翻译
    }
};

// 保存编辑器字体大小
const handleSaveEditorFontSize = async () => {
    try {
        const size = Number(editableEditorFontSize.value);
        if (isNaN(size) || size <= 0) {
            alert(t('styleCustomizer.errorInvalidEditorFontSize')); // 需要添加翻译
            return;
        }
        await appearanceStore.setEditorFontSize(size);
        alert(t('styleCustomizer.editorFontSizeSaved')); // 需要添加翻译
    } catch (error: any) {
        console.error("保存编辑器字体大小失败:", error);
        alert(t('styleCustomizer.editorFontSizeSaveFailed', { message: error.message })); // 需要添加翻译
    }
};

// 应用选定的终端主题
const handleApplyTheme = async (theme: TerminalTheme) => {
    // 确保 theme._id 存在且不等于当前激活的 ID
    // setActiveTerminalTheme 期望 string | null，而 theme._id 是 string | undefined
    // 如果 theme._id 是 undefined (理论上不应发生在列表项上)，传递 null
    const themeIdToApply = theme._id ?? null;
    if (themeIdToApply === null || themeIdToApply === activeTerminalThemeId.value) return;

    try {
        await appearanceStore.setActiveTerminalTheme(themeIdToApply);
        // 成功后 activeTerminalThemeId 会自动更新
        // alert(`Theme '${theme.name}' applied successfully`); // 移除成功提示
    } catch (error: any) {
        console.error("应用终端主题失败:", error);
        alert(t('styleCustomizer.setActiveThemeFailed', { message: error.message }));
    }
};

// --- 终端主题管理 ---
// 开始新建主题
const handleAddNewTheme = () => {
    saveThemeError.value = null; // 清除旧错误
    terminalThemeParseError.value = null; // 清除旧错误
    // 创建一个全新的默认主题结构用于编辑
    editingTheme.value = {
        _id: undefined, // 清除 ID 表示是新建
        name: t('styleCustomizer.newThemeDefaultName'),
        themeData: JSON.parse(JSON.stringify(defaultXtermTheme)), // 使用默认 xterm 主题作为基础
        isPreset: false, // 明确不是预设
    };
    // 初始化 textarea
    try {
        editableTerminalThemeString.value = JSON.stringify(editingTheme.value.themeData, null, 2);
    } catch (e) {
        console.error("格式化新终端主题 JSON 失败:", e);
        editableTerminalThemeString.value = '{}'; // Fallback
    }
    isEditingTheme.value = true;
};


// 开始编辑主题 (用户主题或基于预设创建副本)
const handleEditTheme = (theme: TerminalTheme) => {
    saveThemeError.value = null; // 清除旧错误
    terminalThemeParseError.value = null; // 清除旧错误
    let themeToEdit: TerminalTheme;
    if (theme.isPreset) {
        // 基于预设创建副本
        const themeCopy = JSON.parse(JSON.stringify(theme));
        themeCopy._id = undefined; // 清除 ID，表示是新建
        themeCopy.name = `${theme.name} (Copy)`;
        themeCopy.isPreset = false; // 副本不再是预设
        themeToEdit = themeCopy;
        console.log('创建预设主题副本进行编辑:', themeToEdit);
    } else {
        // 编辑用户自己的主题
        themeToEdit = JSON.parse(JSON.stringify(theme));
        console.log('编辑用户主题:', themeToEdit);
    }
    editingTheme.value = themeToEdit;
    // 初始化 textarea
    try {
        editableTerminalThemeString.value = JSON.stringify(editingTheme.value.themeData, null, 2);
    } catch (e) {
        console.error("格式化编辑终端主题 JSON 失败:", e);
        editableTerminalThemeString.value = '{}'; // Fallback
    }
    isEditingTheme.value = true;
};

// 保存主题编辑 (新建或更新)
const handleSaveEditingTheme = async () => {
    if (!editingTheme.value || !editingTheme.value.name) {
        saveThemeError.value = t('styleCustomizer.errorThemeNameRequired');
        return;
    }
    // 在保存前，确保 themeData 是最新的（以防 textarea 未失去焦点）
    handleTerminalThemeStringChange(); // 先尝试解析 textarea
    if (terminalThemeParseError.value) {
        saveThemeError.value = t('styleCustomizer.errorFixJsonBeforeSave'); // 需要添加翻译: "请先修复 JSON 格式错误再保存"
        return;
    }

    saveThemeError.value = null; // 清除错误
    try {
        // 确保 themeData 是最新的（以防万一解析没触发 watch 更新）
        if (!editingTheme.value) return; // 防御
        const currentThemeData = JSON.parse(editableTerminalThemeString.value); // 再次解析以防万一

        if (editingTheme.value._id) { // 更新
            // 确保传递的是 UpdateTerminalThemeDto 兼容的格式
            const updateDto = { name: editingTheme.value.name, themeData: currentThemeData }; // 使用解析后的数据
            await appearanceStore.updateTerminalTheme(
                editingTheme.value._id,
                updateDto.name,
                updateDto.themeData
            );
             alert(t('styleCustomizer.themeUpdatedSuccess'));
        } else { // 新建
             // 确保传递的是 CreateTerminalThemeDto 兼容的格式
            const createDto = { name: editingTheme.value.name, themeData: currentThemeData }; // 使用解析后的数据
            await appearanceStore.createTerminalTheme(
                createDto.name,
                createDto.themeData
            );
             alert(t('styleCustomizer.themeCreatedSuccess'));
        }
        isEditingTheme.value = false; // 关闭编辑
        editingTheme.value = null;
        editableTerminalThemeString.value = ''; // 清理
        terminalThemeParseError.value = null; // 清理
    } catch (error: any) {
        console.error("保存终端主题失败:", error);
        saveThemeError.value = error.message || t('styleCustomizer.themeSaveFailed');
    }
};

// 取消编辑
const handleCancelEditingTheme = () => {
    isEditingTheme.value = false;
    editingTheme.value = null;
    saveThemeError.value = null;
    terminalThemeParseError.value = null; // 清理
    editableTerminalThemeString.value = ''; // 清理
};

// --- 处理终端主题 Textarea ---
const handleTerminalThemeStringChange = () => {
    terminalThemeParseError.value = null; // 清除之前的错误
    if (!editingTheme.value) return; // 防御性检查

    try {
        const parsedThemeData = JSON.parse(editableTerminalThemeString.value);
        // 基础验证：确保是对象且不是数组
        if (typeof parsedThemeData !== 'object' || parsedThemeData === null || Array.isArray(parsedThemeData)) {
            throw new Error(t('styleCustomizer.errorInvalidJsonObject')); // 复用 UI 主题的错误消息
        }
        // 更新 editingTheme.value.themeData，这将触发下面的 watch 来更新颜色选择器等
        editingTheme.value.themeData = parsedThemeData;
    } catch (error: any) {
        console.error('解析终端主题 JSON 配置失败:', error);
        let errorMessage = error.message || t('styleCustomizer.errorInvalidJsonConfig'); // 复用
        if (error instanceof SyntaxError) {
            errorMessage = `${t('styleCustomizer.errorJsonSyntax')}: ${error.message}`; // 复用
        }
        terminalThemeParseError.value = errorMessage;
    }
};

// 删除主题
const handleDeleteTheme = async (theme: TerminalTheme) => {
    if (theme.isPreset) return;
    try {
        await appearanceStore.deleteTerminalTheme(theme._id!);
         alert(t('styleCustomizer.themeDeletedSuccess'));
    } catch (error: any) {
        console.error("删除终端主题失败:", error);
         alert(t('styleCustomizer.themeDeleteFailed', { message: error.message }));
    }
};

// 触发主题导入文件选择
const handleTriggerImport = () => {
    importError.value = null;
    themeImportInput.value?.click();
};

// 处理主题导入
const handleImportThemeFile = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        try {
            // 可以选择在前端解析文件名作为默认名称传递给后端
            const defaultName = file.name.endsWith('.json') ? file.name.slice(0, -5) : file.name;
            await appearanceStore.importTerminalTheme(file, defaultName); // 传递文件名作为备选名称
            alert(t('styleCustomizer.importSuccess'));
            input.value = ''; // 清空文件输入，以便再次选择相同文件
        } catch (error: any) {
            console.error("导入主题失败:", error);
            importError.value = error.message || t('styleCustomizer.importFailed');
             input.value = '';
        }
    }
};

// 处理主题导出 (导出当前激活的主题)
const handleExportActiveTheme = async () => {
    const currentId = activeTerminalThemeId.value; // activeTerminalThemeId 是 Ref<string | undefined>
    if (currentId) { // 检查 currentId 是否为真值 (不是 undefined 或空字符串)
        try {
            await appearanceStore.exportTerminalTheme(currentId);
        } catch (error: any) {
            console.error("导出主题失败:", error);
             alert(t('styleCustomizer.exportFailed', { message: error.message }));
        }
    } else {
        alert(t('styleCustomizer.noActiveThemeToExport')); // 需要添加翻译
    }
};


// --- 背景处理 ---
const handleTriggerPageBgUpload = () => {
    uploadError.value = null;
    pageBgFileInput.value?.click();
};
const handleTriggerTerminalBgUpload = () => {
    uploadError.value = null;
    terminalBgFileInput.value?.click();
};

const handlePageBgUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        try {
            await appearanceStore.uploadPageBackground(file);
            alert(t('styleCustomizer.pageBgUploadSuccess'));
            input.value = ''; // 清空以便再次选择
        } catch (error: any) {
            uploadError.value = error.message || t('styleCustomizer.uploadFailed');
            input.value = '';
        }
    }
};

const handleTerminalBgUpload = async (event: Event) => {
     const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        try {
            await appearanceStore.uploadTerminalBackground(file);
             alert(t('styleCustomizer.terminalBgUploadSuccess'));
            input.value = '';
        } catch (error: any) {
            uploadError.value = error.message || t('styleCustomizer.uploadFailed');
            input.value = '';
        }
    }
};

const handleRemovePageBg = async () => {
    try {
        await appearanceStore.removePageBackground();
         alert(t('styleCustomizer.pageBgRemoved'));
    } catch (error: any) {
         console.error("移除页面背景失败:", error);
         alert(t('styleCustomizer.removeBgFailed', { message: error.message }));
    }
};

const handleRemoveTerminalBg = async () => {
    try {
        await appearanceStore.removeTerminalBackground();
         alert(t('styleCustomizer.terminalBgRemoved'));
    } catch (error: any) {
         console.error("移除终端背景失败:", error);
         alert(t('styleCustomizer.removeBgFailed', { message: error.message }));
    }
};

// Removed handlePageOpacityChange and handleTerminalOpacityChange functions

// --- 辅助函数 ---
// 格式化 UI 主题标签
const formatLabel = (key: string): string => {
  // 简单的转换逻辑，可以根据需要优化
  return key
    .replace(/^--/, '') // 移除前缀 '--'
    .replace(/-/g, ' ') // 替换 '-' 为空格
    .replace(/([A-Z])/g, ' $1') // 在大写字母前加空格
    .replace(/^./, (str) => str.toUpperCase()); // 首字母大写
};

// 格式化 xterm 主题属性标签
const formatXtermLabel = (key: keyof ITheme): string => {
  // 简单的转换逻辑
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
};

// --- 新增：计算属性 ---

// 获取当前激活主题的名称
const activeThemeName = computed(() => {
  const theme = availableTerminalThemes.value.find(t => t._id === activeTerminalThemeId.value);
  // 如果找不到主题 (例如 ID 无效或列表为空)，则显示提示
  return theme ? theme.name : 'No active theme selected';
});

// 过滤和排序主题列表
const filteredAndSortedThemes = computed(() => {
  const searchTerm = themeSearchTerm.value.toLowerCase().trim(); // 转小写并去除首尾空格
  let themes = [...availableTerminalThemes.value]; // 创建副本以进行排序

  // 过滤
  if (searchTerm) {
    themes = themes.filter(theme => theme.name.toLowerCase().includes(searchTerm));
  }

  // 排序逻辑已移除
  // 默认按名称升序排序
  themes.sort((a, b) => a.name.localeCompare(b.name));

  return themes;
});

// 排序切换函数已移除
// --- 监听 themeData 变化以更新 textarea ---
watch(() => editingTheme.value?.themeData, (newThemeData) => {
    // 只有在 textarea 没有聚焦时才更新，避免覆盖用户输入
    // 或者，如果解析错误存在，也允许更新以显示正确格式
    if (newThemeData && (document.activeElement?.id !== 'terminalThemeTextarea' || terminalThemeParseError.value)) {
        try {
            const newJsonString = JSON.stringify(newThemeData, null, 2);
            // 只有当字符串实际不同时才更新，避免不必要的重渲染和光标跳动
            if (newJsonString !== editableTerminalThemeString.value) {
                 editableTerminalThemeString.value = newJsonString;
            }
            // 如果外部更改（如颜色选择器）修复了错误，清除错误提示
            if (terminalThemeParseError.value && document.activeElement?.id !== 'terminalThemeTextarea') {
                 terminalThemeParseError.value = null;
            }
        } catch (e) {
            console.error("序列化终端主题 JSON 失败:", e);
            // 理论上不应失败，除非 themeData 结构异常
        }
    }
}, { deep: true }); // 需要 deep watch 来监听 themeData 内部的变化

</script>


<template>
  <div class="style-customizer-overlay" @click.self="closeCustomizer">
    <div class="style-customizer-panel">
      <header class="panel-header">
        <h2>{{ t('styleCustomizer.title') }}</h2>
        <button @click="closeCustomizer" class="close-button">&times;</button>
      </header>
      <div class="panel-content">
        <nav class="panel-nav">
          <button @click="currentTab = 'ui'" :class="{ active: currentTab === 'ui' }">
            {{ t('styleCustomizer.uiStyles') }}
          </button>
          <button @click="currentTab = 'terminal'" :class="{ active: currentTab === 'terminal' && !isEditingTheme }" :disabled="isEditingTheme">
            {{ t('styleCustomizer.terminalStyles') }}
          </button>
           <button @click="currentTab = 'background'" :class="{ active: currentTab === 'background' }" :disabled="isEditingTheme">
            {{ t('styleCustomizer.backgroundSettings') }}
          </button>
          <button @click="currentTab = 'other'" :class="{ active: currentTab === 'other' }" :disabled="isEditingTheme">
            {{ t('styleCustomizer.otherSettings') }} <!-- 需要添加翻译 -->
          </button>
        </nav>
        <main class="panel-main">
          <section v-if="currentTab === 'ui'">
            <h3>{{ t('styleCustomizer.uiStyles') }}</h3>
            <p>{{ t('styleCustomizer.uiDescription') }}</p>
            <!-- 动态生成 UI 样式编辑控件 -->
            <div v-for="(value, key) in editableUiTheme" :key="key" class="form-group">
              <label :for="`ui-${key}`">{{ formatLabel(key) }}:</label>
              <!-- 简单判断是否为颜色值，显示颜色选择器 -->
              <input
                v-if="typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl'))"
                type="color"
                :id="`ui-${key}`"
                v-model="editableUiTheme[key]"
              />
              <!-- 否则显示文本输入框 -->
              <input
                v-else
                type="text"
                :id="`ui-${key}`"
                v-model="editableUiTheme[key]"
                class="text-input"
              />
            </div>
            <!-- UI Theme Textarea -->
            <hr style="margin-top: calc(var(--base-padding) * 2); margin-bottom: calc(var(--base-padding) * 2);">
            <h4>{{ t('styleCustomizer.uiThemeJsonEditorTitle') }}</h4> <!-- TODO: Add translation -->
            <p>{{ t('styleCustomizer.uiThemeJsonEditorDesc') }}</p> <!-- TODO: Add translation -->
            <div class="form-group full-width-group"> <!-- Use a class for full width -->
               <label for="uiThemeTextarea" class="sr-only">{{ t('styleCustomizer.uiThemeJsonEditorTitle') }}</label> <!-- Screen reader only label -->
               <textarea
                 id="uiThemeTextarea"
                 v-model="editableUiThemeString"
                 @blur="handleUiThemeStringChange"
                 rows="15"
                 :placeholder="'--app-bg-color: #ffffff\n--text-color: #333333\n...'"
                 spellcheck="false"
                 class="json-textarea"
               ></textarea>
            </div>
             <p v-if="themeParseError" class="error-message full-width-group">{{ themeParseError }}</p>
          </section>
          <section v-if="currentTab === 'terminal' && !isEditingTheme">
            <h3>{{ t('styleCustomizer.terminalStyles') }}</h3>
            <!-- 终端字体设置 -->
            <div class="form-group">
                <label for="terminalFontFamily">{{ t('styleCustomizer.terminalFontFamily') }}:</label>
                <input type="text" id="terminalFontFamily" v-model="editableTerminalFontFamily" class="text-input wide-input" :placeholder="t('styleCustomizer.terminalFontPlaceholder')"/>
                <button @click="handleSaveTerminalFont" class="button-inline">{{ t('common.save') }}</button>
            </div>
            <p class="setting-description">{{ t('styleCustomizer.terminalFontDescription') }}</p>

            <!-- 终端字体大小设置 -->
            <div class="form-group">
                <label for="terminalFontSize">{{ t('styleCustomizer.terminalFontSize') }}:</label> <!-- 需要添加翻译 -->
                <input type="number" id="terminalFontSize" v-model.number="editableTerminalFontSize" class="number-input" min="1" />
                <button @click="handleSaveTerminalFontSize" class="button-inline">{{ t('common.save') }}</button>
            </div>

            <hr>

            <!-- 终端主题选择与管理 -->
            <h4>{{ t('styleCustomizer.terminalThemeSelection') }}</h4>
             <!-- 显示当前激活主题 -->
             <div class="active-theme-display">
                 <span>{{ t('styleCustomizer.activeTheme') }}:</span>
                 <strong>{{ activeThemeName }}</strong>
                 <!-- 导出按钮移到管理按钮区域 -->
             </div>

             <!-- 主题管理按钮 -->
             <div class="theme-management-buttons">
                 <button @click="handleAddNewTheme">{{ t('styleCustomizer.addNewTheme') }}</button>
                 <button @click="handleTriggerImport">{{ t('styleCustomizer.importTheme') }}</button>
                 <button @click="handleExportActiveTheme" :disabled="!activeTerminalThemeId" class="button-inline button-small" :title="t('styleCustomizer.exportActiveThemeTooltip', 'Export the currently active theme as a JSON file')">{{ t('styleCustomizer.exportActiveTheme', 'Export Active Theme') }}</button>
                 <input type="file" ref="themeImportInput" @change="handleImportThemeFile" accept=".json" style="display: none;" />
                 <p v-if="importError" class="error-message">{{ importError }}</p>
             </div>


             <!-- 搜索框移到列表上方 -->
             <div class="theme-search-bar">
                  <input
                      type="text"
                      v-model="themeSearchTerm"
                      :placeholder="t('styleCustomizer.searchThemePlaceholder', '搜索主题名称...')"
                      class="text-input"
                  />
             </div>

             <!-- 主题列表 -->
             <ul class="theme-list">
                 <!-- 添加空状态提示 -->
                 <li v-if="filteredAndSortedThemes.length === 0" class="empty-list-item">
                     {{ t('styleCustomizer.noThemesFound', 'No matching themes found') }}
                 </li>
                 <li v-else v-for="theme in filteredAndSortedThemes" :key="theme._id" :class="{ 'preset-theme': theme.isPreset, 'active': theme._id === activeTerminalThemeId }">
                     <!-- 应用按钮移到 theme-actions -->
                     <span class="theme-name" :title="theme.name">{{ theme.name }}</span>
                     <div class="theme-actions">
                          <button
                              @click="handleApplyTheme(theme)"
                              :disabled="theme._id === activeTerminalThemeId"
                              :title="t('styleCustomizer.applyThemeTooltip', 'Apply this theme')"
                          >
                              {{ t('styleCustomizer.applyButton', 'Apply') }}
                          </button>
                         <button @click="handleEditTheme(theme)" :title="theme.isPreset ? t('styleCustomizer.editAsCopy', 'Edit as Copy') : t('common.edit')">{{ t('common.edit') }}</button>
                         <button @click="handleDeleteTheme(theme)" :disabled="theme.isPreset" class="button-danger" :title="theme.isPreset ? t('styleCustomizer.cannotDeletePreset', 'Cannot delete preset theme') : t('common.delete')">{{ t('common.delete') }}</button>
                     </div>
                 </li>
             </ul>
 
           </section>

            <!-- 主题编辑器 -->
            <section v-if="isEditingTheme && editingTheme">
                <h3>{{ editingTheme._id ? t('styleCustomizer.editThemeTitle') : t('styleCustomizer.newThemeTitle') }}</h3>
                 <p v-if="saveThemeError" class="error-message">{{ saveThemeError }}</p>
                <div class="form-group">
                    <label for="editingThemeName">{{ t('styleCustomizer.themeName') }}:</label>
                    <input type="text" id="editingThemeName" v-model="editingTheme.name" required class="text-input"/>
                </div>

                <!-- Terminal Theme Textarea -->
                <hr style="margin-top: calc(var(--base-padding) * 2); margin-bottom: calc(var(--base-padding) * 2);">
                <h4>{{ t('styleCustomizer.terminalThemeJsonEditorTitle') }}</h4> <!-- TODO: Add translation -->
                <p>{{ t('styleCustomizer.terminalThemeJsonEditorDesc') }}</p> <!-- TODO: Add translation -->
                <div class="form-group full-width-group">
                   <label for="terminalThemeTextarea" class="sr-only">{{ t('styleCustomizer.terminalThemeJsonEditorTitle') }}</label>
                   <textarea
                     id="terminalThemeTextarea"
                     v-model="editableTerminalThemeString"
                     @blur="handleTerminalThemeStringChange"
                     rows="15"
                     :placeholder="terminalThemePlaceholder"
                     spellcheck="false"
                     class="json-textarea"
                   ></textarea>
                </div>
                 <p v-if="terminalThemeParseError" class="error-message full-width-group">{{ terminalThemeParseError }}</p>
                 <hr style="margin-top: calc(var(--base-padding) * 2); margin-bottom: calc(var(--base-padding) * 2);">
                 <h4>{{ t('styleCustomizer.terminalThemeColorEditorTitle') }}</h4> <!-- TODO: Add translation -->

                 <!-- 动态生成终端样式编辑控件 -->
              <div v-for="(value, key) in editingTheme.themeData" :key="key" class="form-group">
                <label :for="`xterm-${key}`">{{ formatXtermLabel(key as keyof ITheme) }}:</label>
                <!-- 简单判断是否为颜色值 -->
                <input
                  v-if="typeof value === 'string' && value.startsWith('#')"
                  type="color"
                  :id="`xterm-${key}`"
                  v-model="(editingTheme.themeData as any)[key]"
                />
                <!-- 其他类型（如数字、布尔值）可以添加相应控件，这里简化为文本 -->
                <input
                  v-else
                  type="text"
                  :id="`xterm-${key}`"
                  v-model="(editingTheme.themeData as any)[key]"
                  class="text-input"
                />
             </div>
              <!-- 显示解析错误（如果颜色选择器下方也需要的话） -->
              <p v-if="terminalThemeParseError" class="error-message full-width-group">{{ terminalThemeParseError }}</p>
             <div class="editor-footer">
                 <button @click="handleCancelEditingTheme" class="button-secondary">{{ t('common.cancel') }}</button>
                 <button @click="handleSaveEditingTheme" class="button-primary">{{ t('common.save') }}</button>
             </div>
           </section>

           <section v-if="currentTab === 'background'">
                <h3>{{ t('styleCustomizer.backgroundSettings') }}</h3>

                <!-- 页面背景 -->
                <h4>{{ t('styleCustomizer.pageBackground') }}</h4>
                <div class="background-preview" :style="{ backgroundImage: pageBackgroundImage ? `url(${pageBackgroundImage})` : 'none' }">
                    {{ pageBackgroundImage ? '' : t('styleCustomizer.noBackground') }}
                </div>
                <div class="background-controls">
                    <button @click="handleTriggerPageBgUpload">{{ t('styleCustomizer.uploadPageBg') }}</button>
                    <button @click="handleRemovePageBg" :disabled="!pageBackgroundImage" class="button-danger">{{ t('styleCustomizer.removePageBg') }}</button>
                    <input type="file" ref="pageBgFileInput" @change="handlePageBgUpload" accept="image/*" style="display: none;" />
                </div>
                 <!-- Removed Opacity Slider -->
                 <p v-if="uploadError" class="error-message">{{ uploadError }}</p>

                <hr>

                <!-- 终端背景 -->
                <h4>{{ t('styleCustomizer.terminalBackground') }}</h4>
                 <div class="background-preview" :style="{ backgroundImage: terminalBackgroundImage ? `url(${terminalBackgroundImage})` : 'none' }">
                     {{ terminalBackgroundImage ? '' : t('styleCustomizer.noBackground') }}
                 </div>
                 <div class="background-controls">
                    <button @click="handleTriggerTerminalBgUpload">{{ t('styleCustomizer.uploadTerminalBg') }}</button>
                    <button @click="handleRemoveTerminalBg" :disabled="!terminalBackgroundImage" class="button-danger">{{ t('styleCustomizer.removeTerminalBg') }}</button>
                    <input type="file" ref="terminalBgFileInput" @change="handleTerminalBgUpload" accept="image/*" style="display: none;" />
                </div>
                 <!-- Removed Opacity Slider -->

           </section>
           <section v-if="currentTab === 'other'">
             <h3>{{ t('styleCustomizer.otherSettings') }}</h3> <!-- 需要添加翻译 -->
             <!-- 编辑器字体大小设置 -->
             <div class="form-group">
                 <label for="editorFontSize">{{ t('styleCustomizer.editorFontSize') }}:</label> <!-- 需要添加翻译 -->
                 <input type="number" id="editorFontSize" v-model.number="editableEditorFontSize" class="number-input" min="1" />
                 <button @click="handleSaveEditorFontSize" class="button-inline">{{ t('common.save') }}</button>
             </div>
           </section>
        </main>
      </div>
      <footer class="panel-footer">
        <!-- 根据当前 tab 或状态显示不同的按钮 -->
        <button v-if="currentTab === 'ui'" @click="handleResetUiTheme" class="button-secondary">{{ t('styleCustomizer.resetUiTheme') }}</button>
        <button v-if="currentTab === 'ui'" @click="handleSaveUiTheme" class="button-primary">{{ t('styleCustomizer.saveUiTheme') }}</button>
        <!-- 终端字体和主题选择是即时保存的，不需要单独的保存按钮 -->
        <!-- 背景设置也是即时保存的 -->
        <button @click="closeCustomizer" class="button-secondary">{{ t('common.close') }}</button> <!-- 添加一个通用的关闭按钮 -->
      </footer>
    </div>
  </div>
</template>

<style scoped>
.style-customizer-overlay {
  position: fixed;
  inset: 0; /* top, right, bottom, left = 0 */
  background-color: rgba(0, 0, 0, 0.6); /* 更深的遮罩 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.style-customizer-panel {
  background-color: var(--app-bg-color);
  color: var(--text-color);
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 800px; /* 增加最大宽度 */
  height: 85vh; /* 使用视口高度 */
  max-height: 700px; /* 限制最大高度 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--base-padding) * 0.8) var(--base-padding); /* 调整内边距 */
  border-bottom: 1px solid var(--border-color);
  background-color: var(--header-bg-color);
  flex-shrink: 0; /* 防止头部被压缩 */
}

.panel-header h2 {
  margin: 0;
  font-size: 1.25rem; /* 稍大标题 */
  color: var(--text-color);
}

.close-button {
  background: none;
  border: none;
  font-size: 1.8rem; /* 增大关闭按钮 */
  line-height: 1;
  cursor: pointer;
  color: var(--text-color-secondary);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}
.close-button:hover {
    color: var(--text-color);
    background-color: rgba(0,0,0,0.1);
}

.panel-content {
  display: flex;
  flex-grow: 1;
  overflow: hidden; /* 防止内部滚动条影响布局 */
}

.panel-nav {
  width: 180px; /* 增加导航宽度 */
  border-right: 1px solid var(--border-color);
  padding: var(--base-padding);
  background-color: var(--header-bg-color);
  flex-shrink: 0;
  overflow-y: auto; /* 导航内部滚动 */
}

.panel-nav button {
  display: block;
  width: 100%;
  padding: 0.7rem 0.8rem; /* 增加导航按钮内边距 */
  margin-bottom: var(--base-margin);
  text-align: left;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 0.95rem;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.panel-nav button:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.panel-nav button.active {
  background-color: var(--button-bg-color); /* 使用按钮背景色 */
  color: var(--button-text-color);
  font-weight: bold;
}
.panel-nav button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: transparent !important;
    color: var(--text-color-secondary);
}

.panel-main {
  flex-grow: 1;
  padding: var(--base-padding) calc(var(--base-padding) * 1.5); /* 增加左右内边距 */
  overflow-y: auto; /* 主要内容区域滚动 */
}

.panel-main h3 {
  margin-top: 0;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: var(--base-margin);
  margin-bottom: calc(var(--base-margin) * 2);
  font-size: 1.15rem;
  color: var(--text-color);
}
.panel-main h4 {
    margin-top: calc(var(--base-margin) * 2.5);
    margin-bottom: var(--base-margin);
    color: var(--text-color);
    font-size: 1.05rem;
}

.panel-main p:not(.error-message):not(.setting-description) {
    color: var(--text-color-secondary);
    font-size: 0.9rem;
    line-height: 1.6;
    margin-bottom: calc(var(--base-margin) * 1.5);
}

.setting-description {
    font-size: 0.85rem;
    color: var(--text-color-secondary);
    margin-top: calc(var(--base-margin) / -2); /* 减少与上方元素的间距 */
    margin-bottom: var(--base-margin);
}

.form-group {
    margin-bottom: calc(var(--base-margin) * 1.5);
    display: grid;
    /* Define grid columns: Auto label, flexible control, auto button */
    grid-template-columns: auto minmax(0, 1fr) auto; /* Let label width adjust */
    align-items: center; /* Vertically center items in the row */
    gap: calc(var(--base-margin) * 1.5); /* Increase gap slightly for better spacing */
}
/* Special class for full-width elements like textarea */
.form-group.full-width-group, .error-message.full-width-group {
    grid-column: 1 / -1; /* Span all columns */
    gap: calc(var(--base-margin) / 2); /* Smaller gap for label/textarea */
}
.form-group.full-width-group label:not(.sr-only) { /* Adjust label if not screen-reader only */
    grid-column: 1 / 2; /* Ensure label stays in its place if visible */
    margin-bottom: calc(var(--base-margin) / 3);
}

/* Adjust grid for rows without a third element (like inline buttons) */
.form-group > *:nth-child(2):last-child {
    grid-column: 2 / 4; /* Let the second element span if it's the last */
}
/* Specific adjustments for theme editor rows if needed */
section[v-if*="isEditingTheme"] .form-group {
     /* Keep 2 columns for editor: auto label + flexible input */
    grid-template-columns: auto 1fr;
    margin-bottom: var(--base-margin);
    gap: var(--base-margin); /* Keep editor gap smaller */
}


.form-group label {
    grid-column: 1 / 2;
    text-align: left; /* Keep text aligned to the left */
    /* justify-self: start; Removed */
    padding-right: 0; /* Ensure no right padding interferes */
    padding-left: 0; /* Ensure no left padding interferes */
    color: var(--text-color);
    font-size: 0.9rem;
    margin-bottom: 0;
    /* white-space: nowrap; Removed in case it affects alignment */
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500; /* 稍微加粗标签 */
    /* Ensure it behaves predictably within the grid cell */
    display: block; /* Or inline-block if needed, but block is usually fine */
    width: 100%; /* Occupy the auto-calculated width */
}

/* 输入控件 */
.form-group input[type="color"],
.form-group input[type="text"].text-input,
.form-group input[type="number"].number-input, /* <-- 添加 number-input */
.form-group select {
    grid-column: 2 / 3;
    border: 1px solid var(--border-color);
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    font-size: 0.9rem;
    background-color: var(--app-bg-color);
    color: var(--text-color);
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease; /* 添加过渡效果 */
}
.form-group input[type="color"] {
    padding: 2px;
    height: 34px;
    min-width: 50px;
    max-width: 70px;
    justify-self: start;
    border-radius: 4px; /* 保持圆角一致 */
}
.form-group input:focus, .form-group select:focus {
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15); /* 调整聚焦阴影 */
}

/* Input controls (text, color, select) */
.form-group input[type="color"],
.form-group input[type="text"].text-input,
.form-group input[type="number"].number-input, /* <-- 添加 number-input */
.form-group select {
    grid-column: 2 / 3; /* Place in the second column */
    /* Existing styles below... */
    border: 1px solid var(--border-color);
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    font-size: 0.9rem;
    background-color: var(--app-bg-color);
    color: var(--text-color);
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease; /* 添加过渡效果 */
}
.form-group input[type="color"] {
    padding: 2px;
    height: 34px;
    min-width: 50px;
    max-width: 70px;
    justify-self: start;
    border-radius: 4px; /* 保持圆角一致 */
}
.form-group input[type="number"].number-input {
    max-width: 100px; /* 限制数字输入框宽度 */
    justify-self: start;
}
.form-group input:focus, .form-group select:focus, .form-group input[type="number"]:focus { /* <-- 添加 number input focus */
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15); /* 调整聚焦阴影 */
}
/* Style for JSON Textarea */
.json-textarea {
    width: 100%;
    font-family: var(--font-family-monospace); /* Use monospace font */
    font-size: 0.9em;
    line-height: 1.4;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.8rem;
    background-color: var(--input-bg-color, var(--app-bg-color));
    color: var(--text-color);
    resize: vertical;
    min-height: 200px; /* Ensure decent minimum height */
    box-sizing: border-box;
    white-space: pre-wrap; /* 确保换行符和空格被保留，并允许文本换行 */
    overflow-wrap: break-word; /* 确保长单词在需要时能断开 */
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.json-textarea:focus {
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15);
}


/* Inline buttons within form-group */
.form-group .button-inline,
.form-group .button-danger {
    grid-column: 3 / 4; /* Place in the third column */
    margin-left: 0; /* Reset margin if needed */
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    white-space: nowrap;
    justify-self: start;
    border-radius: 4px; /* 统一圆角 */
    transition: background-color 0.2s ease, border-color 0.2s ease; /* 添加过渡 */
}
.button-inline {
    background-color: var(--header-bg-color); /* Default inline button style */
    color: var(--text-color);
}
.form-group .button-inline:hover:not(:disabled) {
    background-color: var(--border-color);
    border-color: var(--text-color-secondary);
}
/* Danger button specific styles remain */
.form-group .button-danger {
    background-color: #f8d7da;
    color: #842029;
    border-color: #f5c2c7;
}
.form-group .button-danger:hover:not(:disabled) {
    background-color: #f1aeb5;
    border-color: #ec8a98;
}
.form-group .button-danger:disabled,
.form-group .button-inline:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}



hr {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: calc(var(--base-padding) * 2) 0;
}

/* Theme Management Styles */
.theme-management-buttons {
    margin-top: var(--base-padding);
    margin-bottom: calc(var(--base-padding) * 1.5);
    display: flex;
    gap: var(--base-margin);
    flex-wrap: wrap;
    align-items: center; /* 垂直居中按钮和错误消息 */
    padding-bottom: var(--base-padding);
    border-bottom: 1px dashed var(--border-color);
}
/* Apply unified styles to theme management buttons - matching button-inline */
.theme-management-buttons button {
    padding: 0.4rem 0.8rem; /* Match button-inline */
    font-size: 0.9rem; /* Match button-inline */
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--header-bg-color); /* Match button-inline */
    color: var(--text-color);
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    white-space: nowrap; /* Match button-inline */
}
.theme-management-buttons button:hover:not(:disabled) {
    background-color: var(--border-color); /* Match button-inline hover */
    border-color: var(--text-color-secondary);
}
.theme-management-buttons button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.theme-management-buttons .error-message {
    margin: 0; /* 移除错误消息的默认外边距 */
    flex-grow: 1; /* 让错误消息填充剩余空间 */
    text-align: left; /* 错误消息左对齐 */
}


.theme-list {
    list-style: none;
    padding: 0;
    margin-top: var(--base-padding); /* 列表与上方元素间距 */
    max-height: 280px; /* 限制高度 */
    overflow-y: auto; /* 允许滚动 */
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--app-bg-color);
}

.theme-list li {
    display: grid; /* 使用 Grid 布局列表项 */
    /* 列: 名称 | 操作按钮组 */
    grid-template-columns: 1fr auto; /* 名称占据剩余空间，按钮组自适应 */
    align-items: center;
    padding: 0.6rem 0.8rem; /* 调整内边距 */
    border-bottom: 1px solid var(--border-color);
    font-size: 0.95rem;
    transition: background-color 0.2s ease;
    gap: var(--base-margin); /* 列间距 */
}
.theme-list li:hover {
    background-color: var(--header-bg-color);
}
.theme-list li.active {
    background-color: var(--button-bg-color); /* 高亮当前激活的主题 */
    color: var(--button-text-color);
}
.theme-list li.active .theme-name {
    font-weight: bold;
    color: var(--button-text-color); /* 确保激活项文本颜色正确 */
}
/* 激活项内按钮样式调整 */
.theme-list li.active .theme-actions button {
    color: var(--button-text-color); /* 继承激活项文本颜色 */
    border-color: rgba(255, 255, 255, 0.3); /* 边框稍微可见 */
    background-color: rgba(255, 255, 255, 0.1); /* 轻微背景 */
}
.theme-list li.active .theme-actions button:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
}
/* 激活项的应用按钮禁用样式 - 注意: :disabled 选择器优先级可能需要调整 */
.theme-list li.active .theme-actions button:disabled {
    opacity: 0.5 !important; /* 增加优先级确保生效 */
    cursor: default !important;
    background-color: transparent !important;
    border-color: transparent !important;
    color: var(--button-text-color) !important; /* 确保禁用时颜色也正确 */
}


.theme-list li:last-child {
    border-bottom: none;
}
/* 空列表项样式 */
.empty-list-item {
    grid-column: 1 / -1; /* 占据整行 */
    text-align: center;
    color: var(--text-color-secondary);
    padding: var(--base-padding);
    font-style: italic;
}

/* 移除独立的 .button-apply 样式 */

.theme-name { /* 主题名称样式 */
    grid-column: 1 / 2; /* 名称在第一列 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color); /* 确保非激活项文本颜色 */
}
.theme-list li.preset-theme .theme-name {
    /* 可以添加特定样式 */
}
.theme-actions {
    grid-column: 2 / 3; /* 按钮组在第二列 */
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem; /* 按钮间距 */
    justify-content: flex-end; /* 按钮靠右对齐 */
}
/* 统一操作按钮样式 */
.theme-actions button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--header-bg-color);
    color: var(--text-color);
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    white-space: nowrap;
}
.theme-actions button:hover:not(:disabled) {
    background-color: var(--border-color);
    border-color: var(--text-color-secondary);
}
/* Specific style for danger button within theme actions */
.theme-actions button.button-danger {
    /* Danger colors override default */
    background-color: #f8d7da;
    color: #842029;
    border-color: #f5c2c7;
}
.theme-actions button.button-danger:hover:not(:disabled) {
    /* Danger hover overrides default hover */
    background-color: #f1aeb5;
    border-color: #ec8a98;
}
.theme-actions button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}


.editor-footer {
    margin-top: var(--base-padding);
    display: flex;
    justify-content: flex-end;
    gap: var(--base-margin);
    padding-top: var(--base-padding);
    border-top: 1px solid var(--border-color);
}
.editor-footer button { /* 确保页脚按钮样式统一 */
    padding: 0.6rem 1.2rem;
    border-radius: 4px;
    font-weight: bold;
}

/* Background Styles */
.background-preview {
    width: 100%;
    height: 150px;
    border: 1px dashed var(--border-color);
    margin-bottom: var(--base-margin);
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-color-secondary);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: 4px;
    background-color: var(--header-bg-color);
    position: relative;
    overflow: hidden; /* 防止背景图溢出圆角 */
}
.background-preview span {
    background-color: rgba(255, 255, 255, 0.8); /* 增加背景不透明度 */
    padding: 0.4rem 0.8rem; /* 增加内边距 */
    border-radius: 3px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-color); /* 使用主文本颜色 */
    box-shadow: 0 1px 2px rgba(0,0,0,0.1); /* 添加轻微阴影 */
}

.background-controls {
    display: flex;
    gap: var(--base-margin);
    margin-bottom: var(--base-padding);
    flex-wrap: wrap;
    align-items: center;
}
/* Style default buttons in background-controls - matching button-inline */
.background-controls button:not(.button-danger) {
    padding: 0.4rem 0.8rem; /* Match button-inline */
    font-size: 0.9rem; /* Match button-inline */
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--header-bg-color); /* Match button-inline */
    color: var(--text-color);
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    white-space: nowrap; /* Match button-inline */
}
.background-controls button:not(.button-danger):hover:not(:disabled) {
    background-color: var(--border-color); /* Match button-inline hover */
    border-color: var(--text-color-secondary);
}
/* Ensure danger button styles override default if necessary */
.background-controls button.button-danger {
    /* Keep specific danger styles */
    padding: 0.4rem 0.8rem; /* Match padding */
    font-size: 0.9rem; /* Match font size */
    border-radius: 4px; /* Match border radius */
    white-space: nowrap; /* Match button-inline */
    background-color: #f8d7da; /* 淡红色背景 */
    color: #842029; /* 深红色文字 */
    border-color: #f5c2c7; /* 边框颜色 */
}
.background-controls button.button-danger:hover:not(:disabled) {
    background-color: #f1aeb5;
    border-color: #ec8a98;
}
.background-controls button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* 搜索框样式 */
.theme-search-bar {
    margin-bottom: var(--base-padding); /* 与下方列表的间距 */
}
.theme-search-bar input.text-input {
    /* flex-grow: 1; /* 不再需要 flex */
    /* 移除 grid-column 相关的样式，因为它不再是 grid item */
    /* grid-column: auto; */
    /* 确保输入框样式正确 */
    border: 1px solid var(--border-color);
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    font-size: 0.9rem;
    background-color: var(--app-bg-color);
    color: var(--text-color);
    /* width: auto; /* 覆盖 form-group 的 width: 100% */
    width: 100%; /* 让搜索框占满宽度 */
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.theme-search-bar input.text-input:focus {
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15);
}
/* 排序按钮样式已移除 */

/* 当前激活主题显示 */
.active-theme-display {
    margin-bottom: var(--base-padding); /* 与下方搜索框的间距 */
    padding: 0.6rem 0;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    /* border-bottom: 1px solid var(--border-color); */ /* 移除底部边框 */
}
.active-theme-display span {
    color: var(--text-color-secondary);
}
.active-theme-display strong {
    color: var(--text-color);
    font-weight: 600;
}
/* 小型按钮样式 */
.button-small {
    padding: 0.3rem 0.6rem !important;
    font-size: 0.85rem !important;
}


.error-message {
  color: #842029;
  background-color: #f8d7da;
  border: 1px solid #f5c2c7;
  padding: calc(var(--base-padding) * 0.75);
  border-radius: 4px;
  margin-top: var(--base-margin);
  font-size: 0.9rem;
  width: 100%;
  box-sizing: border-box;
  /* grid-column: 1 / -1; /* Let error messages flow naturally */
}
.error-message.full-width-group { /* Ensure full-width error messages span */
    grid-column: 1 / -1;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--base-padding);
  border-top: 1px solid var(--border-color);
  background-color: var(--footer-bg-color);
  flex-shrink: 0;
}

.panel-footer button {
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  margin-left: var(--base-margin);
  border: 1px solid transparent;
  font-weight: bold;
}

.panel-footer .button-primary {
  background-color: var(--button-bg-color);
  color: var(--button-text-color);
  border-color: var(--button-bg-color);
}
.panel-footer .button-primary:hover:not(:disabled) {
  background-color: var(--button-hover-bg-color);
  border-color: var(--button-hover-bg-color);
}
.panel-footer .button-secondary {
  background-color: var(--header-bg-color);
  color: var(--text-color);
  border-color: var(--border-color);
}
.panel-footer .button-secondary:hover:not(:disabled) {
  background-color: var(--border-color);
}
.panel-footer button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

</style>
