import { createApp } from 'vue';
import { createPinia } from 'pinia'; // 引入 Pinia
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'; // 引入持久化插件
import App from './App.vue';
import router from './router'; // 引入我们创建的 router
import i18n from './i18n'; // 引入 i18n 实例
import { useAuthStore } from './stores/auth.store'; // *** 新增：引入 Auth Store ***
import { useSettingsStore } from './stores/settings.store'; // 引入 Settings Store
import { useAppearanceStore } from './stores/appearance.store'; // 引入 Appearance Store
import './style.css';
// 导入 Font Awesome CSS
import '@fortawesome/fontawesome-free/css/all.min.css';
// 导入 splitpanes CSS
import 'splitpanes/dist/splitpanes.css';

const pinia = createPinia(); // 创建 Pinia 实例
pinia.use(piniaPluginPersistedstate); // 使用持久化插件

const app = createApp(App);

app.use(pinia); // 使用配置好的 Pinia 实例
app.use(router); // 使用 Router
app.use(i18n); // 使用 i18n

// --- 应用初始化逻辑 ---
// 使用 async IIFE 来允许顶层 await
(async () => {
  const authStore = useAuthStore(pinia); // 实例化 Auth Store
  // **提前实例化 AppearanceStore 以确保 immediate watcher 运行**
  const appearanceStore = useAppearanceStore(pinia);

  try {
    // 1. 检查是否需要初始设置
    const needsSetup = await authStore.checkSetupStatus();

    if (needsSetup) {
      // 2a. 如果需要设置，立即重定向到设置页面并挂载应用
      // 路由守卫会处理后续导航
      console.log("需要初始设置，正在重定向到 /setup...");
      // 确保在挂载前完成重定向
      await router.push('/setup');
      app.mount('#app');
    } else {
      // 2b. 如果不需要设置，先检查认证状态
      console.log("不需要初始设置，检查认证状态...");
      await authStore.checkAuthStatus();

      if (authStore.isAuthenticated) {
        // 3a. 如果已认证，加载用户设置和外观数据
        console.log("用户已认证，加载设置和外观数据...");
        const settingsStore = useSettingsStore(pinia);
        // appearanceStore 已在外部实例化
        try {
          await Promise.all([
            settingsStore.loadInitialSettings(),
            appearanceStore.loadInitialAppearanceData() // 调用已实例化的 store 的 action
          ]);
          console.log("用户设置和外观数据加载完成。");
        } catch (error) {
           console.error("加载用户设置或外观数据失败:", error);
           // 加载失败也继续，可能使用默认值或显示错误
        }
      } else {
        // 3b. 如果未认证，不需要加载用户特定数据
        // 但 appearanceStore 已实例化，其 immediate watcher 会应用默认主题
        console.log("用户未认证。");
      }

      // 4. 挂载应用
      app.mount('#app');
    }
  } catch (error) {
    // 捕获 checkSetupStatus 或其他初始化过程中的意外错误
    console.error("应用初始化过程中发生严重错误:", error);
    // 即使发生严重错误，也尝试挂载应用，可能显示错误页面或回退状态
    app.mount('#app');
  }
})();
