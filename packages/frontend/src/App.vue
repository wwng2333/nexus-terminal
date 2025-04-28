<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store';
import { useAppearanceStore } from './stores/appearance.store';
import { useLayoutStore } from './stores/layout.store';
import { useFocusSwitcherStore } from './stores/focusSwitcher.store'; // +++ 导入焦点切换 Store +++
import { useSessionStore } from './stores/session.store'; // +++ 导入 Session Store +++
import { storeToRefs } from 'pinia';
// 导入通知显示组件
import UINotificationDisplay from './components/UINotificationDisplay.vue';
// 导入文件编辑器弹窗组件
import FileEditorOverlay from './components/FileEditorOverlay.vue';
// 导入样式自定义器组件
import StyleCustomizer from './components/StyleCustomizer.vue';
// +++ 导入焦点切换配置器组件 +++
import FocusSwitcherConfigurator from './components/FocusSwitcherConfigurator.vue';
// +++ 导入 RDP 模态框组件 +++
import RemoteDesktopModal from './components/RemoteDesktopModal.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const appearanceStore = useAppearanceStore();
const layoutStore = useLayoutStore();
const focusSwitcherStore = useFocusSwitcherStore(); // +++ 实例化焦点切换 Store +++
const sessionStore = useSessionStore(); // +++ 实例化 Session Store +++
const { isAuthenticated } = storeToRefs(authStore);
const { showPopupFileEditorBoolean } = storeToRefs(settingsStore);
const { isStyleCustomizerVisible } = storeToRefs(appearanceStore);
const { isLayoutVisible, isHeaderVisible } = storeToRefs(layoutStore); // 添加 isHeaderVisible
const { isConfiguratorVisible: isFocusSwitcherVisible } = storeToRefs(focusSwitcherStore);
const { isRdpModalOpen, rdpConnectionInfo } = storeToRefs(sessionStore); // +++ 获取 RDP 状态 +++

const route = useRoute();
const navRef = ref<HTMLElement | null>(null);
const underlineRef = ref<HTMLElement | null>(null);

// +++ 新增：存储上一次由切换器聚焦的 ID +++
const lastFocusedIdBySwitcher = ref<string | null>(null);
const isAltPressed = ref(false); // 跟踪 Alt 键是否按下
const altShortcutKey = ref<string | null>(null);
// --- 移除 shortcutTriggeredInKeyDown 标志 ---

const updateUnderline = async () => {
  await nextTick(); // 等待 DOM 更新
  if (navRef.value && underlineRef.value) {
    const activeLink = navRef.value.querySelector('.router-link-exact-active') as HTMLElement;
    if (activeLink) {
      const offsetBottom = 2; // 下划线距离文字底部的距离 (px)
      underlineRef.value.style.left = `${activeLink.offsetLeft}px`;
      underlineRef.value.style.width = `${activeLink.offsetWidth}px`;
      // underlineRef.value.style.top = `${activeLink.offsetTop + activeLink.offsetHeight + offsetBottom}px`; // 移除 top 设置
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
  window.addEventListener('keydown', handleAltKeyDown); // +++ 监听 keydown 设置状态 +++
  window.addEventListener('keyup', handleGlobalKeyUp);   // +++ 监听 keyup 执行切换 +++

  // +++ 加载 Header 可见性状态 +++
  layoutStore.loadHeaderVisibility();
});

// +++ 添加卸载钩子以移除监听器 +++
onUnmounted(() => {
  window.removeEventListener('keydown', handleAltKeyDown); // +++ 移除 keydown 监听 +++
  window.removeEventListener('keyup', handleGlobalKeyUp);   // +++ 移除 keyup 监听 +++
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

// +++ 修改：处理 Alt 键按下的事件处理函数，并记录快捷键 +++
const handleAltKeyDown = async (event: KeyboardEvent) => { // +++ 改为 async +++
  // 只在 Alt 键首次按下时设置状态
  if (event.key === 'Alt' && !event.repeat) {
    isAltPressed.value = true;
    altShortcutKey.value = null;
    // console.log('[App] Alt key pressed down.');
  } else if (isAltPressed.value && !['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    // 如果 Alt 正被按住，且按下了非修饰键 (移除 !shortcutTriggeredInKeyDown 检查)
    let key = event.key;
    if (key.length === 1) key = key.toUpperCase();

    if (/^[a-zA-Z0-9]$/.test(key)) {
        altShortcutKey.value = key; // 记录按键
        const shortcutString = `Alt+${key}`;
        console.log(`[App] KeyDown: Alt+${key} detected. Checking shortcut: ${shortcutString}`);
        const targetId = focusSwitcherStore.getFocusTargetIdByShortcut(shortcutString);

        if (targetId) {
            console.log(`[App] KeyDown: Shortcut match found. Targeting ID: ${targetId}`);
            event.preventDefault(); // 阻止默认行为 (如菜单)
            const success = await focusSwitcherStore.focusTarget(targetId); // +++ 立即尝试聚焦 +++
            if (success) {
                console.log(`[App] KeyDown: Successfully focused ${targetId} via shortcut.`);
                lastFocusedIdBySwitcher.value = targetId;
                // --- 移除设置标志位 ---
            } else {
                console.log(`[App] KeyDown: Failed to focus ${targetId} via shortcut action.`);
                // 聚焦失败，可以选择是否取消 Alt 状态，暂时不处理，让 keyup 重置
            }
        } else {
            console.log(`[App] KeyDown: No configured shortcut found for ${shortcutString}.`);
            // 没有匹配的快捷键，可以选择取消 Alt 状态以允许默认行为，或保持状态等待 keyup
            // isAltPressed.value = false;
            // altShortcutKey.value = null;
        }
    } else {
        // 按下无效键 (非字母数字)，取消 Alt 状态
        isAltPressed.value = false;
        altShortcutKey.value = null;
        // --- 移除重置标志位 ---
        console.log('[App] KeyDown: Alt sequence cancelled by non-alphanumeric key press.');
    }
  } else if (isAltPressed.value && ['Control', 'Shift', 'Meta'].includes(event.key)) {
      // 按下其他修饰键，取消 Alt 状态
      isAltPressed.value = false;
      altShortcutKey.value = null;
      // --- 移除重置标志位 ---
      console.log('[App] KeyDown: Alt sequence cancelled by other modifier key press.');
  }
};

// +++ 修改：全局键盘事件处理函数，监听 keyup，优先处理快捷键 +++
const handleGlobalKeyUp = async (event: KeyboardEvent) => {
  if (event.key === 'Alt') {
    const altWasPressed = isAltPressed.value;
    const triggeredShortcutKey = altShortcutKey.value; // 记录松开时是否有记录的快捷键

    // 总是重置状态
    isAltPressed.value = false;
    altShortcutKey.value = null;
    // --- 移除重置标志位 ---

    if (altWasPressed && triggeredShortcutKey === null) {
      // 如果 Alt 之前是按下的，并且没有记录到有效的快捷键，则执行顺序切换
      console.log('[App] KeyUp: Alt released without a valid shortcut key captured. Attempting sequential focus switch.');
      event.preventDefault(); // 仅在执行顺序切换时阻止默认行为

      // --- 顺序切换逻辑 (保持不变) ---
      let currentFocusId: string | null = lastFocusedIdBySwitcher.value;
      console.log(`[App] Sequential switch. Last focused by switcher: ${currentFocusId}`);

      if (!currentFocusId) {
          const activeElement = document.activeElement as HTMLElement;
          if (activeElement && activeElement.hasAttribute('data-focus-id')) {
              currentFocusId = activeElement.getAttribute('data-focus-id');
              console.log(`[App] Sequential switch. Found focus ID from activeElement: ${currentFocusId}`);
          } else {
              console.log(`[App] Sequential switch. Could not determine current focus ID.`);
          }
      }

      const order = focusSwitcherStore.sequenceOrder; // ++ 使用新的 sequenceOrder state ++
      if (order.length === 0) { // ++ 检查新的 state ++
        console.log('[App] No focus sequence configured.');
        return;
      }

      let focused = false;
      for (let i = 0; i < order.length; i++) { // ++ Use order.length for loop condition ++
        const nextFocusId = focusSwitcherStore.getNextFocusTargetId(currentFocusId);
        if (!nextFocusId) {
          console.warn('[App] Could not determine next focus target ID in sequence.');
          break;
        }

        console.log(`[App] Sequential switch. Trying to focus target ID: ${nextFocusId}`);
        const success = await focusSwitcherStore.focusTarget(nextFocusId);

        if (success) {
          console.log(`[App] Successfully focused ${nextFocusId} sequentially.`);
          lastFocusedIdBySwitcher.value = nextFocusId;
          focused = true;
          break;
        } else {
          console.log(`[App] Failed to focus ${nextFocusId} sequentially. Trying next...`);
          currentFocusId = nextFocusId;
        }
      }

      if (!focused) {
        console.log('[App] Cycled through sequence, no target could be focused.');
        lastFocusedIdBySwitcher.value = null;
      }
      // --- 顺序切换逻辑结束 ---

    } else if (altWasPressed && triggeredShortcutKey !== null) {
      console.log(`[App] KeyUp: Alt released after capturing key '${triggeredShortcutKey}'. Shortcut logic handled in keydown. No sequential switch.`);
      // 快捷键逻辑已在 keydown 处理，keyup 时无需操作，也不阻止默认行为（除非特定需要）
    } else {
      // Alt 松开，但 isAltPressed 已经是 false (例如被其他键取消了)
      console.log('[App] KeyUp: Alt released, but sequence was already cancelled or not active.');
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
    <!-- Header with Tailwind classes using theme variables -->
    <header v-if="!isWorkspaceRoute || isHeaderVisible" class="sticky top-0 z-10 flex items-center h-14 pl-3 pr-6 bg-header border-b border-border shadow-sm"> <!-- 减少左侧内边距 -->
      <!-- Nav with Tailwind classes -->
      <nav ref="navRef" class="flex items-center justify-between w-full relative"> <!-- Added relative positioning for underline -->
        <!-- Left navigation links with Tailwind classes using theme variables -->
        <div class="flex items-center space-x-1">
          <!-- 项目 Logo -->
          <img src="./assets/logo.png" alt="Project Logo" class="h-10 w-auto"> <!-- 移除右侧外边距，使其更靠左 -->
            <RouterLink to="/" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.dashboard') }}</RouterLink> <!-- 恢复仪表盘链接 -->
            <RouterLink to="/workspace" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.terminal') }}</RouterLink>
            <RouterLink to="/proxies" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.proxies') }}</RouterLink>
            <RouterLink to="/notifications" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.notifications') }}</RouterLink>
            <RouterLink to="/audit-logs" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.auditLogs') }}</RouterLink>
            <RouterLink to="/settings" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap" active-class="text-link-active bg-nav-active-bg">{{ t('nav.settings') }}</RouterLink>
        </div>
        <!-- Right navigation links with Tailwind classes using theme variables -->
        <div class="flex items-center space-x-1">
            <a href="#" @click.prevent="openStyleCustomizer" :title="t('nav.customizeStyle')" class="px-2 py-2 rounded-md text-lg text-icon hover:text-icon-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out">🎨</a>
            <RouterLink v-if="!isAuthenticated" to="/login" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap">{{ t('nav.login') }}</RouterLink>
            <a href="#" v-if="isAuthenticated" @click.prevent="handleLogout" class="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-link-hover hover:bg-nav-active-bg hover:no-underline transition duration-150 ease-in-out whitespace-nowrap">{{ t('nav.logout') }}</a>
        </div>
        <!-- Sliding underline element with Tailwind classes using theme variables (JS still controls positioning) -->
        <div ref="underlineRef" class="absolute bottom-0 h-0.5 bg-link-active rounded transition-all duration-300 ease-in-out pointer-events-none opacity-0 transform translate-y-1.5"></div> <!-- Changed translate-y-1 to translate-y-1.5 -->
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

    <!-- +++ 条件渲染 RDP 模态框 +++ -->
    <RemoteDesktopModal
      v-if="isRdpModalOpen"
      :connection="rdpConnectionInfo"
      @close="sessionStore.closeRdpModal()"
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

/* Removed header, nav, nav-left, nav-right, nav a, nav a:hover, nav a.router-link-exact-active, .nav-underline, and specific icon/login/logout link styles as they are now handled by Tailwind classes */

main {
  flex-grow: 1;
  /* padding: var(--base-padding); */ /* Keep padding removed from main */
}

</style>
