import { defineStore } from 'pinia';
import { ref, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
// 假设有一个 API 客户端或辅助函数，这里我们直接使用 fetch
// import apiClient from '@/services/api';

// 基础输入框接口 (保持不变)
export interface FocusableInput {
  id: string;
  label: string;
  focusAction: () => boolean | Promise<boolean>;
}

// --- 移除 ConfiguredFocusableInput ---

// 单个项目配置接口 (主要用于快捷键)
export interface FocusItemConfig {
  shortcut?: string;
}

// 存储在后端或发送给后端的完整配置结构
export interface FocusSwitcherFullConfig {
  sequence: string[]; // 顺序切换的 ID 列表
  shortcuts: Record<string, FocusItemConfig>; // 所有项目的快捷键配置 (id -> config)
}

// --- 移除 ConfigurableFocusableItem ---

// Store State 接口
interface FocusSwitcherState {
  availableInputs: FocusableInput[]; // 所有可用项的基础信息
  sequenceOrder: string[]; // 顺序切换的 ID 列表
  itemConfigs: Record<string, FocusItemConfig>; // 所有项目的配置 (id -> config)
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
  const sequenceOrder = ref<string[]>([]); // +++ 新增：存储顺序 +++
  const itemConfigs = ref<Record<string, FocusItemConfig>>({}); // +++ 新增：存储所有配置 +++
  const isConfiguratorVisible = ref(false);
  const activateFileManagerSearchTrigger = ref(0);
  const activateTerminalSearchTrigger = ref(0);

  // 新增：存储自定义聚焦动作
  const focusActions = ref<Record<string, () => boolean | Promise<boolean>>>({});

  // --- Actions ---

  // +++ 修改：从后端加载配置（包括快捷键） +++
  async function loadConfigurationFromBackend() {
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // 假设 API 端点不变，但返回结构改变
    console.log(`[FocusSwitcherStore] Attempting to load full configuration (sequence & shortcuts) from backend via: ${apiUrl}`);
    try {
      const response = await fetch(apiUrl);
      console.log(`[FocusSwitcherStore] Received response from ${apiUrl}. Status: ${response.status}`);

      if (!response.ok) {
        console.error(`[FocusSwitcherStore] HTTP error from ${apiUrl}. Status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // *** 假设后端返回 FocusSwitcherFullConfig 结构 ***
      const loadedFullConfig: FocusSwitcherFullConfig = await response.json();
      console.log(`[FocusSwitcherStore] Raw JSON received from backend:`, JSON.stringify(loadedFullConfig));

      // --- 验证和设置 ---
      const availableIds = new Set(availableInputs.value.map(input => input.id));

      // 验证 sequence
      if (Array.isArray(loadedFullConfig?.sequence) && loadedFullConfig.sequence.every(id => typeof id === 'string' && availableIds.has(id))) {
        sequenceOrder.value = loadedFullConfig.sequence;
        console.log('[FocusSwitcherStore] Successfully loaded and set sequenceOrder:', JSON.stringify(sequenceOrder.value));
      } else {
        console.warn('[FocusSwitcherStore] Invalid or missing sequence in loaded config. Resetting to empty array.');
        sequenceOrder.value = [];
      }

      // 验证 shortcuts (itemConfigs)
      if (typeof loadedFullConfig?.shortcuts === 'object' && loadedFullConfig.shortcuts !== null) {
        const validConfigs: Record<string, FocusItemConfig> = {};
        for (const id in loadedFullConfig.shortcuts) {
          if (availableIds.has(id)) { // 只保留有效的 ID
            const config = loadedFullConfig.shortcuts[id];
            if (typeof config === 'object' && config !== null && (config.shortcut === undefined || (typeof config.shortcut === 'string' && config.shortcut.startsWith('Alt+')))) {
              validConfigs[id] = { shortcut: config.shortcut }; // 只保留 shortcut
            } else {
               console.warn(`[FocusSwitcherStore] Invalid shortcut config for ID ${id}. Ignoring shortcut.`);
               validConfigs[id] = {}; // 保留 ID 但清空无效快捷键
            }
          } else {
             console.warn(`[FocusSwitcherStore] Ignoring shortcut config for unknown ID: ${id}`);
          }
        }
        itemConfigs.value = validConfigs;
        console.log('[FocusSwitcherStore] Successfully loaded and set itemConfigs:', JSON.stringify(itemConfigs.value));
      } else {
        console.warn('[FocusSwitcherStore] Invalid or missing shortcuts in loaded config. Resetting to empty object.');
        itemConfigs.value = {};
      }

    } catch (error) {
      console.error(`[FocusSwitcherStore] Failed to load or parse configuration from backend (${apiUrl}):`, error);
      sequenceOrder.value = [];
      itemConfigs.value = {};
      console.log('[FocusSwitcherStore] Reset sequenceOrder and itemConfigs due to loading error.');
    }
  }

  async function saveConfigurationToBackend() {
    const apiUrl = '/api/v1/settings/focus-switcher-sequence'; // 假设 API 端点不变，但接受结构改变
    console.log(`[FocusSwitcherStore] Attempting to save full configuration (sequence & shortcuts) to backend via PUT: ${apiUrl}`);
    try {
      // *** 构造 FocusSwitcherFullConfig 结构发送给后端 ***
      const configToSave: FocusSwitcherFullConfig = {
        sequence: sequenceOrder.value,
        shortcuts: itemConfigs.value,
      };
      console.log('[FocusSwitcherStore] Full configuration data to save:', JSON.stringify(configToSave));
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // Auth headers if needed
        },
        body: JSON.stringify(configToSave), // *** 发送包含 sequence 和 shortcuts 的对象 ***
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

  // +++ 修改：更新完整配置（包括顺序和所有快捷键） +++
  function updateConfiguration(newFullConfig: FocusSwitcherFullConfig) {
    console.log('[FocusSwitcherStore] updateConfiguration called with new full configuration:', JSON.stringify(newFullConfig));
    const availableIds = new Set(availableInputs.value.map(input => input.id));

    // 更新 sequenceOrder (过滤无效 ID)
    if (Array.isArray(newFullConfig?.sequence)) {
      sequenceOrder.value = newFullConfig.sequence.filter(id => availableIds.has(id));
      console.log('[FocusSwitcherStore] sequenceOrder updated locally to:', JSON.stringify(sequenceOrder.value));
    } else {
       console.warn('[FocusSwitcherStore] Invalid sequence provided in updateConfiguration. Keeping existing sequence.');
    }

    // 更新 itemConfigs (过滤无效 ID 和快捷键)
    if (typeof newFullConfig?.shortcuts === 'object' && newFullConfig.shortcuts !== null) {
        const validConfigs: Record<string, FocusItemConfig> = {};
        for (const id in newFullConfig.shortcuts) {
          if (availableIds.has(id)) {
            const config = newFullConfig.shortcuts[id];
             if (typeof config === 'object' && config !== null && (config.shortcut === undefined || (typeof config.shortcut === 'string' && config.shortcut.startsWith('Alt+')))) {
               validConfigs[id] = { shortcut: config.shortcut };
             } else {
                validConfigs[id] = {}; // 保留 ID 但清空无效快捷键
             }
          }
        }
        itemConfigs.value = validConfigs;
       console.log('[FocusSwitcherStore] itemConfigs updated locally to:', JSON.stringify(itemConfigs.value));
    } else {
        console.warn('[FocusSwitcherStore] Invalid shortcuts provided in updateConfiguration. Keeping existing configs.');
    }

    // 更新后立即保存到后端
    saveConfigurationToBackend();
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
  // +++ 修改：获取在序列中的输入框信息（包含快捷键）+++
  const getSequenceInputs = computed((): (FocusableInput & FocusItemConfig)[] => {
    const inputsMap = new Map(availableInputs.value.map(input => [input.id, input]));
    const configs = itemConfigs.value;
    // Step 1: Map sequenceOrder to potential objects or undefined
    const mappedInputs = sequenceOrder.value
      .map(id => {
        const baseInput = inputsMap.get(id);
        if (!baseInput) return undefined;
        const config = configs[id] || {};
        // ++ Explicitly create object with the intersection type ++
        const combinedInput: FocusableInput & FocusItemConfig = {
            ...baseInput,
            shortcut: config.shortcut,
        };
        return combinedInput; // Return the correctly typed object
      });

    // Step 2: Filter out any undefined values using the type predicate
    const filteredInputs = mappedInputs.filter(
        (input): input is FocusableInput & FocusItemConfig => input !== undefined
    );

    return filteredInputs; // Return the correctly typed array
  });

  // +++ 修改：获取配置器中“可用”的输入框列表 +++
  // +++ 修改：获取不在序列中的输入框信息（也包含快捷键，因为现在全局管理） +++
  const getAvailableInputsForConfigurator = computed((): (FocusableInput & FocusItemConfig)[] => {
    const sequenceIds = new Set(sequenceOrder.value);
    const configs = itemConfigs.value;
    return availableInputs.value
      .filter(input => !sequenceIds.has(input.id)) // 过滤掉已在序列中的
      .map(input => {
          const config = configs[input.id] || {};
          return {
              ...input,
              shortcut: config.shortcut, // 合并快捷键
          };
      });
  });

  // +++ 修改：获取序列中的下一个聚焦目标 ID +++
  // +++ 修改：根据 sequenceOrder 获取下一个聚焦目标 ID +++
  function getNextFocusTargetId(currentFocusedId: string | null): string | null {
    const order = sequenceOrder.value;
    if (order.length === 0) {
      return null;
    }
    if (currentFocusedId === null) {
      return order[0]; // 返回序列中的第一个 ID
    }
    const currentIndex = order.findIndex(id => id === currentFocusedId);
    if (currentIndex === -1) {
      return order[0]; // 如果当前 ID 不在序列中，返回第一个
    }
    const nextIndex = (currentIndex + 1) % order.length;
    return order[nextIndex]; // 返回序列中的下一个 ID
  }

  // +++ 新增：根据快捷键获取目标 ID +++
  // +++ 修改：根据 itemConfigs 获取快捷键对应的目标 ID +++
  function getFocusTargetIdByShortcut(shortcut: string): string | null {
      for (const id in itemConfigs.value) {
          if (itemConfigs.value[id]?.shortcut === shortcut) {
              return id;
          }
      }
      return null;
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
    sequenceOrder, // +++ 暴露新状态 +++
    itemConfigs,   // +++ 暴露新状态 +++
    isConfiguratorVisible,
    activateFileManagerSearchTrigger,
    activateTerminalSearchTrigger,
    // Actions
    toggleConfigurator,
    triggerFileManagerSearchActivation,
    triggerTerminalSearchActivation,
    loadConfigurationFromBackend,
    saveConfigurationToBackend,
    updateConfiguration, // 已修改为接收完整配置
    // Getters / Methods
    getSequenceInputs, // +++ 重命名并修改 +++
    getAvailableInputsForConfigurator, // 已修改
    getNextFocusTargetId, // 已修改
    getFocusTargetIdByShortcut, // 已修改
    registerFocusAction,
    unregisterFocusAction,
    focusTarget,
  };
});