import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

// 定义支持的语言
export const supportedLngs = ['en', 'zh'];
export const defaultLng = 'en';

i18next
  .use(Backend)
  .init({
    debug: process.env.NODE_ENV === 'development', // Enable debug logging in dev
    supportedLngs,
    fallbackLng: defaultLng,
    // lng: defaultLng, // Remove explicit lng setting here, let it be determined later or by detector
    preload: supportedLngs, // Preload all supported languages
    ns: ['notifications'], // 命名空间，用于组织翻译
    defaultNS: 'notifications',
    backend: {
      // path where resources get loaded from
      loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false, // Not needed for react apps
    },
  }, (err, t) => { // Add init callback
    if (err) {
        return console.error('[i18next] Error during initialization:', err);
    }
    console.log('[i18next] Initialization complete. Loaded languages:', Object.keys(i18next.store.data));
    // console.log('[i18next] Example translation (en):', t('testNotification.subject', { lng: 'en' })); // Optional test
    // console.log('[i18next] Example translation (zh):', t('testNotification.subject', { lng: 'zh' })); // Optional test
  });

export default i18next;
