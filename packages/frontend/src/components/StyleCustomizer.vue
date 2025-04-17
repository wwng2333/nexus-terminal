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
.form-group input:focus, .form-group select:focus {
    border-color: var(--link-active-color);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15); /* 调整聚焦阴影 */
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


.theme-list {
    list-style: none;
    padding: 0;
    margin-top: 0;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--app-bg-color);
}

.theme-list li {
    display: grid; /* 使用 Grid 布局列表项 */
    grid-template-columns: 1fr auto; /* 名称弹性，按钮固定 */
    align-items: center;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--border-color);
    font-size: 0.95rem;
    transition: background-color 0.2s ease;
    gap: var(--base-margin); /* 列间距 */
}
.theme-list li:hover {
    background-color: var(--header-bg-color);
}
.theme-list li:last-child {
    border-bottom: none;
}
.theme-list li span { /* 主题名称 */
    grid-column: 1 / 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.theme-list li.preset-theme span {
    font-style: italic;
    color: var(--text-color-secondary);
}
.theme-actions {
    grid-column: 2 / 3; /* 按钮组在第二列 */
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem;
}
/* Apply unified styles to theme action buttons - matching button-inline */
.theme-actions button {
    margin-left: 0;
    padding: 0.4rem 0.8rem; /* Corrected padding to match button-inline */
    font-size: 0.9rem; /* Corrected font size to match button-inline */
    border: 1px solid var(--border-color);
    border-radius: 4px; /* Match border-radius */
    background-color: var(--header-bg-color); /* Default style */
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
/* Specific style for danger button within theme actions */
.theme-actions button.button-danger {
    /* Danger colors override default */
    background-color: #f8d7da;
    color: #842029;
    border-color: #f5c2c7;
    /* Size and padding are inherited from the base .theme-actions button rule */
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
  grid-column: 1 / -1; /* 错误消息横跨所有列 */
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
