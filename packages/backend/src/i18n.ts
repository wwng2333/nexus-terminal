import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import fs from 'fs';

// --- 动态确定支持的语言 ---
const localesDir = path.join(__dirname, 'locales');
let dynamicSupportedLngs: string[] = [];
try {
  // 同步读取 locales 目录下的所有条目
  const entries = fs.readdirSync(localesDir, { withFileTypes: true });
  // 过滤出目录，并将目录名作为支持的语言代码
  dynamicSupportedLngs = entries
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  console.log('[i18next] Dynamically detected languages:', dynamicSupportedLngs);
} catch (err) {
  console.error('[i18next] Error reading locales directory:', err);
  // 如果读取目录失败，可以回退到默认值或抛出错误
  dynamicSupportedLngs = ['en']; // 至少包含默认语言作为回退
}

// 确保默认语言在支持列表中，如果目录扫描失败则添加
export const defaultLng = 'en-US'; // 更新为 en-US
if (!dynamicSupportedLngs.includes(defaultLng)) {
    dynamicSupportedLngs.push(defaultLng);
    console.warn(`[i18next] Default language '${defaultLng}' not found in detected directories, adding it to supported list.`);
}
export const supportedLngs = dynamicSupportedLngs; // 导出动态获取的列表
// --- 结束动态确定 ---


i18next
  .use(Backend)
  .init({
    debug: process.env.NODE_ENV === 'development', // Enable debug logging in dev
    supportedLngs: supportedLngs, // 使用动态获取的列表
    fallbackLng: defaultLng,
    // lng: defaultLng, // Remove explicit lng setting here, let it be determined later or by detector
    preload: supportedLngs, // 使用动态获取的列表进行预加载
    ns: ['notifications'], // 命名空间，用于组织翻译
    defaultNS: 'notifications',
    backend: {
      // path where resources get loaded from
      loadPath: path.join(localesDir, '{{lng}}/{{ns}}.json'), // 直接使用 localesDir
    },
    interpolation: {
      escapeValue: false, // Not needed for react apps
    },
  }, (err, t) => { // Add init callback
    if (err) {
        return console.error('[i18next] Error during initialization:', err);
    }
    console.log('[i18next] Initialization complete. Loaded languages:', Object.keys(i18next.store.data));
  });

export default i18next;
