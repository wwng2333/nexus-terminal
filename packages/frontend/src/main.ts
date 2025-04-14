import { createApp } from 'vue';
import { createPinia } from 'pinia'; // 引入 Pinia
import App from './App.vue';
import router from './router'; // 引入我们创建的 router
import i18n from './i18n'; // 引入 i18n 实例
import './style.css';

const app = createApp(App);

app.use(createPinia()); // 使用 Pinia
app.use(router); // 使用 Router
app.use(i18n); // 使用 i18n

app.mount('#app');
