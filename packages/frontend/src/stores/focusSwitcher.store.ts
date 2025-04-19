import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

// 定义输入框的接口
export interface FocusableInput {
  id: string; // 唯一标识符
  label: string; // 用户友好的名称
  // 可以添加其他元数据，例如组件路径或选择器，以便将来查找元素
  componentPath?: string;
  selector?: string;
}

// 定义 Store 的 State 接口 (可选但推荐)
interface FocusSwitcherState {
  availableInputs: FocusableInput[];
  configuredSequence: string[]; // 只存储 ID 序列
  isConfiguratorVisible: boolean; // 新增：控制配置器可见性
}

const LOCAL_STORAGE_KEY = 'focusSwitcherSequence';

export const useFocusSwitcherStore = defineStore('focusSwitcher', () => {
  const { t } = useI18n(); // 在 store setup 中获取 t 函数

  // --- State ---
  // 所有可供配置的输入框列表
  // 注意：label 使用 t() 函数获取初始值
  const availableInputs = ref<FocusableInput[]>([
    { id: 'commandHistorySearch', label: t('focusSwitcher.input.commandHistorySearch', '命令历史搜索'), componentPath: 'CommandHistoryView.vue', selector: 'input[placeholder*="搜索历史记录"]' },
    { id: 'quickCommandsSearch', label: t('focusSwitcher.input.quickCommandsSearch', '快捷指令搜索'), componentPath: 'QuickCommandsView.vue', selector: 'input[placeholder*="搜索名称或指令"]' },
    { id: 'fileManagerSearch', label: t('focusSwitcher.input.fileManagerSearch', '文件管理器搜索'), componentPath: 'FileManager.vue', selector: '.search-input' }, // FileManager 的搜索框 class 是 search-input
    { id: 'commandInput', label: t('focusSwitcher.input.commandInput', '命令输入'), componentPath: 'CommandInputBar.vue', selector: '.command-input' },
    { id: 'terminalSearch', label: t('focusSwitcher.input.terminalSearch', '终端内搜索'), componentPath: 'CommandInputBar.vue', selector: '.search-input' }, // CommandInputBar 的搜索框 class 也是 search-input
    // 注意：CommandInputBar 和 FileManager 都有 .search-input，需要更精确的选择器或逻辑来区分，暂时先这样
  ]);

  // 用户配置的切换顺序 (存储 ID)
  const configuredSequence = ref<string[]>([]);

  // 控制配置弹窗可见性
  const isConfiguratorVisible = ref(false);

  // --- Actions ---
  // 控制配置器显示/隐藏
  function toggleConfigurator(visible?: boolean) {
    isConfiguratorVisible.value = visible === undefined ? !isConfiguratorVisible.value : visible;
    console.log(`[FocusSwitcherStore] Configurator visibility set to: ${isConfiguratorVisible.value}`);
  }

  // 从 localStorage 加载配置
  function loadConfiguration() {
    const savedSequence = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedSequence) {
      try {
        const parsedSequence = JSON.parse(savedSequence);
        // 验证加载的 ID 是否仍然存在于 availableInputs 中
        configuredSequence.value = parsedSequence.filter((id: string) =>
          availableInputs.value.some(input => input.id === id)
        );
        console.log('[FocusSwitcherStore] Configuration loaded:', configuredSequence.value);
      } catch (error) {
        console.error('[FocusSwitcherStore] Failed to parse saved configuration:', error);
        configuredSequence.value = []; // 解析失败则重置
        localStorage.removeItem(LOCAL_STORAGE_KEY); // 移除损坏的数据
      }
    } else {
      // 如果没有保存的配置，可以设置一个默认顺序
      // configuredSequence.value = ['commandInput', 'terminalSearch']; // 例如
      configuredSequence.value = []; // 或者默认为空
      console.log('[FocusSwitcherStore] No saved configuration found, using default (empty).');
    }
  }

  // 保存配置到 localStorage
  function saveConfiguration() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(configuredSequence.value));
      console.log('[FocusSwitcherStore] Configuration saved:', configuredSequence.value);
    } catch (error) {
      console.error('[FocusSwitcherStore] Failed to save configuration:', error);
    }
  }

  // 更新切换顺序
  function updateSequence(newSequence: string[]) {
    // 确保新序列中的 ID 都是有效的
    configuredSequence.value = newSequence.filter(id =>
      availableInputs.value.some(input => input.id === id)
    );
    // 可以在这里直接保存，或者让用户点击保存按钮再调用 saveConfiguration
    // saveConfiguration(); // 取决于设计
  }

  // --- Getters ---
  // 获取已配置的输入框完整信息 (按顺序)
  const getConfiguredInputs = computed((): FocusableInput[] => {
    return configuredSequence.value
      .map(id => availableInputs.value.find(input => input.id === id))
      .filter((input): input is FocusableInput => input !== undefined); // 类型守卫确保过滤掉 undefined
  });

  // 获取在配置器中可用的输入框 (未被配置的)
  const getAvailableInputsForConfigurator = computed((): FocusableInput[] => {
    const configuredIds = new Set(configuredSequence.value);
    return availableInputs.value.filter(input => !configuredIds.has(input.id));
  });

  // 获取下一个要聚焦的输入框 ID (用于实际切换逻辑)
  function getNextFocusTargetId(currentFocusedId: string | null): string | null {
    if (configuredSequence.value.length === 0) {
      return null; // 没有配置顺序
    }
    if (currentFocusedId === null) {
      // 如果当前没有焦点在配置列表内，返回第一个
      return configuredSequence.value[0];
    }

    const currentIndex = configuredSequence.value.indexOf(currentFocusedId);
    if (currentIndex === -1) {
      // 如果当前焦点不在配置列表内，返回第一个
      return configuredSequence.value[0];
    }

    // 返回下一个，如果到末尾则循环回第一个
    const nextIndex = (currentIndex + 1) % configuredSequence.value.length;
    return configuredSequence.value[nextIndex];
  }


  // --- Initialization ---
  // Store 创建时自动加载配置
  loadConfiguration();

  return {
    // State
    availableInputs,
    configuredSequence,
    isConfiguratorVisible, // 导出状态
    // Actions
    toggleConfigurator, // 导出 action
    loadConfiguration,
    saveConfiguration,
    updateSequence,
    // Getters
    getConfiguredInputs,
    getAvailableInputsForConfigurator,
    getNextFocusTargetId,
  };
});