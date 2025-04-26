import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import fs from 'fs';

// --- 动态确定支持的语言 ---
const localesDir = path.join(__dirname, 'locales');
// --- 添加调试日志 ---
console.log(`[i18next-debug] Calculated locales directory path: ${localesDir}`);
// --- 结束调试日志 ---
let dynamicSupportedLngs: string[] = [];
try {
  const entries = fs.readdirSync(localesDir, { withFileTypes: true });
  // Filter for .json files directly, assuming filenames are language codes (e.g., en-US.json)
  dynamicSupportedLngs = entries
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
    .map(dirent => dirent.name.replace('.json', '')); // Extract lang code from filename
  console.log('[i18next] Dynamically detected languages:', dynamicSupportedLngs);
} catch (err) {
  console.error('[i18next] Error reading locales directory:', err);
  dynamicSupportedLngs = ['en-US']; // Fallback
}

export const defaultLng = 'en-US';
if (!dynamicSupportedLngs.includes(defaultLng)) {
    dynamicSupportedLngs.push(defaultLng);
    console.warn(`[i18next] Default language '${defaultLng}' not found in detected files, adding it to supported list.`);
}
export const supportedLngs = dynamicSupportedLngs;
// --- 结束动态确定 ---


let i18nInitialized = false;
// Create a promise that resolves when i18next is initialized
const i18nInitializationPromise = new Promise<void>((resolve, reject) => {
    i18next
      .use(Backend)
      .init({
        debug: process.env.NODE_ENV === 'development',
        supportedLngs: supportedLngs,
        fallbackLng: defaultLng,
        preload: supportedLngs,
        // ns and defaultNS removed as translations are now in root language files (e.g., en-US.json)
        backend: {
          loadPath: path.join(localesDir, '{{lng}}.json'), // Load root JSON files directly
        },
        interpolation: {
          escapeValue: false,
        },
      }, (err, t) => { // Init callback
        if (err) {
            console.error('[i18next] Error during initialization:', err);
            i18nInitialized = false; // Mark as not initialized on error
            return reject(err); // Reject the promise on error
        }
        console.log('[i18next] Initialization complete. Loaded languages:', Object.keys(i18next.store.data || {})); // Safe access to store.data
        i18nInitialized = true; // Mark as initialized
        resolve(); // Resolve the promise on success
      });
});

// Export the promise and a function to check status (optional)
export { i18nInitializationPromise, i18nInitialized };
export default i18next; // Export the instance as well
