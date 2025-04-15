import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

// 定义支持的语言
export const supportedLngs = ['en', 'zh'];
export const defaultLng = 'en';

i18next
  .use(Backend)
  .init({
    // debug: process.env.NODE_ENV === 'development', // 可选：开发模式下开启调试
    supportedLngs,
    fallbackLng: defaultLng,
    lng: defaultLng, // 默认语言
    ns: ['notifications'], // 命名空间，用于组织翻译
    defaultNS: 'notifications',
    backend: {
      // path where resources get loaded from
      loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false, // 不对插值进行转义，因为我们可能需要 HTML 或 Markdown
    },
  });

export default i18next;
