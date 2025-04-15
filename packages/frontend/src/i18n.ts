import { createI18n } from 'vue-i18n';

// 导入语言文件
import enMessages from './locales/en.json';
import zhMessages from './locales/zh.json';

// 类型推断 (可选，但推荐)
type MessageSchema = typeof enMessages; // 假设 en.json 包含所有 key

// 定义默认语言
export const defaultLng = 'en';
const localStorageKey = 'user-locale';

// 尝试从 localStorage 获取语言，否则回退
const getInitialLocaleFromStorage = (): 'en' | 'zh' => {
  const storedLocale = localStorage.getItem(localStorageKey);
  if (storedLocale === 'en' || storedLocale === 'zh') {
    return storedLocale;
  }
  // Fallback logic (e.g., browser language or default)
  const navigatorLang = navigator.language?.split('-')[0];
  return navigatorLang === 'zh' ? 'zh' : defaultLng;
};


const i18n = createI18n<[MessageSchema], 'en' | 'zh'>({
  legacy: false, // 必须设置为 false 才能在 Composition API 中使用 useI18n
  locale: getInitialLocaleFromStorage(), // 使用从 localStorage 或回退获取的初始语言
  fallbackLocale: defaultLng, // 如果当前语言缺少某个 key，则回退到默认语言
  messages: {
    en: enMessages,
    zh: zhMessages,
  },
  // 可选：关闭控制台的 i18n 警告 (例如缺少 key 的警告)
  // silentTranslationWarn: true,
  // silentFallbackWarn: true,
});

/**
 * 设置 i18n 实例的区域设置
 * @param lang 要设置的语言代码 ('en', 'zh', etc.)
 */
export const setLocale = (lang: 'en' | 'zh') => {
  if (i18n.global.availableLocales.includes(lang)) {
    i18n.global.locale = lang; // 直接赋值
    try {
      localStorage.setItem(localStorageKey, lang); // 持久化到 localStorage
      console.log(`[i18n] Locale set to "${lang}" and saved to localStorage.`); // 添加日志
    } catch (e) {
      console.error('[i18n] Failed to save locale to localStorage:', e);
    }
  } else {
    console.warn(`[i18n] Locale "${lang}" is not available.`);
  }
};


export default i18n;
