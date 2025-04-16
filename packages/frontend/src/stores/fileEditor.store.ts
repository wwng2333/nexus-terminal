import { ref, computed, readonly } from 'vue';
import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from './session.store'; // 导入会话 Store
import type { EditorFileContent, SaveStatus } from '../types/sftp.types';

// 辅助函数：根据文件名获取语言 (从 useFileEditor.ts 迁移)
const getLanguageFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    // (保持 switch case 不变)
    switch (extension) {
        case 'js': return 'javascript';
        case 'ts': return 'typescript';
        case 'json': return 'json';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'scss': return 'scss';
        case 'less': return 'less';
        case 'py': return 'python';
        case 'java': return 'java';
        case 'c': return 'c';
        case 'cpp': return 'cpp';
        case 'cs': return 'csharp';
        case 'go': return 'go';
        case 'php': return 'php';
        case 'rb': return 'ruby';
        case 'rs': return 'rust';
        case 'sql': return 'sql';
        case 'sh': return 'shell';
        case 'yaml': case 'yml': return 'yaml';
        case 'md': return 'markdown';
        case 'xml': return 'xml';
        case 'ini': return 'ini';
        case 'bat': return 'bat';
        case 'dockerfile': return 'dockerfile';
        default: return 'plaintext';
    }
};


export const useFileEditorStore = defineStore('fileEditor', () => {
    const { t } = useI18n();
    const sessionStore = useSessionStore();

    // --- 编辑器状态 ---
    const isVisible = ref(false);
    const currentSessionId = ref<string | null>(null); // 需要知道文件属于哪个会话
    const filePath = ref<string | null>(null);
    const fileContent = ref<string>(''); // 用于 v-model 绑定
    const fileLanguage = ref<string>('plaintext');
    const fileEncoding = ref<'utf8' | 'base64'>('utf8'); // 文件内容的原始编码
    const isLoading = ref<boolean>(false);
    const loadingError = ref<string | null>(null);
    const isSaving = ref<boolean>(false);
    const saveStatus = ref<SaveStatus>('idle');
    const saveError = ref<string | null>(null);

    // --- 计算属性 ---
    const editorProps = computed(() => ({
        isVisible: isVisible.value,
        filePath: filePath.value,
        language: fileLanguage.value,
        isLoading: isLoading.value,
        loadingError: loadingError.value,
        isSaving: isSaving.value,
        saveStatus: saveStatus.value,
        saveError: saveError.value,
        // modelValue is handled separately via direct ref binding
    }));

    // --- 核心方法 ---

    // 获取当前会话的 SFTP 管理器
    const getSftpManager = (sessionId: string | null) => {
        if (!sessionId) return null;
        const session = sessionStore.sessions.get(sessionId);
        return session?.sftpManager ?? null;
    };

    const openFile = async (targetFilePath: string, sessionId: string) => {
        console.log(`[文件编辑器 Store] 尝试打开文件: ${targetFilePath} (会话: ${sessionId})`);
        if (!targetFilePath || !sessionId) return;

        // // 如果已经是同一个文件，则不重新加载（除非需要强制刷新）
        // if (filePath.value === targetFilePath && isVisible.value) {
        //     console.log(`[文件编辑器 Store] 文件 ${targetFilePath} 已在编辑器中打开。`);
        //     return;
        // }

        const sftpManager = getSftpManager(sessionId);
        if (!sftpManager) {
            console.error(`[文件编辑器 Store] 无法找到会话 ${sessionId} 的 SFTP 管理器。`);
            // 可以设置一个错误状态或通知用户
            loadingError.value = t('fileManager.errors.sftpManagerNotFound');
            isVisible.value = true; // 仍然显示编辑器以展示错误
            return;
        }

        isVisible.value = true; // 显示编辑器区域
        isLoading.value = true; // 显示加载状态
        loadingError.value = null;
        saveStatus.value = 'idle'; // 重置保存状态
        saveError.value = null;
        filePath.value = targetFilePath;
        currentSessionId.value = sessionId; // 记录当前会话 ID
        fileLanguage.value = getLanguageFromFilename(targetFilePath);
        fileContent.value = ''; // 清空旧内容

        try {
            // 使用从 sessionStore 获取的 sftpManager 的 readFile 方法
            const fileData = await sftpManager.readFile(targetFilePath);
            console.log(`[文件编辑器 Store] 文件 ${targetFilePath} 读取成功。编码: ${fileData.encoding}`);

            // 处理可能的 Base64 编码
            if (fileData.encoding === 'base64') {
                try {
                    // 1. Decode Base64 to raw bytes string
                    const binaryString = atob(fileData.content);
                    // 2. Convert binary string to Uint8Array
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    // 3. Decode bytes as UTF-8
                    const decoder = new TextDecoder('utf-8'); // 显式使用 UTF-8
                    fileContent.value = decoder.decode(bytes);
                    fileEncoding.value = 'base64'; // 记录原始编码是 Base64
                    console.log(`[文件编辑器 Store] Base64 文件 ${targetFilePath} 已解码为 UTF-8。`);
                } catch (decodeError) {
                    console.error(`[文件编辑器 Store] Base64 或 UTF-8 解码错误 for ${targetFilePath}:`, decodeError);
                    loadingError.value = t('fileManager.errors.fileDecodeError');
                    // Fallback: Show raw base64 content if decoding fails
                    fileContent.value = `// ${t('fileManager.errors.fileDecodeError')}\n// Original Base64 content:\n${fileData.content}`;
                }
            } else {
                // 假设非 Base64 内容是 UTF-8 字符串
                fileContent.value = fileData.content;
                // 在这个 else 分支中，编码不是 base64，我们假定它是 utf8
                fileEncoding.value = 'utf8';
                console.log(`[文件编辑器 Store] 文件 ${targetFilePath} 已按 ${fileEncoding.value} 处理。`);
                // 添加检查：如果内容看起来像乱码，可以加日志
                if (fileContent.value.includes('\uFFFD')) { // '\uFFFD' () 是无效序列的替换字符
                    console.warn(`[文件编辑器 Store] 文件 ${targetFilePath} 内容可能包含无效字符，原始编码可能不是 UTF-8。`);
                }
            }
            isLoading.value = false;
        } catch (err: any) {
            console.error(`[文件编辑器 Store] 读取文件 ${targetFilePath} 失败:`, err);
            loadingError.value = `${t('fileManager.errors.readFileFailed')}: ${err.message || err}`;
            fileContent.value = `// ${loadingError.value}`; // 在编辑器中显示错误
            isLoading.value = false;
        }
    };

    const saveFile = async () => {
        if (!filePath.value || !currentSessionId.value || isSaving.value || isLoading.value || loadingError.value) {
            console.warn('[文件编辑器 Store] 保存条件不满足，无法保存。', {
                path: filePath.value,
                sessionId: currentSessionId.value,
                isSaving: isSaving.value,
                isLoading: isLoading.value,
                hasError: !!loadingError.value
            });
            return;
        }

        const sftpManager = getSftpManager(currentSessionId.value);
        if (!sftpManager) {
            console.error(`[文件编辑器 Store] 保存失败：无法找到会话 ${currentSessionId.value} 的 SFTP 管理器。`);
            saveStatus.value = 'error';
            saveError.value = t('fileManager.errors.sftpManagerNotFound');
            return;
        }

        console.log(`[文件编辑器 Store] 开始保存文件: ${filePath.value} (会话: ${currentSessionId.value})`);
        isSaving.value = true;
        saveStatus.value = 'saving';
        saveError.value = null;

        const contentToSave = fileContent.value; // 获取当前编辑器内容

        try {
            // 使用从 sessionStore 获取的 sftpManager 的 writeFile 方法
            await sftpManager.writeFile(filePath.value, contentToSave);
            console.log(`[文件编辑器 Store] 文件 ${filePath.value} 保存成功。`);
            isSaving.value = false;
            saveStatus.value = 'success';
            saveError.value = null;

            // 成功提示短暂显示后消失
            setTimeout(() => {
                if (saveStatus.value === 'success') {
                    saveStatus.value = 'idle';
                }
            }, 2000);

        } catch (err: any) {
            console.error(`[文件编辑器 Store] 保存文件 ${filePath.value} 失败:`, err);
            isSaving.value = false;
            saveStatus.value = 'error';
            saveError.value = `${t('fileManager.errors.saveFailed')}: ${err.message || err}`;

            // 错误提示显示时间长一些
            setTimeout(() => {
                if (saveStatus.value === 'error') {
                    saveStatus.value = 'idle';
                    saveError.value = null;
                }
            }, 5000);
        }
    };

    const closeEditor = () => {
        console.log('[文件编辑器 Store] 关闭编辑器。');
        isVisible.value = false;
        filePath.value = null;
        currentSessionId.value = null;
        fileContent.value = '';
        loadingError.value = null;
        isLoading.value = false;
        saveStatus.value = 'idle';
        saveError.value = null;
        isSaving.value = false;
    };

    // 提供一个方法来更新内容，主要用于 v-model
    const updateContent = (newContent: string) => {
        fileContent.value = newContent;
        // 当用户编辑时，可以重置保存状态（如果需要）
        if (saveStatus.value === 'success' || saveStatus.value === 'error') {
            saveStatus.value = 'idle';
            saveError.value = null;
        }
    };

    return {
        // 状态 (只读的 ref 或计算属性)
        isVisible: readonly(isVisible),
        filePath: readonly(filePath),
        fileLanguage: readonly(fileLanguage),
        isLoading: readonly(isLoading),
        loadingError: readonly(loadingError),
        isSaving: readonly(isSaving),
        saveStatus: readonly(saveStatus),
        saveError: readonly(saveError),
        editorProps, // 提供一个包含多个只读状态的对象，方便绑定

        // 可写状态 (用于 v-model)
        fileContent, // 直接暴露 ref 用于 v-model

        // 方法
        openFile,
        saveFile,
        closeEditor,
        updateContent, // 如果需要从外部更新内容
    };
});
