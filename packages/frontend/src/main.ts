import { createApp } from 'vue';
import { createPinia } from 'pinia'; // 引入 Pinia
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'; // 引入持久化插件
import App from './App.vue';
import router from './router'; // 引入我们创建的 router
import i18n from './i18n'; // 引入 i18n 实例
import './style.css';

const pinia = createPinia(); // 创建 Pinia 实例
pinia.use(piniaPluginPersistedstate); // 使用持久化插件

const app = createApp(App);

app.use(pinia); // 使用配置好的 Pinia 实例
app.use(router); // 使用 Router
app.use(i18n); // 使用 i18n

app.mount('#app');
