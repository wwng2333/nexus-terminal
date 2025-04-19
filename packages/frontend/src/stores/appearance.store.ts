import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed, watch, nextTick } from 'vue'; // 导入 nextTick
import type { ITheme } from 'xterm';
import type { TerminalTheme } from '../../../backend/src/types/terminal-theme.types'; // 引用后端类型
import type { AppearanceSettings, UpdateAppearanceDto } from '../../../backend/src/types/appearance.types'; // 引用后端类型
import { defaultXtermTheme, defaultUiTheme } from './default-themes.js'; // 尝试添加 .js (编译后) 或保持 .ts

// Helper function to safely parse JSON
export const safeJsonParse = <T>(jsonString: string | undefined | null, defaultValue: T): T => { // Add export
    if (!jsonString) return defaultValue;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("JSON 解析失败:", e);
        return defaultValue;
    }
};

export const useAppearanceStore = defineStore('appearance', () => {
    // --- State ---
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const isStyleCustomizerVisible = ref(false); // 新增：控制样式编辑器可见性

    // Appearance Settings State
    const appearanceSettings = ref<Partial<AppearanceSettings>>({}); // 从 API 获取的原始设置
    const availableTerminalThemes = ref<TerminalTheme[]>([]); // 终端主题列表

    // --- Computed Properties (Getters) ---

    // 当前应用的 UI 主题 (CSS 变量对象)
    const currentUiTheme = computed<Record<string, string>>(() => {
        return safeJsonParse(appearanceSettings.value.customUiTheme, defaultUiTheme);
    });

    // 当前激活的终端主题 ID
    const activeTerminalThemeId = computed(() => appearanceSettings.value.activeTerminalThemeId);

    // 当前应用的终端主题对象 (ITheme)
    const currentTerminalTheme = computed<ITheme>(() => {
        if (!activeTerminalThemeId.value || availableTerminalThemes.value.length === 0) {
            return defaultXtermTheme; // 回退到默认
        }
        const activeTheme = availableTerminalThemes.value.find(t => t._id === activeTerminalThemeId.value);
        return activeTheme ? activeTheme.themeData : defaultXtermTheme; // 找不到也回退
    });

    // 当前终端字体设置
    const currentTerminalFontFamily = computed<string>(() => {
        return appearanceSettings.value.terminalFontFamily || 'Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"'; // 提供默认值
    });

    // 当前终端字体大小
    const currentTerminalFontSize = computed<number>(() => {
        // 提供默认值 14，如果后端没有设置或设置无效
        const size = appearanceSettings.value.terminalFontSize;
        return typeof size === 'number' && size > 0 ? size : 14;
    });

    // 页面背景图片 URL
    const pageBackgroundImage = computed(() => appearanceSettings.value.pageBackgroundImage);

    // 终端背景图片 URL
    const terminalBackgroundImage = computed(() => appearanceSettings.value.terminalBackgroundImage);

    // 当前编辑器字体大小
    const currentEditorFontSize = computed<number>(() => {
        // 提供默认值 14，如果后端没有设置或设置无效
        const size = appearanceSettings.value.editorFontSize;
        return typeof size === 'number' && size > 0 ? size : 14;
    });

    // --- Actions ---

    /**
     * 加载所有外观相关设置 (外观设置 + 终端主题列表)
     */
    async function loadInitialAppearanceData() {
        isLoading.value = true;
        error.value = null;
        try {
            // 并行加载外观设置和主题列表
            const [settingsResponse, themesResponse] = await Promise.all([
                axios.get<AppearanceSettings>('/api/v1/appearance'),
                axios.get<TerminalTheme[]>('/api/v1/terminal-themes')
            ]);
            appearanceSettings.value = settingsResponse.data;
            availableTerminalThemes.value = themesResponse.data;
            console.log('[AppearanceStore] 外观设置已加载:', appearanceSettings.value);
            console.log('[AppearanceStore] 终端主题列表已加载:', availableTerminalThemes.value);

            // 应用加载的 UI 主题
            applyUiTheme(currentUiTheme.value);
            // 应用背景
            applyPageBackground();
            // 终端背景和主题将在 Terminal 组件中应用

        } catch (err: any) {
            console.error('加载外观数据失败:', err);
            error.value = err.response?.data?.message || err.message || '加载外观数据失败';
            // 出错时应用默认值
            appearanceSettings.value = {}; // 清空可能不完整的设置
            availableTerminalThemes.value = [];
            applyUiTheme(defaultUiTheme);
            applyPageBackground(); // 应用默认背景（可能为空）
        } finally {
            isLoading.value = false;
        }
    }

     /**
     * 切换样式编辑器面板的可见性。
     * @param visible 可选，强制设置可见性
     */
    function toggleStyleCustomizer(visible?: boolean) {
        isStyleCustomizerVisible.value = visible === undefined ? !isStyleCustomizerVisible.value : visible;
        console.log('[AppearanceStore] Style Customizer visibility toggled:', isStyleCustomizerVisible.value);
    }


    /**
     * 更新外观设置 (不包括主题列表管理)
     * @param updates 要更新的设置项
     */
    async function updateAppearanceSettings(updates: UpdateAppearanceDto) {
        try {
            const response = await axios.put<AppearanceSettings>('/api/v1/appearance', updates);
            // 使用后端返回的最新设置更新本地状态
            appearanceSettings.value = response.data;
            console.log('[AppearanceStore] 外观设置已更新:', appearanceSettings.value);
            // 如果 UI 主题或背景更新，重新应用
            if (updates.customUiTheme !== undefined) applyUiTheme(currentUiTheme.value);
            if (updates.pageBackgroundImage !== undefined) applyPageBackground(); // 移除 pageBackgroundOpacity 检查
            // 终端相关设置由 Terminal 组件监听应用

        } catch (err: any) {
            console.error('更新外观设置失败:', err);
            throw new Error(err.response?.data?.message || err.message || '更新外观设置失败');
        }
    }

    /**
     * 保存当前编辑器中的自定义 UI 主题到后端。
     * @param uiTheme UI 主题对象
     */
    async function saveCustomUiTheme(uiTheme: Record<string, string>) {
        await updateAppearanceSettings({ customUiTheme: JSON.stringify(uiTheme) });
    }

    /**
     * 重置为默认 UI 主题并保存。
     */
    async function resetCustomUiTheme() {
        await saveCustomUiTheme(defaultUiTheme);
    }

     /**
     * 设置激活的终端主题
     * @param themeId 主题 ID
     */
    async function setActiveTerminalTheme(themeId: string | null) {
        await updateAppearanceSettings({ activeTerminalThemeId: themeId ?? undefined });
    }

    /**
     * 设置终端字体
     * @param fontFamily 字体列表字符串
     */
    async function setTerminalFontFamily(fontFamily: string) {
        await updateAppearanceSettings({ terminalFontFamily: fontFamily });
    }

    /**
     * 设置终端字体大小
     * @param size 字体大小 (数字)
     */
    async function setTerminalFontSize(size: number) {
        await updateAppearanceSettings({ terminalFontSize: size });
    }

    /**
     * 设置编辑器字体大小
     * @param size 字体大小 (数字)
     */
    async function setEditorFontSize(size: number) {
        await updateAppearanceSettings({ editorFontSize: size });
    }

    // --- 终端主题列表管理 Actions ---

    /**
     * 重新加载终端主题列表
     */
    async function reloadTerminalThemes() {
         try {
            const response = await axios.get<TerminalTheme[]>('/api/v1/terminal-themes');
            availableTerminalThemes.value = response.data;
         } catch (err: any) {
             console.error('重新加载终端主题列表失败:', err);
             // 可以选择抛出错误或显示通知
         }
    }

    /**
     * 创建新的终端主题
     * @param name 主题名称
     * @param themeData 主题数据 (ITheme)
     */
    async function createTerminalTheme(name: string, themeData: ITheme) {
        try {
            await axios.post('/api/v1/terminal-themes', { name, themeData });
            await reloadTerminalThemes(); // 重新加载列表
        } catch (err: any) {
             console.error('创建终端主题失败:', err);
             throw new Error(err.response?.data?.message || err.message || '创建终端主题失败');
        }
    }

    /**
     * 更新终端主题
     * @param id 主题 ID
     * @param name 新名称
     * @param themeData 新主题数据
     */
    async function updateTerminalTheme(id: string, name: string, themeData: ITheme) {
         try {
            await axios.put(`/api/v1/terminal-themes/${id}`, { name, themeData });
            await reloadTerminalThemes(); // 重新加载列表
        } catch (err: any) {
             console.error('更新终端主题失败:', err);
             throw new Error(err.response?.data?.message || err.message || '更新终端主题失败');
        }
    }

    /**
     * 删除终端主题
     * @param id 主题 ID
     */
    async function deleteTerminalTheme(id: string) {
         try {
            await axios.delete(`/api/v1/terminal-themes/${id}`);
            // 如果删除的是当前激活的主题，则切换回默认
            if (activeTerminalThemeId.value === id) {
                await setActiveTerminalTheme(null); // 或者设置为默认主题的 ID
            }
            await reloadTerminalThemes(); // 重新加载列表
        } catch (err: any) {
             console.error('删除终端主题失败:', err);
             throw new Error(err.response?.data?.message || err.message || '删除终端主题失败');
        }
    }

    /**
     * 导入终端主题文件
     * @param file File 对象
     * @param name 可选，如果提供则覆盖文件名作为主题名
     */
    async function importTerminalTheme(file: File, name?: string) {
        const formData = new FormData();
        formData.append('themeFile', file);
        if (name) {
            formData.append('name', name);
        }
        try {
            await axios.post('/api/v1/terminal-themes/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await reloadTerminalThemes();
        } catch (err: any) {
            console.error('导入终端主题失败:', err);
            throw new Error(err.response?.data?.message || err.message || '导入终端主题失败');
        }
    }

    /**
     * 导出终端主题文件
     * @param id 主题 ID
     */
    async function exportTerminalTheme(id: string) {
        try {
            const response = await axios.get(`/api/v1/terminal-themes/${id}/export`, {
                responseType: 'blob' // 重要：接收二进制数据
            });
            // 从响应头获取文件名
            const contentDisposition = response.headers['content-disposition'];
            let filename = `terminal_theme_${id}.json`; // 默认文件名
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }
            // 创建下载链接并触发下载
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
             console.error('导出终端主题失败:', err);
             throw new Error(err.response?.data?.message || err.message || '导出终端主题失败');
        }
    }

    // --- 背景图片 Actions ---
    /**
     * 上传页面背景图片
     * @param file File 对象
     */
    async function uploadPageBackground(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('pageBackgroundFile', file);
        try {
            const response = await axios.post<{ filePath: string }>('/api/v1/appearance/background/page', formData, {
                 headers: { 'Content-Type': 'multipart/form-data' }
            });
            // 更新本地状态 (虽然 updateAppearanceSettings 也会做，但这里立即反映)
            appearanceSettings.value.pageBackgroundImage = response.data.filePath;
            applyPageBackground(); // 应用新背景
            return response.data.filePath;
        } catch (err: any) {
            console.error('上传页面背景失败:', err);
            throw new Error(err.response?.data?.message || err.message || '上传页面背景失败');
        }
    }
     /**
     * 上传终端背景图片
     * @param file File 对象
     */
    async function uploadTerminalBackground(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('terminalBackgroundFile', file);
        try {
            const response = await axios.post<{ filePath: string }>('/api/v1/appearance/background/terminal', formData, {
                 headers: { 'Content-Type': 'multipart/form-data' }
            });
            appearanceSettings.value.terminalBackgroundImage = response.data.filePath;
            // 终端背景的应用由 Terminal 组件处理
            return response.data.filePath;
        } catch (err: any) {
            console.error('上传终端背景失败:', err);
            throw new Error(err.response?.data?.message || err.message || '上传终端背景失败');
        }
    }

    /**
     * 移除页面背景
     */
    async function removePageBackground() {
        await updateAppearanceSettings({ pageBackgroundImage: '' }); // 设置为空字符串或其他表示移除的值
    }

    /**
     * 移除终端背景
     */
    async function removeTerminalBackground() {
        await updateAppearanceSettings({ terminalBackgroundImage: '' });
    }


    // --- Helper Functions ---
    /**
     * 将 UI 主题 (CSS 变量) 应用到文档根元素。
     * @param theme 要应用的 UI 主题对象。
     */
    function applyUiTheme(theme: Record<string, string>) {
        const root = document.documentElement;
        // 先移除可能存在的旧变量（可选，但更干净）
        // Object.keys(defaultUiTheme).forEach(key => root.style.removeProperty(key));
        // 应用新变量
        for (const [key, value] of Object.entries(theme)) {
            root.style.setProperty(key, value);
        }
        console.log('[AppearanceStore] UI 主题已应用:', theme);
    }

    /**
     * 应用页面背景设置到 body 元素
     */
    function applyPageBackground() {
        const body = document.body;
        if (pageBackgroundImage.value) {
            // --- 修改开始：使用 URL 构造函数改进 URL 拼接 ---
            const backendUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin; // 如果未设置 VITE_API_BASE_URL，则回退到当前页面源
            const imagePath = pageBackgroundImage.value;
            console.log(`[AppearanceStore applyPageBackground] Base URL: "${backendUrl}", Image Path: "${imagePath}"`);

            let fullImageUrl = '';
            try {
                // 假设 imagePath 是相对于后端根目录的路径 (例如 /uploads/image.jpg)
                // 使用 URL 构造函数确保路径正确拼接
                const baseUrl = new URL(backendUrl);
                // 确保 imagePath 是以 / 开头，如果不是则添加
                const correctedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
                fullImageUrl = new URL(correctedPath, baseUrl).href;
                console.log(`[AppearanceStore applyPageBackground] Constructed Full Image URL: "${fullImageUrl}"`);
            } catch (e) {
                console.error(`[AppearanceStore applyPageBackground] Error constructing image URL:`, e);
                // URL 构建失败，清除背景并退出
                body.style.backgroundImage = 'none';
                return; // 停止执行
            }
            // --- 修改结束 ---

            // 应用背景图片
            // 先设置为空，强制浏览器重新请求（可能有助于避免缓存问题）
            body.style.backgroundImage = 'none';
            // 使用 nextTick 确保 DOM 更新后再设置背景
            nextTick(() => {
                // 再次检查 fullImageUrl 是否有效
                if (fullImageUrl) {
                    body.style.backgroundImage = `url(${fullImageUrl})`;
                    body.style.backgroundSize = 'cover'; // 覆盖整个区域
                    body.style.backgroundPosition = 'center'; // 居中显示
                    body.style.backgroundRepeat = 'no-repeat'; // 不重复
                    body.style.backgroundAttachment = 'fixed'; // 背景固定，不随滚动条滚动 (可选)
                    console.log(`[AppearanceStore applyPageBackground] Applied background image: ${fullImageUrl}`);
                } else {
                     console.warn(`[AppearanceStore applyPageBackground] Skipping background application due to invalid URL.`);
                     body.style.backgroundImage = 'none'; // 确保清除
                }
            });
        } else {
            // 如果没有设置背景图片，则清除背景
            body.style.backgroundImage = 'none';
            console.log(`[AppearanceStore applyPageBackground] Cleared background image.`);
        }
         // 注意：直接设置 body 透明度会影响所有子元素，通常不建议。
         // 如果需要背景透明效果，通常结合伪元素或额外 div 实现。
         // 这里暂时不直接应用 pageBackgroundOpacity 到 body。
        console.log('[AppearanceStore] 页面背景已应用:', pageBackgroundImage.value);
    }

    // --- Watchers ---
    // 监听 UI 主题变化并应用
    watch(currentUiTheme, (newTheme) => {
        applyUiTheme(newTheme);
    }, { deep: true });

    // 监听页面背景变化并应用
    watch(pageBackgroundImage, () => { // 只监听图片变化
        applyPageBackground();
    });


    return {
        isLoading,
        error,
        // State refs (原始数据)
        appearanceSettings,
        availableTerminalThemes,
        // Computed Getters
        currentUiTheme,
        activeTerminalThemeId,
        currentTerminalTheme,
        currentTerminalFontFamily,
        currentTerminalFontSize,
        currentEditorFontSize, // <-- 新增
        pageBackgroundImage,
        // pageBackgroundOpacity, // Removed
        terminalBackgroundImage,
        // terminalBackgroundOpacity, // Removed
        // Actions
        loadInitialAppearanceData,
        updateAppearanceSettings,
        saveCustomUiTheme,
        resetCustomUiTheme,
        setActiveTerminalTheme,
        setTerminalFontFamily,
        setTerminalFontSize,
        setEditorFontSize, // <-- 新增
        reloadTerminalThemes,
        createTerminalTheme,
        updateTerminalTheme,
        deleteTerminalTheme,
        importTerminalTheme,
        exportTerminalTheme,
        uploadPageBackground,
        uploadTerminalBackground,
        // setPageBackgroundOpacity, // Removed
        // setTerminalBackgroundOpacity, // Removed
        removePageBackground,
        removeTerminalBackground,
        // Visibility control
        isStyleCustomizerVisible,
        toggleStyleCustomizer,
    };
});
