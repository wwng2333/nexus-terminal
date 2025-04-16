import { createApp } from 'vue';
import { createPinia } from 'pinia'; // 引入 Pinia
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'; // 引入持久化插件
import App from './App.vue';
import router from './router'; // 引入我们创建的 router
import i18n from './i18n'; // 引入 i18n 实例
import { useSettingsStore } from './stores/settings.store'; // 引入 Settings Store
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

// 在挂载应用前加载初始设置
const settingsStore = useSettingsStore(pinia); // 需要传递 pinia 实例
settingsStore.loadInitialSettings().then(() => {
  app.mount('#app'); // 确保设置加载完成后再挂载
}).catch(error => {
  console.error("Failed to load initial settings before mounting app:", error);
  // 即使加载失败，也尝试挂载应用，可能使用默认设置
  app.mount('#app');
});
