<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store'; // 导入设置 Store
import { ref } from 'vue'; // 导入 ref
import { storeToRefs } from 'pinia';
// 导入通知显示组件
import UINotificationDisplay from './components/UINotificationDisplay.vue';
// 导入文件编辑器弹窗组件
import FileEditorOverlay from './components/FileEditorOverlay.vue';
// 导入样式自定义器组件
import StyleCustomizer from './components/StyleCustomizer.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore(); // 实例化设置 Store
const { isAuthenticated } = storeToRefs(authStore); // 获取登录状态
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore); // 获取弹窗编辑器设置

// 控制样式自定义器可见性的状态
const isStyleCustomizerVisible = ref(false);

const handleLogout = () => {
  authStore.logout();
};

// 打开样式自定义器
const openStyleCustomizer = () => {
  isStyleCustomizerVisible.value = true;
};

// 关闭样式自定义器 (由子组件触发)
const closeStyleCustomizer = () => {
  isStyleCustomizerVisible.value = false;
};
</script>

<template>
  <div id="app-container">
    <header>
      <nav>
        <RouterLink to="/">{{ t('nav.dashboard') }}</RouterLink> |
        <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink> |
         <RouterLink to="/workspace">{{ t('nav.terminal') }}</RouterLink> | <!-- 新增终端链接 -->
         <RouterLink to="/proxies">{{ t('nav.proxies') }}</RouterLink> | <!-- 新增代理链接 -->
         <!-- <RouterLink to="/tags">{{ t('nav.tags') }}</RouterLink> | --> <!-- 移除标签链接 -->
         <RouterLink to="/notifications">{{ t('nav.notifications') }}</RouterLink> | <!-- 新增通知链接 -->
         <RouterLink to="/audit-logs">{{ t('nav.auditLogs') }}</RouterLink> | <!-- 新增审计日志链接 -->
         <RouterLink to="/settings">{{ t('nav.settings') }}</RouterLink> | <!-- 新增设置链接 -->
        <a href="#" @click.prevent="openStyleCustomizer" :title="t('nav.customizeStyle')">🎨</a> | <!-- 添加调色板按钮 -->
        <RouterLink v-if="!isAuthenticated" to="/login">{{ t('nav.login') }}</RouterLink>
        <a href="#" v-if="isAuthenticated" @click.prevent="handleLogout">{{ t('nav.logout') }}</a>
      </nav>
    </header>

    <main>
      <RouterView /> <!-- 路由对应的组件将在这里渲染 -->
    </main>

    <!-- 添加全局通知显示 -->
    <UINotificationDisplay />

    <!-- 根据设置条件渲染全局文件编辑器弹窗 -->
    <FileEditorOverlay v-if="showPopupFileEditorBoolean" />

    <!-- 条件渲染样式自定义器 -->
    <StyleCustomizer v-if="isStyleCustomizerVisible" @close="closeStyleCustomizer" />

    <footer>
      <!-- 使用 t 函数获取应用名称 -->
      <p>&copy; 2025 {{ t('appName') }}</p>
    </footer>
  </div>
</template>

<style scoped>
#app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: var(--font-family-sans-serif); /* 使用字体变量 */
}

header {
  background-color: var(--header-bg-color); /* 使用头部背景色变量 */
  padding: var(--base-padding); /* 使用基础内边距变量 */
  border-bottom: 1px solid var(--border-color); /* 使用边框颜色变量 */
}

nav a {
  margin: 0 var(--base-margin); /* 使用基础外边距变量 */
  text-decoration: none;
  color: var(--link-color); /* 使用链接颜色变量 */
}

nav a:hover {
  color: var(--link-hover-color); /* 使用链接悬停颜色变量 */
}

nav a.router-link-exact-active {
  font-weight: bold;
  color: var(--link-active-color); /* 使用激活链接颜色变量 */
}

main {
  flex-grow: 1;
  padding: var(--base-padding); /* 使用基础内边距变量 */
}

footer {
  background-color: var(--footer-bg-color); /* 使用底部背景色变量 */
  padding: calc(var(--base-padding) / 2) var(--base-padding); /* 调整内边距 */
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-color-secondary); /* 使用次要文字颜色变量 */
  border-top: 1px solid var(--border-color); /* 使用边框颜色变量 */
  margin-top: auto; /* Pushes footer to the bottom */
}
</style>
