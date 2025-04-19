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
const { isLayoutVisible } = storeToRefs(layoutStore);
const { isConfiguratorVisible: isFocusSwitcherVisible } = storeToRefs(focusSwitcherStore);

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

  // +++ 添加全局 Alt 键监听器 +++
  window.addEventListener('keydown', handleGlobalKeyDown);
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
const handleGlobalKeyDown = (event: KeyboardEvent) => {
  // 仅当 Alt 键被按下且没有其他修饰键 (如 Ctrl, Shift, Meta) 时触发
  if (event.key === 'Alt' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
    event.preventDefault(); // 阻止 Alt 键的默认行为 (例如激活菜单栏)

    // +++ Log: 打印当前的配置序列 +++
    console.log('[App] Current configured sequence in store:', JSON.stringify(focusSwitcherStore.configuredSequence));

    const activeElement = document.activeElement as HTMLElement;
    let currentFocusId: string | null = null;

    // 检查当前焦点元素是否有我们设置的 data-focus-id
    if (activeElement && activeElement.hasAttribute('data-focus-id')) {
      currentFocusId = activeElement.getAttribute('data-focus-id');
    }

    console.log(`[App] Alt pressed. Current focus ID: ${currentFocusId}`);

    // --- 新的查找逻辑 ---
    const sequence = focusSwitcherStore.configuredSequence; // 获取完整的配置顺序
    if (sequence.length === 0) {
      console.log('[App] No focus sequence configured.');
      return; // 没有配置，直接返回
    }

    let startIndex = 0;
    if (currentFocusId) {
      const currentIndex = sequence.indexOf(currentFocusId);
      if (currentIndex !== -1) {
        startIndex = (currentIndex + 1) % sequence.length; // 从当前焦点的下一个开始查找
      } else {
         console.log(`[App] Current focus ID ${currentFocusId} not found in sequence, starting search from beginning.`);
      }
    } else {
        console.log('[App] No current focus ID found, starting search from beginning.');
    }


    // 循环查找下一个可聚焦的目标 (最多循环一次完整的序列)
    let foundFocusable = false;
    for (let i = 0; i < sequence.length; i++) {
      const nextIndex = (startIndex + i) % sequence.length;
      const nextFocusId = sequence[nextIndex];
      console.log(`[App] Trying to find element with ID: ${nextFocusId}`);

      const nextElement = document.querySelector(`[data-focus-id="${nextFocusId}"]`) as HTMLElement | null;

      if (nextElement && isElementVisibleAndFocusable(nextElement)) {
        // --- 目标元素找到且可聚焦 ---
        console.log(`[App] Found focusable element:`, nextElement);
        nextElement.focus();
        if (nextElement instanceof HTMLInputElement || nextElement instanceof HTMLTextAreaElement) {
           nextElement.select();
        }
        foundFocusable = true;
        break; // 找到并聚焦，跳出循环

      } else if (nextFocusId === 'fileManagerSearch' || nextFocusId === 'terminalSearch') {
        // --- 特殊处理：目标是文件管理器或终端搜索框 ---
        const targetElement = document.querySelector(`[data-focus-id="${nextFocusId}"]`) as HTMLElement | null; // 先尝试查找

        if (!targetElement || !isElementVisibleAndFocusable(targetElement)) {
             // --- 如果元素不存在或不可聚焦，尝试激活 ---
             console.log(`[App] Target ${nextFocusId} not found or not focusable. Triggering activation via store...`);
             if (nextFocusId === 'fileManagerSearch') {
                 focusSwitcherStore.triggerFileManagerSearchActivation();
             } else { // terminalSearch
                 focusSwitcherStore.triggerTerminalSearchActivation();
             }
             // --- 关键：触发激活后，不设置 foundFocusable，也不 break，让循环继续查找下一个 ---
             console.log(`[App] Activation triggered for ${nextFocusId}. Continuing search...`);
        } else {
             // --- 如果元素存在且可聚焦 (理论上不应该进入这里，因为前面的 if 会处理，但作为防御性代码保留) ---
             console.log(`[App] Found focusable element after all:`, targetElement);
             targetElement.focus();
             if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
                targetElement.select();
             }
             foundFocusable = true;
             break;
        }


        // --- 旧的逻辑移除 ---
        /*
        // 使用 setTimeout 等待 DOM 更新后再尝试聚焦
        setTimeout(() => {
          const targetElement = document.querySelector(`[data-focus-id="${nextFocusId}"]`) as HTMLElement | null;
          if (targetElement && isElementVisibleAndFocusable(targetElement)) {
            console.log(`[App] Focusing ${nextFocusId} after activation attempt.`);
            targetElement.focus();
            if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
               targetElement.select();
            }
          } else {
            console.warn(`[App] Failed to focus ${nextFocusId} even after activation attempt.`);
          }
        }, 150); // 稍微增加延迟，确保组件有足够时间响应和渲染

        foundFocusable = true; // 无论是否成功聚焦，都认为这个目标已被尝试处理
        break; // 处理完文件管理器，跳出循环
        */
      } else {
        // --- 其他元素未找到或不可聚焦 ---
        console.log(`[App] Element with ID ${nextFocusId} not found or not focusable. Skipping.`);
      }
    }

    if (!foundFocusable) {
        console.log('[App] Cycled through sequence, no focusable element found.');
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
    <header v-if="!isWorkspaceRoute || isLayoutVisible"> <!-- *** 添加 v-if *** -->
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
