import { defineStore } from 'pinia';
import { ref, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
// 假设有一个 API 客户端或辅助函数，这里我们直接使用 fetch
// import apiClient from '@/services/api'; // 理想情况下

// 定义输入框的接口
export interface FocusableInput {
  id: string; // 唯一标识符
  label: string; // 用户友好的名称
  // componentPath 和 selector 不再需要，聚焦完全依赖 focusAction
  focusAction: () => boolean | Promise<boolean>; // 改为必需
}

// 定义 Store 的 State 接口 (可选但推荐)
interface FocusSwitcherState {
  availableInputs: FocusableInput[];
  configuredSequence: string[]; // 只存储 ID 序列
  isConfiguratorVisible: boolean;
  activateFileManagerSearchTrigger: number;
  activateTerminalSearchTrigger: number;
}

// --- 移除 localStorage Key ---
// const LOCAL_STORAGE_KEY = 'focusSwitcherSequence';

export const useFocusSwitcherStore = defineStore('focusSwitcher', () => {
  const { t } = useI18n();

  // --- State ---
  const availableInputs = ref<FocusableInput[]>([
    // 简化定义，移除 componentPath 和 selector，focusAction 将由组件注册
    { id: 'commandHistorySearch', label: t('focusSwitcher.input.commandHistorySearch', '命令历史搜索'), focusAction: () => false },
    { id: 'quickCommandsSearch', label: t('focusSwitcher.input.quickCommandsSearch', '快捷指令搜索'), focusAction: () => false },
    { id: 'fileManagerSearch', label: t('focusSwitcher.input.fileManagerSearch', '文件管理器搜索'), focusAction: () => false },
    { id: 'commandInput', label: t('focusSwitcher.input.commandInput', '命令输入'), focusAction: () => false },
    { id: 'terminalSearch', label: t('focusSwitcher.input.terminalSearch', '终端内搜索'), focusAction: () => false },
    { id: 'connectionListSearch', label: t('focusSwitcher.input.connectionListSearch', '连接列表搜索'), focusAction: () => false },
    { id: 'fileEditorActive', label: t('focusSwitcher.input.fileEditorActive', '文件编辑器'), focusAction: () => false },
  ]);
  const configuredSequence = ref<string[]>([]);
  const isConfiguratorVisible = ref(false);
  const activateFileManagerSearchTrigger = ref(0);
  const activateTerminalSearchTrigger = ref(0);

  // 新增：存储自定义聚焦动作
  const focusActions = ref<Record<string, () => boolean | Promise<boolean>>>({});

  // --- Actions ---

  // +++ 新增：从后端加载配置 +++
  async function loadSequenceFromBackend() {
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // +++ 定义 API URL +++
    console.log(`[FocusSwitcherStore] Attempting to load sequence from backend via: ${apiUrl}`); // +++ 更新日志 +++
    try {
      // 注意：需要根据实际项目配置调整 API 路径和认证处理
      const response = await fetch(apiUrl); // +++ 使用变量 +++
      console.log(`[FocusSwitcherStore] Received response from ${apiUrl}. Status: ${response.status}`); // +++ 添加日志：响应状态 +++

      if (!response.ok) {
        // +++ 添加日志：记录非 OK 状态 +++
        console.error(`[FocusSwitcherStore] HTTP error from ${apiUrl}. Status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const sequence = await response.json();
      // +++ 添加日志：记录原始 JSON 数据 +++
      console.log(`[FocusSwitcherStore] Raw JSON received from backend for sequence:`, JSON.stringify(sequence));

      if (Array.isArray(sequence) && sequence.every(item => typeof item === 'string')) {
        console.log('[FocusSwitcherStore] Sequence format is valid (string array). Filtering against available inputs...'); // +++ 添加日志 +++
        // 验证加载的 ID 是否仍然存在于 availableInputs 中
        const availableIds = new Set(availableInputs.value.map(input => input.id));
        const filteredSequence = sequence.filter((id: string) => {
            const isValid = availableIds.has(id);
            if (!isValid) {
                console.warn(`[FocusSwitcherStore] Filtered out invalid ID during load from backend: ${id}`);
            }
            return isValid;
        });
        configuredSequence.value = filteredSequence;
        // +++ 更新日志：显示最终设置的值 +++
        console.log('[FocusSwitcherStore] Successfully loaded and set configuredSequence:', JSON.stringify(configuredSequence.value));
      } else {
        console.error('[FocusSwitcherStore] Invalid sequence format received from backend:', sequence);
        configuredSequence.value = []; // 使用空数组作为回退
        console.log('[FocusSwitcherStore] Set configuredSequence to empty array due to invalid format.'); // +++ 添加日志 +++
      }
    } catch (error) {
       // +++ 添加日志：记录 fetch 或 JSON 解析错误 +++
      console.error(`[FocusSwitcherStore] Failed to load or parse sequence from backend (${apiUrl}):`, error);
      // 加载失败时可以考虑使用默认值或保持为空
      configuredSequence.value = [];
      console.log('[FocusSwitcherStore] Set configuredSequence to empty array due to loading error.'); // +++ 添加日志 +++
    }
  }

  // +++ 新增：保存配置到后端 +++
  async function saveSequenceToBackend() {
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // +++ 定义 API URL +++
    console.log(`[FocusSwitcherStore] Attempting to save sequence to backend via PUT: ${apiUrl}`); // +++ 更新日志 +++
    try {
      const sequenceToSave = configuredSequence.value;
      console.log('[FocusSwitcherStore] Sequence data to save:', JSON.stringify(sequenceToSave)); // +++ 添加日志 +++
      // 注意：需要根据实际项目配置调整 API 路径和认证处理
      const response = await fetch(apiUrl, { // +++ 使用变量 +++
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // 如果需要认证，添加 Authorization header
          // 'Authorization': `Bearer ${your_token}`
        },
        body: JSON.stringify({ sequence: sequenceToSave }),
      });
      console.log(`[FocusSwitcherStore] Received response from PUT ${apiUrl}. Status: ${response.status}`); // +++ 添加日志 +++

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // 尝试解析错误体
        console.error(`[FocusSwitcherStore] Save failed. Status: ${response.status}, Error data:`, errorData); // +++ 添加日志 +++
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('[FocusSwitcherStore] Configuration successfully saved to backend. Response message:', result.message); // +++ 更新日志 +++
    } catch (error) {
      console.error(`[FocusSwitcherStore] Failed to save sequence to backend (${apiUrl}):`, error); // +++ 更新日志 +++
      // 可以在这里触发 UI 通知用户保存失败
    }
  }


  function triggerTerminalSearchActivation() {
    activateTerminalSearchTrigger.value++;
    console.log('[FocusSwitcherStore] Triggering Terminal search activation.');
  }

  function triggerFileManagerSearchActivation() {
    activateFileManagerSearchTrigger.value++;
    console.log('[FocusSwitcherStore] Triggering FileManager search activation.');
  }

  function toggleConfigurator(visible?: boolean) {
    isConfiguratorVisible.value = visible === undefined ? !isConfiguratorVisible.value : visible;
    console.log(`[FocusSwitcherStore] Configurator visibility set to: ${isConfiguratorVisible.value}`);
  }

  // --- 移除旧的 loadConfiguration ---
  /*
  function loadConfiguration() {
    // ... localStorage logic ...
  }
  */

  // --- 移除旧的 saveConfiguration ---
  /*
  function saveConfiguration() {
    // ... localStorage logic ...
  }
  */

  // 更新切换顺序 (现在也触发保存到后端)
  function updateSequence(newSequence: string[]) {
    console.log('[FocusSwitcherStore] updateSequence called with:', JSON.stringify(newSequence)); // +++ 更新日志 +++
    const availableIds = new Set(availableInputs.value.map(input => input.id));
    const filteredSequence = newSequence.filter(id => availableIds.has(id));
    configuredSequence.value = filteredSequence;
    console.log('[FocusSwitcherStore] configuredSequence updated locally to:', JSON.stringify(configuredSequence.value)); // +++ 更新日志 +++
    // 更新后立即保存到后端
    saveSequenceToBackend();
  }

  // 注册聚焦动作 (现在更新 availableInputs 中的 focusAction)
  function registerFocusAction(id: string, action: () => boolean | Promise<boolean>) {
    const targetInput = availableInputs.value.find(input => input.id === id);
    if (targetInput) {
      targetInput.focusAction = action;
      console.log(`[FocusSwitcherStore] Registered focus action for ID: ${id}`);
    } else {
      console.warn(`[FocusSwitcherStore] Attempted to register focus action for unknown ID: ${id}`);
    }
  }

  // 注销聚焦动作 (重置为默认返回 false 的函数)
  function unregisterFocusAction(id: string) {
     const targetInput = availableInputs.value.find(input => input.id === id);
     if (targetInput) {
       targetInput.focusAction = () => false; // Reset to default non-functional action
       console.log(`[FocusSwitcherStore] Unregistered focus action for ID: ${id}`);
     }
  }

  // 新增：统一的聚焦目标 Action
  async function focusTarget(id: string): Promise<boolean> {
    console.log(`[FocusSwitcherStore] Attempting to focus target ID: ${id}`);
    const targetInput = availableInputs.value.find(input => input.id === id);
    if (targetInput?.focusAction) {
      try {
        const result = await targetInput.focusAction();
        if (result) {
          console.log(`[FocusSwitcherStore] Successfully focused ${id} via action.`);
          return true;
        } else {
          console.log(`[FocusSwitcherStore] Focus action for ${id} returned false.`);
          // 尝试激活搜索框（如果适用）
          if (id === 'fileManagerSearch') {
            triggerFileManagerSearchActivation();
            // 激活后可能需要短暂延迟再尝试聚焦，但这部分逻辑移到 App.vue 或组件内部更合适
          } else if (id === 'terminalSearch') {
            triggerTerminalSearchActivation();
          }
          return false;
        }
      } catch (error) {
        console.error(`[FocusSwitcherStore] Error executing focus action for ${id}:`, error);
        return false;
      }
    } else {
      console.warn(`[FocusSwitcherStore] No focus action registered for ID: ${id}`);
      return false;
    }
  }

  // --- Getters ---
  const getConfiguredInputs = computed((): FocusableInput[] => {
    return configuredSequence.value
      .map(id => availableInputs.value.find(input => input.id === id))
      .filter((input): input is FocusableInput => input !== undefined);
  });

  const getAvailableInputsForConfigurator = computed((): FocusableInput[] => {
    const configuredIds = new Set(configuredSequence.value);
    return availableInputs.value.filter(input => !configuredIds.has(input.id));
  });

  function getNextFocusTargetId(currentFocusedId: string | null): string | null {
    if (configuredSequence.value.length === 0) {
      return null;
    }
    if (currentFocusedId === null) {
      return configuredSequence.value[0];
    }
    const currentIndex = configuredSequence.value.indexOf(currentFocusedId);
    if (currentIndex === -1) {
      return configuredSequence.value[0];
    }
    const nextIndex = (currentIndex + 1) % configuredSequence.value.length;
    return configuredSequence.value[nextIndex];
  }


  // --- Initialization ---
  // Store 创建时自动从后端加载配置
  console.log('[FocusSwitcherStore] Initializing store and scheduling loadSequenceFromBackend...'); // +++ 添加日志 +++
  nextTick(() => {
    console.log('[FocusSwitcherStore] nextTick triggered, calling loadSequenceFromBackend.'); // +++ 添加日志 +++
    loadSequenceFromBackend(); // +++ 调用新的加载函数 +++
  });

  return {
    // State
    availableInputs,
    configuredSequence,
    isConfiguratorVisible,
    activateFileManagerSearchTrigger,
    activateTerminalSearchTrigger,
    // Actions
    toggleConfigurator,
    triggerFileManagerSearchActivation,
    triggerTerminalSearchActivation,
    loadSequenceFromBackend, // +++ 导出新的加载函数 +++
    saveSequenceToBackend, // +++ 导出新的保存函数 +++
    updateSequence,
    // Getters
    getConfiguredInputs,
    getAvailableInputsForConfigurator,
    getNextFocusTargetId,
    registerFocusAction, // 暴露注册方法
    unregisterFocusAction, // 暴露注销方法
    // focusActions 不再需要暴露
    focusTarget, // 暴露新的统一聚焦方法
  };
});