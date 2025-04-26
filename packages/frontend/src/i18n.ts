import { createI18n, Composer } from 'vue-i18n';

// 动态导入 locales 目录下的所有 .json 文件
// 使用 { eager: true } 确保同步加载，因为 i18n 实例需要在应用初始化时就绪
// 使用 { import: 'default' } 直接获取模块的默认导出
const localeModules = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });

// 构建 messages 对象和可用语言列表
const messages: Record<string, any> = {};
const availableLocales: string[] = [];

for (const path in localeModules) {
  // 从路径中提取语言代码 (例如 './locales/en.json' -> 'en')
  const locale = path.match(/.\/locales\/(.+)\.json$/)?.[1];
  if (locale) {
    messages[locale] = localeModules[path]; // 获取导入的 JSON 内容
    availableLocales.push(locale);
  }
}

// 检查是否成功加载了任何语言文件
if (availableLocales.length === 0) {
  console.error("[i18n] No language files found in './locales/'. Please ensure language files exist and the path is correct.");
}

// 类型推断 (基于第一个加载的语言文件，假设所有文件结构一致)
// 如果没有加载到文件，则使用空对象作为 fallback，避免运行时错误
type MessageSchema = typeof messages[availableLocales[0]] | {};

// 定义默认语言 (优先使用 'en'，如果不存在则使用第一个找到的语言)
export const defaultLng = availableLocales.includes('en') ? 'en' : availableLocales[0] || 'en'; // 添加 'en' 作为最终 fallback
const localStorageKey = 'user-locale';

// 尝试从 localStorage 获取语言，否则回退
const getInitialLocale = (): string => {
  const storedLocale = localStorage.getItem(localStorageKey);
  // 检查存储的 locale 是否在当前可用的语言列表中
  if (storedLocale && availableLocales.includes(storedLocale)) {
    return storedLocale;
  }
  // 回退逻辑：检查浏览器语言是否可用
  const navigatorLang = navigator.language?.split('-')[0];
  if (navigatorLang && availableLocales.includes(navigatorLang)) {
      return navigatorLang;
  }
  // 最后回退到默认语言
  return defaultLng;
};


const i18n = createI18n<[MessageSchema], string>({ // 使用 string 作为 locale 类型，因为它是动态的
  legacy: false, // 必须设置为 false 才能在 Composition API 中使用 useI18n
  locale: getInitialLocale(), // 使用计算得到的初始语言
  fallbackLocale: defaultLng, // 如果当前语言缺少某个 key，则回退到默认语言
  messages: messages, // 使用动态构建的 messages 对象
  // 可选：关闭控制台的 i18n 警告 (例如缺少 key 的警告)
  // silentTranslationWarn: true,
  // silentFallbackWarn: true,
});

/**
 * 设置 i18n 实例的区域设置
 * @param lang 要设置的语言代码
 */
export const setLocale = (lang: string) => {
  console.log(`[i18n] Attempting to set locale to: ${lang}`);
  const globalComposer = i18n.global as unknown as Composer;
  // 使用动态获取的可用语言列表进行检查
  if (availableLocales.includes(lang)) {
    const currentLocale = globalComposer.locale.value;
    if (currentLocale !== lang) {
        globalComposer.locale.value = lang; // 更新 locale
        console.log(`[i18n] Successfully updated global locale from "${currentLocale}" to "${lang}".`);
        try {
          localStorage.setItem(localStorageKey, lang); // 持久化到 localStorage
          console.log(`[i18n] Locale "${lang}" saved to localStorage.`);
        } catch (e) {
          console.error('[i18n] Failed to save locale to localStorage:', e);
        }
    } else {
        console.log(`[i18n] Locale is already "${lang}". No update needed.`);
    }
  } else {
    console.warn(`[i18n] Locale "${lang}" is not available. Available locales: ${availableLocales.join(', ')}`);
  }
};

// 导出可用语言列表，方便其他地方使用 (例如语言选择器)
export { availableLocales };

export default i18n;
