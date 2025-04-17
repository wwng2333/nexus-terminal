<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store'; // 导入设置 Store
import { storeToRefs } from 'pinia';
// 导入通知显示组件
import UINotificationDisplay from './components/UINotificationDisplay.vue';
// 导入文件编辑器弹窗组件
import FileEditorOverlay from './components/FileEditorOverlay.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore(); // 实例化设置 Store
const { isAuthenticated } = storeToRefs(authStore); // 获取登录状态
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore); // 获取弹窗编辑器设置

const handleLogout = () => {
  authStore.logout();
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
  font-family: sans-serif;
}

header {
  background-color: #f0f0f0;
  padding: 1rem;
  border-bottom: 1px solid #ccc;
}

nav a {
  margin: 0 0.5rem;
  text-decoration: none;
  color: #333;
}

nav a.router-link-exact-active {
  font-weight: bold;
  color: #007bff;
}

main {
  flex-grow: 1;
  padding: 1rem;
}

footer {
  background-color: #f0f0f0;
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: #666;
  border-top: 1px solid #ccc;
  margin-top: auto; /* Pushes footer to the bottom */
}
</style>
