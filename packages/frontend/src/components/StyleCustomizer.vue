<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '../stores/settings.store';
import { storeToRefs } from 'pinia';
import type { ITheme } from 'xterm'; // 导入 xterm 主题类型

const { t } = useI18n();
const settingsStore = useSettingsStore();
const { currentUiTheme, currentXtermTheme } = storeToRefs(settingsStore); // 获取响应式的主题状态

// 创建本地响应式副本用于编辑
const editableUiTheme = ref<Record<string, string>>({});
const editableXtermTheme = ref<ITheme>({});

// 初始化本地副本
const initializeEditableThemes = () => {
  // 使用深拷贝确保不直接修改 store 状态
  editableUiTheme.value = JSON.parse(JSON.stringify(currentUiTheme.value || {}));
  editableXtermTheme.value = JSON.parse(JSON.stringify(currentXtermTheme.value || {}));
};

onMounted(initializeEditableThemes);

// 如果 store 中的主题变化（例如通过重置），也更新本地副本
watch(currentUiTheme, initializeEditableThemes, { deep: true });
watch(currentXtermTheme, initializeEditableThemes, { deep: true });


const emit = defineEmits(['close']);

const closeCustomizer = () => {
  emit('close');
};

// 临时的编辑区域占位符
const currentTab = ref<'ui' | 'terminal'>('ui');

// --- 处理函数 ---
const handleSaveChanges = async () => {
  try {
    await settingsStore.saveCustomThemes(editableUiTheme.value, editableXtermTheme.value);
    // 可以添加一个成功提示
    closeCustomizer(); // 保存后关闭
  } catch (error) {
    console.error("保存主题失败:", error);
    // 可以添加一个错误提示
  }
};

const handleResetDefault = async () => {
  try {
    await settingsStore.resetCustomThemes();
    // 重置后本地副本会自动通过 watch 更新
    // 可以添加一个成功提示
  } catch (error) {
    console.error("重置主题失败:", error);
    // 可以添加一个错误提示
  }
};

// 辅助函数：将 CSS 变量名转换为更友好的标签
const formatLabel = (key: string): string => {
  // 简单的转换逻辑，可以根据需要优化
  return key
    .replace(/^--/, '') // 移除前缀 '--'
    .replace(/-/g, ' ') // 替换 '-' 为空格
    .replace(/([A-Z])/g, ' $1') // 在大写字母前加空格
    .replace(/^./, (str) => str.toUpperCase()); // 首字母大写
};

// 辅助函数：将 xterm theme key 转换为更友好的标签
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
          <button @click="currentTab = 'terminal'" :class="{ active: currentTab === 'terminal' }">
            {{ t('styleCustomizer.terminalStyles') }}
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
          <section v-if="currentTab === 'terminal'">
            <h3>{{ t('styleCustomizer.terminalStyles') }}</h3>
            <p>{{ t('styleCustomizer.terminalDescription') }}</p>
            <!-- 动态生成终端样式编辑控件 -->
             <div v-for="(value, key) in editableXtermTheme" :key="key" class="form-group">
               <label :for="`xterm-${key}`">{{ formatXtermLabel(key as keyof ITheme) }}:</label>
               <!-- 简单判断是否为颜色值 -->
               <input
                 v-if="typeof value === 'string' && value.startsWith('#')"
                 type="color"
                 :id="`xterm-${key}`"
                 v-model="(editableXtermTheme as any)[key]"
               />
               <!-- 其他类型（如数字、布尔值）可以添加相应控件，这里简化为文本 -->
               <input
                 v-else
                 type="text"
                 :id="`xterm-${key}`"
                 v-model="(editableXtermTheme as any)[key]"
                 class="text-input"
               />
            </div>
          </section>
        </main>
      </div>
      <footer class="panel-footer">
        <button @click="handleResetDefault" class="button-secondary">{{ t('styleCustomizer.resetDefault') }}</button>
        <button @click="handleSaveChanges" class="button-primary">{{ t('styleCustomizer.saveChanges') }}</button>
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

.panel-main p {
    color: var(--text-color-secondary);
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: inline-block;
    min-width: 150px; /* 调整标签最小宽度以适应更长的文本 */
    margin-right: 0.5rem;
    vertical-align: middle;
    text-align: right; /* 标签右对齐 */
    padding-right: 5px; /* 标签和输入框间距 */
}

.form-group input[type="color"] {
    vertical-align: middle;
    border: 1px solid var(--border-color);
    padding: 2px;
    cursor: pointer;
    width: 150px; /* 统一输入框宽度 */
}

.form-group input[type="text"].text-input {
    vertical-align: middle;
    border: 1px solid var(--border-color);
    padding: 4px 6px;
    border-radius: 3px;
    width: 150px; /* 统一文本输入框宽度 */
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
</style>
