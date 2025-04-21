<script setup lang="ts">
import { ref, computed, watch, reactive, type Ref } from 'vue'; // 添加 Ref
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import { useFocusSwitcherStore, type FocusableInput, type FocusItemConfig, type FocusSwitcherFullConfig } from '../stores/focusSwitcher.store'; // ++ 导入新接口 ++
import { storeToRefs } from 'pinia';

// 本地接口，仅用于右侧列表显示
interface SequenceDisplayItem extends FocusableInput {}


// --- Props ---
const props = defineProps({
  isVisible: {
    type: Boolean,
    required: true,
  },
});

// --- Emits ---
const emit = defineEmits(['close']);

// --- Setup ---
const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore(); // 实例化 Store

// --- State ---
const dialogRef = ref<HTMLElement | null>(null);
const initialDialogState = { width: 900, height: 600 }; // *** 增加初始尺寸 ***
const dialogStyle = reactive({
  width: `${initialDialogState.width}px`,
  height: `${initialDialogState.height}px`,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  position: 'absolute' as 'absolute',
});
const hasChanges = ref(false);
// 本地副本，用于在弹窗内编辑
const localSequence = ref<SequenceDisplayItem[]>([]); // 右侧列表，只关心顺序和基础信息
const localItemConfigs = ref<Record<string, FocusItemConfig>>({}); // 所有项目的配置 (快捷键)
const originalConfig = ref<FocusSwitcherFullConfig | null>(null); // 存储原始完整配置用于比较

// --- Watchers ---
watch(() => props.isVisible, async (newValue) => { // ++ Make async for potential backend load ++
  if (newValue) {
    // --- 加载完整配置 ---
    // 确保 Store 已初始化 (如果 Store 还没有加载完)
    // await focusSwitcherStore.loadConfigurationFromBackend(); // 如果 Store 初始化时未加载，则在此加载

    const currentSequenceOrder = focusSwitcherStore.sequenceOrder;
    const currentItemConfigs = focusSwitcherStore.itemConfigs;
    const allAvailableInputs = focusSwitcherStore.availableInputs; // 获取所有可用输入的基础信息
    const inputsMap = new Map(allAvailableInputs.map(input => [input.id, input]));

    console.log('[FocusSwitcherConfigurator] Loading full config from store...');
    console.log('[FocusSwitcherConfigurator] Store sequenceOrder:', JSON.stringify(currentSequenceOrder));
    console.log('[FocusSwitcherConfigurator] Store itemConfigs:', JSON.stringify(currentItemConfigs));

    // 构建本地右侧列表 (localSequence)
    localSequence.value = currentSequenceOrder
      .map(id => inputsMap.get(id)) // 获取基础信息
      .filter((input): input is SequenceDisplayItem => input !== undefined); // 过滤掉无效 ID 并断言类型

    // 构建本地所有项目配置 (localItemConfigs) - 深拷贝
    // 确保所有 availableInputs 都有一个条目，即使没有快捷键
    const initialConfigs: Record<string, FocusItemConfig> = {};
    allAvailableInputs.forEach(input => {
        initialConfigs[input.id] = { ... (currentItemConfigs[input.id] || {}) }; // 复制 store 中的配置，或创建空对象
    });
    localItemConfigs.value = JSON.parse(JSON.stringify(initialConfigs));

    // 存储原始完整配置用于比较
    originalConfig.value = JSON.parse(JSON.stringify({
        sequence: currentSequenceOrder,
        shortcuts: currentItemConfigs
    }));

    hasChanges.value = false;
    console.log('[FocusSwitcherConfigurator] Dialog opened. Loaded localSequence:', JSON.stringify(localSequence.value));
    console.log('[FocusSwitcherConfigurator] Loaded localItemConfigs:', JSON.stringify(localItemConfigs.value));
    console.log('[FocusSwitcherConfigurator] Original full config stored:', JSON.stringify(originalConfig.value));
    // 重置/计算初始位置和大小
    requestAnimationFrame(() => {
      if (dialogRef.value) {
        const initialWidth = initialDialogState.width;
        const initialHeight = initialDialogState.height;
        dialogStyle.width = `${initialWidth}px`;
        dialogStyle.height = `${initialHeight}px`;
        dialogStyle.left = `${(window.innerWidth - initialWidth) / 2}px`;
        dialogStyle.top = `${(window.innerHeight - initialHeight) / 2}px`;
        dialogStyle.transform = 'none';
        dialogStyle.position = 'absolute';
      }
    });
  } else {
    // 清理工作（如果需要）
  }
});

// 监听本地序列（包括快捷键）变化，标记未保存更改
// --- 修改：监听 localSequence 和 localItemConfigs 的变化 ---
watch([localSequence, localItemConfigs], ([currentSequence, currentConfigs]) => {
  if (!originalConfig.value) return; // 尚未加载完成

  // 比较序列顺序
  const sequenceChanged = JSON.stringify(currentSequence.map(item => item.id)) !== JSON.stringify(originalConfig.value.sequence);

  // 比较快捷键配置 (需要过滤掉原始配置中不存在的键，以防初始化时加入)
  const currentShortcuts: Record<string, FocusItemConfig> = {};
  for(const id in currentConfigs) {
      // 只比较原始配置中存在的 ID 或当前序列中的 ID 的快捷键是否有变化
      if (originalConfig.value.shortcuts[id] !== undefined || currentSequence.some(item => item.id === id)) {
          currentShortcuts[id] = { shortcut: currentConfigs[id].shortcut };
      }
  }
  const originalShortcuts: Record<string, FocusItemConfig> = {};
   for(const id in originalConfig.value.shortcuts) {
       originalShortcuts[id] = { shortcut: originalConfig.value.shortcuts[id].shortcut };
   }
  const shortcutsChanged = JSON.stringify(currentShortcuts) !== JSON.stringify(originalShortcuts);

  hasChanges.value = sequenceChanged || shortcutsChanged;
  // console.log(`[FocusSwitcherConfigurator] Changes detected: sequence=${sequenceChanged}, shortcuts=${shortcutsChanged}, hasChanges=${hasChanges.value}`);

}, { deep: true });


// --- Methods ---
const closeDialog = () => {
  if (hasChanges.value) {
    if (confirm(t('focusSwitcher.confirmClose', '有未保存的更改，确定要关闭吗？'))) {
      emit('close');
    }
  } else {
    emit('close');
  }
};

const saveConfiguration = () => {
  // 构造 FocusSwitcherFullConfig 对象
  const newSequence = localSequence.value.map(item => item.id);
  // 清理 shortcuts，移除没有快捷键的条目 (可选，取决于后端是否需要)
  const newShortcuts: Record<string, FocusItemConfig> = {};
  for (const id in localItemConfigs.value) {
      if (localItemConfigs.value[id]?.shortcut) {
          newShortcuts[id] = { shortcut: localItemConfigs.value[id].shortcut };
      }
      // 如果需要保存空快捷键的记录，则取消 if 条件
      // newShortcuts[id] = { shortcut: localItemConfigs.value[id]?.shortcut };
  }

  const fullConfigToSave: FocusSwitcherFullConfig = {
    sequence: newSequence,
    shortcuts: newShortcuts,
  };

  console.log('[FocusSwitcherConfigurator] Saving full configuration:', JSON.stringify(fullConfigToSave));
  focusSwitcherStore.updateConfiguration(fullConfigToSave); // 调用 Store 更新函数
  console.log('[FocusSwitcherConfigurator] Configuration save process triggered.');
  hasChanges.value = false;
  emit('close'); // 保存后关闭
};

const removeFromSequence = (index: number) => {
  if (index >= 0 && index < localSequence.value.length) {
    localSequence.value.splice(index, 1);
    // hasChanges 会在 watch 中自动更新
  }
};

// --- Computed ---
// ++ 修改：计算属性，获取不在右侧序列中的项目 (用于左侧列表) ++
const localAvailableInputs = computed(() => {
  const sequenceIds = new Set(localSequence.value.map(item => item.id));
  // 从所有可用输入中过滤掉已在序列中的，并合并本地快捷键配置
  return focusSwitcherStore.availableInputs
    .filter(input => !sequenceIds.has(input.id))
    .map(input => ({
        ...input,
        // shortcut: localItemConfigs.value[input.id]?.shortcut // 快捷键在下方单独配置
    }));
});

// 注意：已配置的列表直接使用 localSequence ref
// 原先的 availableInputsForConfigurator getter 在 store 中仍然存在，但我们现在使用本地计算的版本以实现实时更新

</script>

<template>
  <div v-if="isVisible" class="focus-switcher-overlay" @click.self="closeDialog">
    <div ref="dialogRef" class="focus-switcher-dialog" :style="dialogStyle">
      <header class="dialog-header">
        <h2>{{ t('focusSwitcher.configTitle', '配置 Alt 焦点切换') }}</h2>
        <button class="close-button" @click="closeDialog" :title="t('common.close', '关闭')">&times;</button>
      </header>

      <!-- 将原 main 内容包裹，并改用新 class -->
      <div class="dialog-main-content">
        <!-- +++ 创建第一行容器 +++ -->
        <div class="top-row">
          <section class="available-inputs-section">
            <h3>{{ t('focusSwitcher.availableInputs', '可用输入框') }}</h3>
            <draggable
              :list="localAvailableInputs"
              tag="ul"
              class="draggable-list available-list"
              item-key="id"
              :group="{ name: 'focus-inputs', pull: true, put: false }"
              :sort="false"
            >
              <template #item="{ element }: { element: FocusableInput & FocusItemConfig }">
                <li class="draggable-item">
                  <i class="fas fa-grip-vertical drag-handle"></i>
                  <span class="item-label">{{ element.label }}</span>
                  <!-- 快捷键设置在下方 -->
                </li>
              </template>
               <template #footer>
                 <li v-if="localAvailableInputs.length === 0" class="no-items-placeholder">
                   <span>{{ t('focusSwitcher.allInputsConfigured', '所有输入框都已配置') }}</span>
                 </li>
               </template>
            </draggable>
          </section>

          <section class="configured-sequence-section">
            <h3>{{ t('focusSwitcher.configuredSequence', '切换顺序 (拖拽排序)') }}</h3>
             <draggable
               :list="localSequence"
               tag="ul"
               class="draggable-list configured-list"
               item-key="id"
               :group="{ name: 'focus-inputs', put: true }"
               handle=".drag-handle"
             >
               <template #item="{ element, index }: { element: SequenceDisplayItem, index: number }">
                 <li class="draggable-item">
                   <i class="fas fa-grip-vertical drag-handle"></i>
                   <span class="item-label">{{ element.label }}</span>
                   <!-- 快捷键设置在下方 -->
                   <button
                     class="remove-button"
                     @click="removeFromSequence(index)"
                     :title="t('common.remove', '移除')"
                   >&times;</button>
                 </li>
               </template>
                <template #footer>
                  <li v-if="localSequence.length === 0" class="no-items-placeholder">
                    {{ t('focusSwitcher.dragHere', '从左侧拖拽输入框到此处') }}
                  </li>
                </template>
             </draggable>
          </section>
        </div>
        <!-- +++ 第一行容器结束 +++ -->

        <!-- +++ 第二行：快捷键配置区域 +++ -->
        <section class="shortcut-config-section">
          <h3>{{ t('focusSwitcher.shortcutSettings', '快捷键设置') }}</h3>
          <div class="shortcut-list">
            <!-- 遍历所有可用输入项来设置快捷键 -->
            <div v-for="input in focusSwitcherStore.availableInputs" :key="input.id" class="shortcut-item">
              <span class="item-label">{{ input.label }}</span>
              <input
                type="text"
                v-model="localItemConfigs[input.id].shortcut"
                class="shortcut-input"
                :placeholder="t('focusSwitcher.shortcutPlaceholder')"
                @keydown.prevent="captureShortcut($event, localItemConfigs[input.id])"
              />
            </div>
             <div v-if="!focusSwitcherStore.availableInputs || focusSwitcherStore.availableInputs.length === 0" class="no-items-placeholder">
               {{ t('focusSwitcher.noInputsAvailable', '没有可配置的输入项') }}
             </div>
          </div>
        </section>
        <!-- +++ 快捷键配置区域结束 +++ -->
      </div>

      <footer class="dialog-footer">
        <button @click="closeDialog" class="button-secondary">{{ t('common.cancel', '取消') }}</button>
        <button @click="saveConfiguration" class="button-primary" :disabled="!hasChanges">
          {{ t('common.save', '保存') }} {{ hasChanges ? '*' : '' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script lang="ts">
// +++ 在 <script setup> 之外定义辅助函数（如果需要更复杂的逻辑或重用）+++
// 或者直接在 setup 内部定义 captureShortcut

// ++ 修改：captureShortcut 现在接收 FocusItemConfig 并更新它 ++
const captureShortcut = (event: KeyboardEvent, itemConfig: FocusItemConfig) => {
  if (event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift' || event.key === 'Meta') {
    // 忽略单独的修饰键按下
    return;
  }

  if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
    // 必须是 Alt + 非修饰键
    let key = event.key;
    if (key.length === 1) { // 将小写字母转为大写
      key = key.toUpperCase();
    }
    // 可以添加更多验证，例如只允许字母、数字等
    if (/^[a-zA-Z0-9]$/.test(key)) { // 简化：只允许单个字母或数字
        itemConfig.shortcut = `Alt+${key}`; // 直接修改传入的配置对象
    } else if (key === 'Backspace' || key === 'Delete') {
        itemConfig.shortcut = undefined; // 使用 undefined 清空
    } else {
        // 可选：提示不支持的键
        console.warn(`[FocusSwitcherConfigurator] Unsupported key for shortcut: ${key}`);
    }
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
      // 允许单独按 Backspace 或 Delete 清空 (即使没有 Alt)
      itemConfig.shortcut = undefined; // 使用 undefined 清空
  } else {
    // 可选：如果按下非 Alt 组合键，可以清空或提示
    // console.log('[FocusSwitcherConfigurator] Invalid shortcut combination.');
  }
};
</script>

<style scoped>
/* 样式很大程度上复用 LayoutConfigurator，但使用不同的类名以避免冲突 */
.focus-switcher-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6); display: flex;
  justify-content: center; align-items: flex-start; /* 改为 flex-start */
  z-index: 1000; pointer-events: none;
}
.focus-switcher-dialog {
  background-color: var(--dialog-bg-color, #fff); border-radius: 8px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  display: flex; flex-direction: column; overflow: hidden;
  position: absolute; pointer-events: auto; cursor: default;
  color: var(--text-color);
}
.dialog-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);
  background-color: var(--header-bg-color);
}
.dialog-header h2 { margin: 0; font-size: 1.2rem; font-weight: 600; }
.close-button {
  background: none; border: none; font-size: 1.8rem; cursor: pointer;
  color: var(--text-color-secondary); line-height: 1; padding: 0;
}
.close-button:hover { color: var(--text-color); }

/* 修改：原 dialog-content 现在是 dialog-main-content */
.dialog-main-content {
  flex-grow: 1; /* 占据主要垂直空间 */
  padding: 1.5rem;
  display: flex;
  flex-direction: column; /* 改为上下两行布局 */
  align-items: stretch; /* 默认拉伸，让快捷键区域横跨 */
  gap: 1.5rem;
  background-color: var(--app-bg-color); /* 内容区背景 */
  overflow-y: auto; /* 如果内容过多允许滚动 */
}
/* +++ 第一行容器样式 +++ */
.top-row {
  display: flex;
  gap: 1.5rem;
  flex-shrink: 0; /* 防止第一行被压缩 */
  min-height: 300px; /* 给第一行一个最小高度 */
}
/* +++ 第一行内部左右列样式 +++ */
.available-inputs-section, .configured-sequence-section {
  flex: 1; /* 平分第一行的宽度 */
  padding: 1rem; border: 1px solid var(--border-color);
  border-radius: 4px; background-color: var(--input-bg-color); /* 区域背景 */
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* 允许内部列表滚动 */
}
/* +++ 第二行（快捷键配置区域）样式 +++ */
.shortcut-config-section {
  padding: 1rem; border: 1px solid var(--border-color);
  border-radius: 4px; background-color: var(--input-bg-color); /* 区域背景 */
  display: flex; /* 确保内部元素正确布局 */
  flex-direction: column;
  overflow-y: auto; /* 允许滚动 */
  max-height: 250px; /* 限制最大高度 */
  flex-shrink: 0; /* 防止被压缩 */
}
.shortcut-config-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 0.5rem;
}
.shortcut-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); /* 自动填充列 */
  gap: 0.8rem; /* 项目间距 */
}
.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--input-bg-color); /* 使用输入框背景色 */
  padding: 0.5rem 0.8rem;
  border-radius: 4px;
  border: 1px solid var(--border-color-light);
}
.shortcut-item .item-label {
  flex-grow: 1;
  margin-right: 0.8rem; /* 增加与输入框间距 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9rem;
}
.shortcut-item .shortcut-input {
  /* 样式继承自全局 .shortcut-input */
  margin-left: 0.5rem; /* 确保左边有间距 */
  margin-right: 0; /* 右侧不需要额外间距 */
}
/* --- 原有样式继续 --- */
h3 {
  margin-top: 0; margin-bottom: 1rem; font-size: 1rem;
  font-weight: 600; color: var(--text-color-secondary);
  border-bottom: 1px solid var(--border-color-light); padding-bottom: 0.5rem;
}
.draggable-list {
  list-style: none; padding: 0; margin: 0;
  min-height: 100px; /* 给拖放区域一个最小高度 */
  border: 1px dashed var(--border-color-light); /* 虚线边框 */
  border-radius: 4px;
  padding: 0.5rem;
  background-color: rgba(0,0,0,0.02); /* 轻微背景 */
  flex-grow: 1; /* +++ 让列表占据剩余空间 +++ */
  overflow-y: auto; /* +++ 列表本身也允许滚动 (双保险) +++ */
}
.draggable-item {
  padding: 0.6rem 0.8rem; margin-bottom: 0.5rem;
  background-color: var(--app-bg-color); border: 1px solid var(--border-color);
  border-radius: 4px; cursor: grab;
  display: flex; /* 使用 flex 布局 */
  align-items: center; /* 垂直居中 */
  justify-content: space-between; /* 两端对齐 */
  transition: background-color 0.2s ease;
  overflow: hidden; /* +++ 防止内部元素溢出容器 +++ */
}
.draggable-item:hover {
    background-color: var(--header-bg-color); /* 悬停效果 */
}
.draggable-item.sortable-ghost { /* 拖拽时的占位符样式 */
  opacity: 0.4;
  background: #c8ebfb;
}
.drag-handle {
  margin-right: 0.5rem;
  color: var(--text-color-secondary);
  cursor: grab;
}
.draggable-item:active .drag-handle {
  cursor: grabbing;
}
/* +++ 新增 item-label 样式 +++ */
.item-label {
  flex-grow: 1; /* 占据剩余空间 */
  overflow: hidden; /* 隐藏溢出文本 */
  text-overflow: ellipsis; /* 显示省略号 */
  white-space: nowrap;
  margin-right: 0.5rem; /* 与快捷键输入框保持间距 */
}
/* +++ 新增快捷键输入框样式 +++ */
.shortcut-input {
  width: 100px; /* 固定宽度 */
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background-color: var(--input-bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
  text-align: center;
  /* margin-left: auto; */ /* 不再需要自动推 */
  /* margin-right: 0.5rem; */ /* 间距由父元素 gap 或 .shortcut-item .item-label 控制 */
  flex-shrink: 0; /* 防止被压缩 */
}
.shortcut-input::placeholder {
    color: #888;
    font-style: italic;
}
.remove-button {
  background: none; border: none; color: var(--text-color-secondary);
  font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem; line-height: 1;
  flex-shrink: 0; /* 防止被压缩 */
  margin-left: auto; /* 将移除按钮推到最右侧 */
}
.remove-button:hover { color: var(--danger-color, red); }
.no-items-placeholder {
  text-align: center; color: var(--text-color-secondary); font-style: italic;
  padding: 1rem; border: none; background: none; cursor: default;
}

.dialog-footer {
  padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);
  display: flex; justify-content: flex-end; gap: 0.8rem;
  background-color: var(--header-bg-color);
}
/* 通用按钮样式 (复用 LayoutConfigurator 或全局样式) */
.button-primary, .button-secondary {
  padding: 0.5rem 1rem; border: none; border-radius: 4px;
  cursor: pointer; font-size: 0.9rem;
  transition: background-color 0.2s ease, opacity 0.2s ease;
}
.button-primary {
  background-color: var(--button-bg-color); color: var(--button-text-color);
}
.button-primary:hover:not(:disabled) { background-color: var(--button-hover-bg-color); }
.button-primary:disabled { background-color: #6c757d; opacity: 0.7; cursor: not-allowed; }
.button-secondary {
  background-color: var(--secondary-button-bg-color, #e9ecef);
  color: var(--secondary-button-text-color, #343a40);
  border: 1px solid var(--border-color);
}
.button-secondary:hover { background-color: var(--secondary-button-hover-bg-color, #dee2e6); }
</style>
