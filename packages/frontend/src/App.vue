<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'; // +++ 添加 onUnmounted +++
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store';
import { useAppearanceStore } from './stores/appearance.store';
import { useLayoutStore } from './stores/layout.store';
import { useFocusSwitcherStore } from './stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++
import { storeToRefs } from 'pinia';
// 导入通知显示组件
import UINotificationDisplay from './components/UINotificationDisplay.vue';
// 导入文件编辑器弹窗组件
import FileEditorOverlay from './components/FileEditorOverlay.vue';
// 导入样式自定义器组件
import StyleCustomizer from './components/StyleCustomizer.vue';
// +++ 导入焦点切换配置器组件 +++
import FocusSwitcherConfigurator from './components/FocusSwitcherConfigurator.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const appearanceStore = useAppearanceStore();
const layoutStore = useLayoutStore();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++
const { isAuthenticated } = storeToRefs(authStore);
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore);
const { isStyleCustomizerVisible } = storeToRefs(appearanceStore);
const { isLayoutVisible, isHeaderVisible } = storeToRefs(layoutStore); // 添加 isHeaderVisible
const { isConfiguratorVisible: isFocusSwitcherVisible } = storeToRefs(focusSwitcherStore);

const route = useRoute();
const navRef = ref<HTMLElement | null>(null);
const underlineRef = ref<HTMLElement | null>(null);

// +++ 新增：存储上一次由切换器聚焦的 ID +++
const lastFocusedIdBySwitcher = ref<string | null>(null);

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

  // +++ 添加全局 Alt 键监听器 +++
  window.addEventListener('keydown', handleGlobalKeyDown);

  // +++ 加载 Header 可见性状态 +++
  layoutStore.loadHeaderVisibility();
});

// +++ 添加卸载钩子以移除监听器 +++
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});


// *** 新增：计算属性，判断是否在 workspace 路由 ***
const isWorkspaceRoute = computed(() => route.path === '/workspace');

watch(route, () => {
  updateUnderline();
}, { immediate: true }); // *** 确保 immediate: true 存在 ***


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

// +++ 全局键盘事件处理函数 +++
const handleGlobalKeyDown = async (event: KeyboardEvent) => { // Make the function async
  // 仅当 Alt 键被按下且没有其他修饰键 (如 Ctrl, Shift, Meta) 时触发
  if (event.key === 'Alt' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
    event.preventDefault(); // 阻止 Alt 键的默认行为 (例如激活菜单栏)

    // +++ Log: 打印当前的配置序列 +++
    console.log('[App] Current configured sequence in store:', JSON.stringify(focusSwitcherStore.configuredSequence));

    // --- 确定当前焦点位置 ---
    // 优先使用上次切换器聚焦的 ID
    let currentFocusId: string | null = lastFocusedIdBySwitcher.value;
    console.log(`[App] Alt pressed. Last focused by switcher: ${currentFocusId}`);

    // 如果上次切换器聚焦的 ID 不存在，尝试从 document.activeElement 获取
    if (!currentFocusId) {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement.hasAttribute('data-focus-id')) {
            currentFocusId = activeElement.getAttribute('data-focus-id');
            console.log(`[App] Found focus ID from activeElement: ${currentFocusId}`);
        } else {
            console.log(`[App] Could not determine current focus ID from activeElement either.`);
        }
    }

    // --- 重构后的查找和聚焦逻辑 ---
    const sequence = focusSwitcherStore.configuredSequence;
    if (sequence.length === 0) {
      console.log('[App] No focus sequence configured.');
      return;
    }

    // 尝试聚焦下一个目标，循环最多一次
    let focused = false;
    for (let i = 0; i < sequence.length; i++) {
      const nextFocusId = focusSwitcherStore.getNextFocusTargetId(currentFocusId);
      if (!nextFocusId) { // 如果序列为空或找不到下一个（理论上不应发生，除非序列在迭代中改变）
        console.warn('[App] Could not determine next focus target ID.');
        break;
      }

      console.log(`[App] Trying to focus target ID: ${nextFocusId}`);
      const success = await focusSwitcherStore.focusTarget(nextFocusId);

      if (success) {
        console.log(`[App] Successfully focused ${nextFocusId}.`);
        lastFocusedIdBySwitcher.value = nextFocusId; // 记住成功聚焦的 ID
        focused = true;
        break; // 成功聚焦，退出循环
      } else {
        console.log(`[App] Failed to focus ${nextFocusId}. Trying next in sequence...`);
        currentFocusId = nextFocusId; // 更新当前 ID，以便 getNextFocusTargetId 找到下一个
      }
    }

    if (!focused) {
      console.log('[App] Cycled through sequence, no target could be focused.');
      lastFocusedIdBySwitcher.value = null; // 重置记忆
    }
  }
};

// +++ 辅助函数：检查元素是否可见且可聚焦 +++
const isElementVisibleAndFocusable = (element: HTMLElement): boolean => {
  if (!element) return false;
  // 检查元素是否在 DOM 中，并且没有 display: none
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // 检查元素或其父元素是否被禁用
  if ((element as HTMLInputElement).disabled) return false;
  let parent = element.parentElement;
  while (parent) {
    if ((parent as HTMLFieldSetElement).disabled) return false;
    parent = parent.parentElement;
  }
  // 检查元素是否足够在视口内（粗略检查）
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

</script>

<template>
  <div id="app-container">
    <!-- *** 修改 v-if 条件以使用 isHeaderVisible *** -->
    <header v-if="!isWorkspaceRoute || isHeaderVisible">
      <nav ref="navRef">
        <div class="nav-left"> <!-- Group left-aligned links -->
            <!-- <RouterLink to="/">{{ t('nav.dashboard') }}</RouterLink> --> <!-- 隐藏仪表盘链接 -->
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

    <!-- +++ 条件渲染焦点切换配置器 (使用 v-show 保持实例) +++ -->
    <FocusSwitcherConfigurator
      v-show="isFocusSwitcherVisible"
      :isVisible="isFocusSwitcherVisible"
      @close="focusSwitcherStore.toggleConfigurator(false)"
    />

  </div>
</template>

<style scoped>
#app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: var(--font-family-sans-serif); /* 使用字体变量 */
  /* background-color: var(--app-bg-color); */ /* 移除容器背景色，让 body 背景透出来 */
}

header {
  background-color: var(--header-bg-color); /* 使用头部背景色变量 */
  padding: 0 calc(var(--base-padding) * 1.5); /* Adjust padding: 0 top/bottom, more left/right */
  border-bottom: 1px solid var(--border-color); /* 使用边框颜色变量 */
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); /* Enhanced shadow for more depth */
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

</style>
