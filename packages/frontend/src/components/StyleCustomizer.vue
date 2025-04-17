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
    currentUiTheme,
    // currentTerminalTheme, // 这个是计算属性，只读，在编辑时不需要直接用
    activeTerminalThemeId,
    availableTerminalThemes,
    currentTerminalFontFamily,
    pageBackgroundImage,
    // pageBackgroundOpacity, // Removed
    terminalBackgroundImage,
    // terminalBackgroundOpacity, // Removed
} = storeToRefs(appearanceStore);

// --- 本地状态用于编辑 ---
const editableUiTheme = ref<Record<string, string>>({});
const editableTerminalFontFamily = ref('');
// const editablePageBackgroundOpacity = ref(1.0); // Removed
// const editableTerminalBackgroundOpacity = ref(1.0); // Removed

// 终端主题管理相关状态
const selectedTerminalThemeId = ref<string | null>(null); // 下拉框选择的 ID
const isEditingTheme = ref(false); // 是否正在编辑某个主题
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


// 初始化本地编辑状态
const initializeEditableState = () => {
  // 深拷贝 UI 主题
  editableUiTheme.value = JSON.parse(JSON.stringify(currentUiTheme.value || {}));
  editableTerminalFontFamily.value = currentTerminalFontFamily.value;
  selectedTerminalThemeId.value = activeTerminalThemeId.value ?? null; // 初始化下拉框
  // editablePageBackgroundOpacity.value = pageBackgroundOpacity.value; // Removed
  // editableTerminalBackgroundOpacity.value = terminalBackgroundOpacity.value; // Removed
  // 不在 store 变化时重置编辑状态，除非是显式取消或保存
  uploadError.value = null;
  importError.value = null;
  saveThemeError.value = null;
};

onMounted(initializeEditableState);

// 监听 store 变化以更新本地状态 (例如重置或外部更改)
// 只监听不需要编辑的状态或用于初始化的状态
watch([
    currentUiTheme, currentTerminalFontFamily, activeTerminalThemeId
    // pageBackgroundOpacity, terminalBackgroundOpacity // Removed dependencies
], (newVals, oldVals) => {
    // 仅当非编辑状态时，或活动主题ID变化时，才同步下拉框和非编辑状态
    if (!isEditingTheme.value || newVals[2] !== oldVals[2]) {
        initializeEditableState();
    } else {
        // 如果正在编辑，只更新非编辑相关的部分 (例如 UI 主题可以在编辑终端主题时同时更新)
        editableUiTheme.value = JSON.parse(JSON.stringify(newVals[0] || {}));
        editableTerminalFontFamily.value = newVals[1];
        // editablePageBackgroundOpacity.value = newVals[3]; // Removed
        // editableTerminalBackgroundOpacity.value = newVals[4]; // Removed
    }
}, { deep: true });


const emit = defineEmits(['close']);

const closeCustomizer = () => {
  // 如果正在编辑主题，提示用户是否放弃更改
  if (isEditingTheme.value) {
      if (confirm(t('styleCustomizer.confirmCloseEditing'))) {
          isEditingTheme.value = false; // 退出编辑状态
          editingTheme.value = null;
          emit('close');
      }
  } else {
      emit('close');
  }
};

// 当前活动的标签页
const currentTab = ref<'ui' | 'terminal' | 'background'>('ui');

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
    if (confirm(t('styleCustomizer.confirmResetUi'))) {
        try {
            await appearanceStore.resetCustomUiTheme();
            // watch 会自动更新 editableUiTheme.value
            alert(t('styleCustomizer.uiThemeReset'));
        } catch (error: any) {
            console.error("重置 UI 主题失败:", error);
             alert(t('styleCustomizer.uiThemeResetFailed', { message: error.message }));
        }
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

// 更改激活的终端主题
const handleTerminalThemeChange = async () => {
    try {
        await appearanceStore.setActiveTerminalTheme(selectedTerminalThemeId.value);
    } catch (error: any) {
        console.error("设置激活终端主题失败:", error);
        // 恢复下拉框选择到之前的状态
        selectedTerminalThemeId.value = activeTerminalThemeId.value ?? null;
        alert(t('styleCustomizer.setActiveThemeFailed', { message: error.message }));
    }
};

// --- 终端主题管理 ---
// 开始新建主题
const handleAddNewTheme = () => {
    saveThemeError.value = null; // 清除旧错误
    // 创建一个全新的默认主题结构用于编辑
    editingTheme.value = {
        _id: undefined, // 清除 ID 表示是新建
        name: t('styleCustomizer.newThemeDefaultName'),
        themeData: JSON.parse(JSON.stringify(defaultXtermTheme)), // 使用默认 xterm 主题作为基础
        isPreset: false, // 明确不是预设
    };
    isEditingTheme.value = true;
};


// 开始编辑现有主题
const handleEditTheme = (theme: TerminalTheme) => {
    if (theme.isPreset) return; // 不允许编辑预设
    saveThemeError.value = null; // 清除旧错误
    // 深拷贝以避免直接修改列表中的对象
    editingTheme.value = JSON.parse(JSON.stringify(theme));
    isEditingTheme.value = true;
};

// 保存主题编辑 (新建或更新)
const handleSaveEditingTheme = async () => {
    if (!editingTheme.value || !editingTheme.value.name) {
        saveThemeError.value = t('styleCustomizer.errorThemeNameRequired');
        return;
    }
    saveThemeError.value = null; // 清除错误
    try {
        if (editingTheme.value._id) { // 更新
            // 确保传递的是 UpdateTerminalThemeDto 兼容的格式
            const updateDto = { name: editingTheme.value.name, themeData: editingTheme.value.themeData };
            await appearanceStore.updateTerminalTheme(
                editingTheme.value._id,
                updateDto.name,
                updateDto.themeData
            );
             alert(t('styleCustomizer.themeUpdatedSuccess'));
        } else { // 新建
             // 确保传递的是 CreateTerminalThemeDto 兼容的格式
            const createDto = { name: editingTheme.value.name, themeData: editingTheme.value.themeData };
            await appearanceStore.createTerminalTheme(
                createDto.name,
                createDto.themeData
            );
             alert(t('styleCustomizer.themeCreatedSuccess'));
        }
        isEditingTheme.value = false; // 关闭编辑
        editingTheme.value = null;
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
};

// 删除主题
const handleDeleteTheme = async (theme: TerminalTheme) => {
    if (theme.isPreset) return;
    if (confirm(t('styleCustomizer.confirmDeleteTheme', { name: theme.name }))) {
        try {
            await appearanceStore.deleteTerminalTheme(theme._id!);
             alert(t('styleCustomizer.themeDeletedSuccess'));
        } catch (error: any) {
            console.error("删除终端主题失败:", error);
             alert(t('styleCustomizer.themeDeleteFailed', { message: error.message }));
        }
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

// 处理主题导出
const handleExportTheme = async () => {
    if (selectedTerminalThemeId.value) {
        try {
            await appearanceStore.exportTerminalTheme(selectedTerminalThemeId.value);
        } catch (error: any) {
            console.error("导出主题失败:", error);
             alert(t('styleCustomizer.exportFailed', { message: error.message }));
        }
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
    if (confirm(t('styleCustomizer.confirmRemovePageBg'))) {
        try {
            await appearanceStore.removePageBackground();
             alert(t('styleCustomizer.pageBgRemoved'));
        } catch (error: any) {
             console.error("移除页面背景失败:", error);
             alert(t('styleCustomizer.removeBgFailed', { message: error.message }));
        }
    }
};

const handleRemoveTerminalBg = async () => {
     if (confirm(t('styleCustomizer.confirmRemoveTerminalBg'))) {
        try {
            await appearanceStore.removeTerminalBackground();
             alert(t('styleCustomizer.terminalBgRemoved'));
        } catch (error: any) {
             console.error("移除终端背景失败:", error);
             alert(t('styleCustomizer.removeBgFailed', { message: error.message }));
        }
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

            <hr>

            <!-- 终端主题选择与管理 -->
            <h4>{{ t('styleCustomizer.terminalThemeSelection') }}</h4>
             <div class="form-group">
                <label for="terminalThemeSelect">{{ t('styleCustomizer.activeTheme') }}:</label>
                <select id="terminalThemeSelect" v-model="selectedTerminalThemeId" @change="handleTerminalThemeChange">
                    <option :value="null">{{ t('styleCustomizer.selectThemePrompt') }}</option> <!-- 添加一个空选项或默认选项 -->
                    <option v-for="theme in availableTerminalThemes" :key="theme._id" :value="theme._id">
                        {{ theme.name }} {{ theme.isPreset ? `(${t('styleCustomizer.preset')})` : '' }}
                    </option>
                </select>
                 <button @click="handleExportTheme" :disabled="!selectedTerminalThemeId" class="button-inline">{{ t('styleCustomizer.exportTheme') }}</button>
            </div>

            <div class="theme-management-buttons">
                <button @click="handleAddNewTheme">{{ t('styleCustomizer.addNewTheme') }}</button>
                <button @click="handleTriggerImport">{{ t('styleCustomizer.importTheme') }}</button>
                <input type="file" ref="themeImportInput" @change="handleImportThemeFile" accept=".json" style="display: none;" />
                 <p v-if="importError" class="error-message">{{ importError }}</p>
            </div>

            <!-- 主题列表 -->
            <ul class="theme-list">
                <li v-for="theme in availableTerminalThemes" :key="theme._id" :class="{ 'preset-theme': theme.isPreset }">
                    <span>{{ theme.name }} {{ theme.isPreset ? `(${t('styleCustomizer.preset')})` : '' }}</span>
                    <div class="theme-actions">
                        <button @click="handleEditTheme(theme)" :disabled="theme.isPreset">{{ t('common.edit') }}</button>
                        <button @click="handleDeleteTheme(theme)" :disabled="theme.isPreset" class="button-danger">{{ t('common.delete') }}</button>
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
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* 确保在顶层 */
}

.style-customizer-panel {
  background-color: var(--app-bg-color, #fff);
  color: var(--text-color, #333);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 80%;
  max-width: 700px; /* 最大宽度 */
  max-height: 80vh; /* 最大高度 */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内容溢出 */
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--base-padding, 1rem);
  border-bottom: 1px solid var(--border-color, #ccc);
  background-color: var(--header-bg-color, #f0f0f0); /* 使用头部背景色 */
}

.panel-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-color-secondary, #666);
}

.panel-content {
  display: flex;
  flex-grow: 1;
  overflow-y: auto; /* 内部滚动 */
}

.panel-nav {
  width: 150px; /* 固定导航宽度 */
  border-right: 1px solid var(--border-color, #ccc);
  padding: var(--base-padding, 1rem);
  background-color: var(--header-bg-color, #f0f0f0); /* 轻微区分背景 */
  flex-shrink: 0; /* 防止导航栏被压缩 */
}

.panel-nav button {
  display: block;
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  text-align: left;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color, #333);
}

.panel-nav button:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.panel-nav button.active {
  background-color: var(--link-active-color, #007bff);
  color: var(--button-text-color, #fff);
  font-weight: bold;
}
.panel-nav button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: transparent !important; /* 确保禁用时背景透明 */
    color: var(--text-color-secondary, #999); /* 禁用时文字颜色变灰 */
}


.panel-main {
  flex-grow: 1;
  padding: var(--base-padding, 1rem);
  overflow-y: auto; /* 主要内容区域滚动 */
}

.panel-main h3 {
  margin-top: 0;
  border-bottom: 1px solid var(--border-color, #ccc);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}
.panel-main h4 {
    margin-top: 1.5rem;
    margin-bottom: 0.8rem;
    color: var(--text-color);
}

.panel-main p {
    color: var(--text-color-secondary);
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
}

.setting-description {
    font-size: 0.85rem;
    color: var(--text-color-secondary);
    margin-top: -0.5rem; /* 减少与上方元素的间距 */
    margin-bottom: 1rem;
}

.form-group {
    margin-bottom: 1rem;
    display: flex; /* 使用 flex 布局 */
    align-items: center; /* 垂直居中对齐 */
    flex-wrap: wrap; /* 允许换行 */
}

.form-group label {
    /* display: inline-block; */
    min-width: 150px; /* 调整标签最小宽度以适应更长的文本 */
    margin-right: 0.5rem;
    /* vertical-align: middle; */
    text-align: right; /* 标签右对齐 */
    padding-right: 5px; /* 标签和输入框间距 */
    flex-shrink: 0; /* 防止标签被压缩 */
}

.form-group input[type="color"] {
    /* vertical-align: middle; */
    border: 1px solid var(--border-color);
    padding: 2px;
    cursor: pointer;
    width: 150px; /* 统一输入框宽度 */
    height: 30px; /* 增加高度 */
}

.form-group input[type="text"].text-input {
    /* vertical-align: middle; */
    border: 1px solid var(--border-color);
    padding: 4px 6px;
    border-radius: 3px;
    width: 150px; /* 统一文本输入框宽度 */
    flex-grow: 1; /* 允许输入框扩展 */
    min-width: 100px; /* 最小宽度 */
}
.form-group input[type="text"].wide-input {
    /* width: calc(100% - 200px); */ /* 调整宽度以适应按钮 */
    /* min-width: 200px; */
    flex-grow: 1; /* 占据更多空间 */
}
.form-group select {
    padding: 4px 6px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    flex-grow: 1;
    min-width: 150px;
}
.form-group input[type="range"] {
    flex-grow: 1;
    margin: 0 10px;
}


.panel-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--base-padding, 1rem);
  border-top: 1px solid var(--border-color, #ccc);
  background-color: var(--footer-bg-color, #f0f0f0); /* 使用底部背景色 */
}

.panel-footer button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 0.5rem;
  border: 1px solid transparent;
}

.button-primary {
  background-color: var(--button-bg-color, #007bff);
  color: var(--button-text-color, #fff);
  border-color: var(--button-bg-color, #007bff);
}
.button-primary:hover {
  background-color: var(--button-hover-bg-color, #0056b3);
  border-color: var(--button-hover-bg-color, #0056b3);
}

.button-secondary {
  background-color: #6c757d; /* 暂时硬编码，后续可改为变量 */
  color: #fff;
  border-color: #6c757d;
}
.button-secondary:hover {
  background-color: #5a6268;
  border-color: #545b62;
}

.button-inline {
    margin-left: 10px;
    padding: 4px 8px;
    /* vertical-align: middle; */
    flex-shrink: 0; /* 防止按钮被压缩 */
}

hr {
    border: none;
    border-top: 1px solid var(--border-color, #eee);
    margin: 1.5rem 0;
}

/* Theme Management Styles */
.theme-management-buttons {
    margin-top: 1rem;
    margin-bottom: 1rem;
    display: flex;
    gap: 10px; /* 按钮间距 */
    flex-wrap: wrap; /* 允许换行 */
}
.theme-management-buttons button {
    padding: 0.5rem 1rem;
}

.theme-list {
    list-style: none;
    padding: 0;
    margin-top: 1rem;
    max-height: 200px; /* 限制列表高度并滚动 */
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.theme-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border-color);
}
.theme-list li:last-child {
    border-bottom: none;
}
.theme-list li.preset-theme span {
    font-style: italic;
    color: var(--text-color-secondary);
}
.theme-actions {
    flex-shrink: 0; /* 防止按钮组被压缩 */
}
.theme-actions button {
    margin-left: 0.5rem;
    padding: 2px 6px;
    font-size: 0.8rem;
}
.button-danger {
    background-color: #dc3545;
    color: white;
    border-color: #dc3545;
}
.button-danger:hover {
    background-color: #c82333;
    border-color: #bd2130;
}
.button-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.editor-footer {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

/* Background Styles */
.background-preview {
    width: 100%;
    height: 100px;
    border: 1px dashed var(--border-color);
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-color-secondary);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
}
.background-controls {
    display: flex;
    gap: 10px;
    margin-bottom: 1rem;
    flex-wrap: wrap;
}
.background-controls button {
    padding: 0.5rem 1rem;
}

.error-message {
    color: red;
    font-size: 0.9rem;
    margin-top: 5px;
    width: 100%; /* 确保错误消息占满宽度 */
}
</style>
