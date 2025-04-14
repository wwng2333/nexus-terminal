import { createI18n } from 'vue-i18n';

// 导入语言文件
import enMessages from './locales/en.json';
import zhMessages from './locales/zh.json';

// 类型推断 (可选，但推荐)
type MessageSchema = typeof enMessages; // 假设 en.json 包含所有 key

// 获取浏览器语言或默认语言
const getInitialLocale = (): string => {
  const navigatorLang = navigator.language?.split('-')[0]; // 获取 'en', 'zh' 等
  if (navigatorLang === 'zh') {
    return 'zh';
  }
  // 可以添加更多语言支持
  return 'en'; // 默认英文
};

const i18n = createI18n<[MessageSchema], 'en' | 'zh'>({
  legacy: false, // 必须设置为 false 才能在 Composition API 中使用 useI18n
  locale: getInitialLocale(), // 设置初始语言
  fallbackLocale: 'en', // 如果当前语言缺少某个 key，则回退到英文
  messages: {
    en: enMessages,
    zh: zhMessages,
  },
  // 可选：关闭控制台的 i18n 警告 (例如缺少 key 的警告)
  // silentTranslationWarn: true,
  // silentFallbackWarn: true,
});

export default i18n;
