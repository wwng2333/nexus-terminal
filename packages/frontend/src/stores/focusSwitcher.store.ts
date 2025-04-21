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
  focusAction: () => boolean | Promise<boolean>;
  // shortcut?: string; // --- 从基础接口移除快捷键，因为它只在配置中相关 ---
}

// +++ 新增：定义包含快捷键的完整配置项接口 (用于 Store 内部和配置器) +++
export interface ConfiguredFocusableInput extends FocusableInput {
  shortcut?: string; // 快捷键是可选的
}

// 定义存储在后端的配置项接口 (仅 ID 和 shortcut)
export interface ConfigurableFocusableItem {
  id: string;
  shortcut?: string; // 快捷键是可选的
}

// 定义 Store 的 State 接口 (可选但推荐)
interface FocusSwitcherState {
  availableInputs: FocusableInput[]; // 保持不变，定义所有可用项及其基础信息
  // configuredSequence: string[]; // --- 移除旧的状态 ---
  configuredItems: ConfigurableFocusableItem[]; // +++ 新增：存储已配置项的 ID 和快捷键 +++
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
  // const configuredSequence = ref<string[]>([]); // --- 移除旧的状态 ref ---
  const configuredItems = ref<ConfigurableFocusableItem[]>([]); // +++ 新增：存储配置项的状态 ref +++
  const isConfiguratorVisible = ref(false);
  const activateFileManagerSearchTrigger = ref(0);
  const activateTerminalSearchTrigger = ref(0);

  // 新增：存储自定义聚焦动作
  const focusActions = ref<Record<string, () => boolean | Promise<boolean>>>({});

  // --- Actions ---

  // +++ 修改：从后端加载配置（包括快捷键） +++
  async function loadConfigurationFromBackend() { // 重命名以反映加载的是完整配置
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // 假设 API 端点不变
    console.log(`[FocusSwitcherStore] Attempting to load configuration (sequence & shortcuts) from backend via: ${apiUrl}`);
    try {
      const response = await fetch(apiUrl);
      console.log(`[FocusSwitcherStore] Received response from ${apiUrl}. Status: ${response.status}`);

      if (!response.ok) {
        console.error(`[FocusSwitcherStore] HTTP error from ${apiUrl}. Status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // *** 假设后端返回 ConfigurableFocusableItem[] 结构 ***
      const loadedConfig = await response.json();
      console.log(`[FocusSwitcherStore] Raw JSON received from backend:`, JSON.stringify(loadedConfig));

      // --- 验证和过滤 ---
      if (Array.isArray(loadedConfig) && loadedConfig.every(item => typeof item?.id === 'string')) {
        console.log('[FocusSwitcherStore] Configuration format seems valid (array of objects with id). Filtering against available inputs...');
        const availableIds = new Set(availableInputs.value.map(input => input.id));
        const filteredConfig: ConfigurableFocusableItem[] = loadedConfig
          .filter((item: any) => {
            const isValid = availableIds.has(item.id);
            if (!isValid) {
              console.warn(`[FocusSwitcherStore] Filtered out invalid ID during load: ${item.id}`);
            }
            return isValid;
          })
          .map((item: any) => ({ // 确保只保留 id 和 shortcut
            id: item.id,
            shortcut: typeof item.shortcut === 'string' && item.shortcut.startsWith('Alt+') ? item.shortcut : undefined // 验证快捷键格式
          }));

        configuredItems.value = filteredConfig;
        console.log('[FocusSwitcherStore] Successfully loaded and set configuredItems:', JSON.stringify(configuredItems.value));
      } else {
         // --- 处理旧格式 (仅 ID 数组) 或无效格式 ---
         if (Array.isArray(loadedConfig) && loadedConfig.every(item => typeof item === 'string')) {
            console.warn('[FocusSwitcherStore] Received old format (string array) from backend. Converting to new structure without shortcuts.');
            const availableIds = new Set(availableInputs.value.map(input => input.id));
            const filteredSequence = loadedConfig.filter((id: string) => availableIds.has(id));
            configuredItems.value = filteredSequence.map(id => ({ id })); // 转换为新结构，无快捷键
            console.log('[FocusSwitcherStore] Converted old format to configuredItems:', JSON.stringify(configuredItems.value));
            // 可以考虑触发一次保存，将转换后的新格式存回后端
            // saveSequenceToBackend();
         } else {
            console.error('[FocusSwitcherStore] Invalid configuration format received from backend:', loadedConfig);
            configuredItems.value = []; // 使用空数组作为回退
            console.log('[FocusSwitcherStore] Set configuredItems to empty array due to invalid format.');
         }
      }
    } catch (error) {
      console.error(`[FocusSwitcherStore] Failed to load or parse configuration from backend (${apiUrl}):`, error);
      configuredItems.value = [];
      console.log('[FocusSwitcherStore] Set configuredItems to empty array due to loading error.');
    }
  }

  // +++ 修改：保存配置到后端（包括快捷键） +++
  async function saveConfigurationToBackend() { // 重命名以反映保存的是完整配置
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // 假设 API 端点不变
    console.log(`[FocusSwitcherStore] Attempting to save configuration (sequence & shortcuts) to backend via PUT: ${apiUrl}`);
    try {
      // *** 构造后端期望的请求体：{ sequence: string[] } ***
      const sequenceIds = configuredItems.value.map(item => item.id);
      const requestBody = { sequence: sequenceIds };
      console.log('[FocusSwitcherStore] Configuration data to save (backend format):', JSON.stringify(requestBody));
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // Auth headers if needed
        },
        body: JSON.stringify(requestBody), // *** 发送符合后端格式的请求体 ***
      });
      console.log(`[FocusSwitcherStore] Received response from PUT ${apiUrl}. Status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[FocusSwitcherStore] Save failed. Status: ${response.status}, Error data:`, errorData);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('[FocusSwitcherStore] Configuration successfully saved to backend. Response message:', result.message);
    } catch (error) {
      console.error(`[FocusSwitcherStore] Failed to save configuration to backend (${apiUrl}):`, error);
      // Notify user of failure
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

  // +++ 修改：更新配置（包括顺序和快捷键） +++
  function updateConfiguration(newConfig: ConfigurableFocusableItem[]) { // 重命名并修改参数类型
    console.log('[FocusSwitcherStore] updateConfiguration called with new configuration:', JSON.stringify(newConfig));
    const availableIds = new Set(availableInputs.value.map(input => input.id));

    // 过滤掉无效的 ID，并验证/清理快捷键
    const filteredConfig = newConfig
        .filter(item => availableIds.has(item.id))
        .map(item => ({
            id: item.id,
            shortcut: typeof item.shortcut === 'string' && item.shortcut.startsWith('Alt+') ? item.shortcut : undefined
        }));

    configuredItems.value = filteredConfig;
    console.log('[FocusSwitcherStore] configuredItems updated locally to:', JSON.stringify(configuredItems.value));
    // 更新后立即保存到后端
    saveConfigurationToBackend(); // 调用重命名后的保存函数
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

  // --- 修改 Getters ---
  // +++ 修改：获取完整的已配置输入框信息（合并快捷键）+++
  // 返回类型现在包含 shortcut，所以需要调整或确认 FocusableInput 定义
  const getConfiguredInputs = computed((): ConfiguredFocusableInput[] => { // +++ 更新返回类型 +++
    const inputsMap = new Map(availableInputs.value.map(input => [input.id, input]));
    return configuredItems.value
      .map(item => {
        const baseInput = inputsMap.get(item.id);
        if (!baseInput) return undefined;
        // 创建一个新对象，类型为 ConfiguredFocusableInput
        const configuredInput: ConfiguredFocusableInput = { // +++ 使用新类型 +++
            ...baseInput,
            shortcut: item.shortcut,
        };
        return configuredInput;
      })
      .filter((input): input is ConfiguredFocusableInput => input !== undefined); // +++ 更新类型断言 +++
  });

  // +++ 修改：获取配置器中“可用”的输入框列表 +++
  const getAvailableInputsForConfigurator = computed((): FocusableInput[] => {
    const configuredIds = new Set(configuredItems.value.map(item => item.id));
    // 返回尚未配置的基础输入框信息（不需要快捷键）
    return availableInputs.value.filter(input => !configuredIds.has(input.id));
  });

  // +++ 修改：获取序列中的下一个聚焦目标 ID +++
  function getNextFocusTargetId(currentFocusedId: string | null): string | null {
    if (configuredItems.value.length === 0) {
      return null;
    }
    if (currentFocusedId === null) {
      return configuredItems.value[0].id; // 返回第一个配置项的 ID
    }
    const currentIndex = configuredItems.value.findIndex(item => item.id === currentFocusedId);
    if (currentIndex === -1) {
      return configuredItems.value[0].id; // 如果当前 ID 不在配置中，返回第一个
    }
    const nextIndex = (currentIndex + 1) % configuredItems.value.length;
    return configuredItems.value[nextIndex].id; // 返回下一个配置项的 ID
  }

  // +++ 新增：根据快捷键获取目标 ID +++
  function getFocusTargetIdByShortcut(shortcut: string): string | null {
      const foundItem = configuredItems.value.find(item => item.shortcut === shortcut);
      return foundItem?.id ?? null;
  }


  // --- Initialization ---
  // Store 创建时自动从后端加载配置
  console.log('[FocusSwitcherStore] Initializing store and scheduling loadConfigurationFromBackend...'); // 使用新名称
  nextTick(() => {
    console.log('[FocusSwitcherStore] nextTick triggered, calling loadConfigurationFromBackend.'); // 使用新名称
    loadConfigurationFromBackend(); // 调用重命名后的加载函数
  });

  return {
    // State
    availableInputs,
    // configuredSequence, // --- 移除 ---
    configuredItems, // +++ 暴露新状态 +++
    isConfiguratorVisible,
    activateFileManagerSearchTrigger,
    activateTerminalSearchTrigger,
    // Actions
    toggleConfigurator,
    triggerFileManagerSearchActivation,
    triggerTerminalSearchActivation,
    loadConfigurationFromBackend, // +++ 使用新名称 +++
    saveConfigurationToBackend, // +++ 使用新名称 +++
    updateConfiguration, // +++ 使用新名称 +++
    // Getters / Methods
    getConfiguredInputs, // 已修改
    getAvailableInputsForConfigurator, // 已修改
    getNextFocusTargetId, // 已修改
    getFocusTargetIdByShortcut, // +++ 新增 +++
    registerFocusAction,
    unregisterFocusAction,
    focusTarget,
  };
});