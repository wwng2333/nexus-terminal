import { createApp } from 'vue';
import { createPinia } from 'pinia'; // 引入 Pinia
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'; // 引入持久化插件
import App from './App.vue';
import router from './router'; // 引入我们创建的 router
import i18n from './i18n'; // 引入 i18n 实例
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

// 在挂载应用前加载初始设置和外观数据
const settingsStore = useSettingsStore(pinia);
const appearanceStore = useAppearanceStore(pinia); // 实例化 Appearance Store

Promise.all([
  settingsStore.loadInitialSettings(),
  appearanceStore.loadInitialAppearanceData() // 并行加载外观数据
]).then(() => {
  console.log("初始设置和外观数据加载完成。");
  app.mount('#app'); // 确保所有数据加载完成后再挂载
}).catch((error: unknown) => {
  console.error("加载初始数据失败:", error);
  // 即使加载失败，也尝试挂载应用，可能使用默认设置
  app.mount('#app');
});
