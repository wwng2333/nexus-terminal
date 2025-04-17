<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { ref, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store';
import { useAppearanceStore } from './stores/appearance.store'; // 导入外观 Store
import { storeToRefs } from 'pinia';
// 导入通知显示组件
import UINotificationDisplay from './components/UINotificationDisplay.vue';
// 导入文件编辑器弹窗组件
import FileEditorOverlay from './components/FileEditorOverlay.vue';
// 导入样式自定义器组件
import StyleCustomizer from './components/StyleCustomizer.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const appearanceStore = useAppearanceStore(); // 实例化外观 Store
const { isAuthenticated } = storeToRefs(authStore);
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore);
const { isStyleCustomizerVisible } = storeToRefs(appearanceStore); // 从外观 store 获取可见性状态

const route = useRoute();
const navRef = ref<HTMLElement | null>(null);
const underlineRef = ref<HTMLElement | null>(null);

const updateUnderline = async () => {
  await nextTick(); // 等待 DOM 更新
  if (navRef.value && underlineRef.value) {
    const activeLink = navRef.value.querySelector('.router-link-exact-active') as HTMLElement;
    if (activeLink) {
      underlineRef.value.style.left = `${activeLink.offsetLeft}px`;
      underlineRef.value.style.width = `${activeLink.offsetWidth}px`;
      underlineRef.value.style.opacity = '1'; // Make it visible
    } else {
      underlineRef.value.style.opacity = '0'; // Hide if no active link (e.g., on login page if not a nav link)
    }
  }
};

onMounted(() => {
  // Initial position update
  // Use setTimeout to ensure styles are applied and elements have dimensions
  setTimeout(updateUnderline, 100);
});

watch(route, () => {
  updateUnderline();
});


const handleLogout = () => {
  authStore.logout();
};

// 打开样式自定义器的方法现在直接调用 store action
const openStyleCustomizer = () => {
  appearanceStore.toggleStyleCustomizer(true);
};

// 关闭样式自定义器的方法现在也调用 store action
const closeStyleCustomizer = () => {
  appearanceStore.toggleStyleCustomizer(false);
};
</script>

<template>
  <div id="app-container">
    <header>
      <nav ref="navRef">
        <div class="nav-left"> <!-- Group left-aligned links -->
            <RouterLink to="/">{{ t('nav.dashboard') }}</RouterLink>
            <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink>
            <RouterLink to="/workspace">{{ t('nav.terminal') }}</RouterLink>
            <RouterLink to="/proxies">{{ t('nav.proxies') }}</RouterLink>
            <RouterLink to="/notifications">{{ t('nav.notifications') }}</RouterLink>
            <RouterLink to="/audit-logs">{{ t('nav.auditLogs') }}</RouterLink>
            <RouterLink to="/settings">{{ t('nav.settings') }}</RouterLink>
        </div>
        <div class="nav-right"> <!-- Group right-aligned links -->
            <a href="#" @click.prevent="openStyleCustomizer" :title="t('nav.customizeStyle')">🎨</a>
            <RouterLink v-if="!isAuthenticated" to="/login">{{ t('nav.login') }}</RouterLink>
            <a href="#" v-if="isAuthenticated" @click.prevent="handleLogout">{{ t('nav.logout') }}</a>
        </div>
        <!-- Sliding underline element -->
        <div ref="underlineRef" class="nav-underline"></div>
      </nav>
    </header>

    <main>
      <RouterView /> <!-- 路由对应的组件将在这里渲染 -->
    </main>

    <!-- 添加全局通知显示 -->
    <UINotificationDisplay />

    <!-- 根据设置条件渲染全局文件编辑器弹窗 -->
    <FileEditorOverlay v-if="showPopupFileEditorBoolean" />

    <!-- 条件渲染样式自定义器，使用 store 的状态和方法 -->
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
  background-color: var(--app-bg-color); /* Set base background for the whole app */
}

header {
  background-color: var(--header-bg-color); /* 使用头部背景色变量 */
  padding: 0 calc(var(--base-padding) * 1.5); /* Adjust padding: 0 top/bottom, more left/right */
  border-bottom: 1px solid var(--border-color); /* 使用边框颜色变量 */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); /* Softer shadow */
  height: 55px; /* Slightly taller header */
  display: flex; /* Use flexbox for alignment */
  align-items: center; /* Center items vertically */
  position: sticky; /* Make header sticky */
  top: 0;
  z-index: 10; /* Ensure header stays on top */
}

nav {
  display: flex;
  align-items: center; /* Align nav items vertically */
  width: 100%; /* Make nav take full width */
  justify-content: space-between; /* Space out left and right groups */
}

.nav-left, .nav-right {
    display: flex;
    align-items: center;
    gap: calc(var(--base-margin) / 3); /* Add small gap between items */
}

nav a {
  text-decoration: none;
  color: var(--text-color-secondary); /* Use secondary text color for inactive links */
  padding: 0.6rem 0.9rem; /* Adjust padding */
  border-radius: 6px; /* Slightly more rounded */
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; /* Smooth transition */
  font-size: 0.9rem;
  line-height: 1;
  white-space: nowrap;
  position: relative; /* For potential pseudo-elements */
  border: 1px solid transparent; /* Add transparent border for layout consistency */
}

nav a:hover {
  color: var(--link-hover-color); /* Use specific hover color */
  background-color: rgba(128, 128, 128, 0.1); /* Subtle grey background on hover */
}

nav a.router-link-exact-active {
  font-weight: 500; /* Medium weight */
  color: var(--link-active-color); /* Use active link color */
  background-color: transparent; /* Remove background for active link */
  /* The underline is now handled by a separate element */
}

/* Style for the sliding underline */
.nav-underline {
  position: absolute;
  bottom: 0px; /* Position at the very bottom of the nav */
  height: 2px; /* Thickness of the indicator */
  background-color: var(--link-active-color); /* Color of the indicator */
  border-radius: 1px;
  transition: left 0.3s ease-in-out, width 0.3s ease-in-out; /* Smooth transition for sliding */
  opacity: 0; /* Initially hidden */
  pointer-events: none; /* Prevent interaction */
}


/* Style the theme icon link */
nav a[title*="t('nav.customizeStyle')"] {
    padding: 0.5rem 0.7rem; /* Adjust padding for icon */
    font-size: 1.1rem; /* Make icon slightly larger */
    color: var(--text-color-secondary); /* Match other inactive links */
}
nav a[title*="t('nav.customizeStyle')"]:hover {
    color: var(--link-hover-color);
    background-color: rgba(128, 128, 128, 0.1);
}

/* Style logout/login link */
.nav-right a {
    /* Specific styles if needed, e.g., slightly different color */
    color: var(--text-color-secondary);
}
.nav-right a:hover {
    color: var(--link-hover-color);
    background-color: rgba(128, 128, 128, 0.1);
}


main {
  flex-grow: 1;
  /* padding: var(--base-padding); */ /* Keep padding removed from main */
}

footer {
  padding: var(--base-padding); /* 使用基础内边距变量 */
}

footer {
  background-color: var(--footer-bg-color); /* 使用底部背景色变量 */
  padding: calc(var(--base-padding) / 20) var(--base-padding); /* 调整内边距 */
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-color-secondary); /* 使用次要文字颜色变量 */
  border-top: 1px solid var(--border-color); /* 使用边框颜色变量 */
  margin-top: auto; /* Pushes footer to the bottom */
}
</style>
