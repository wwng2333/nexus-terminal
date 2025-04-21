<script setup lang="ts">
import { ref, computed, watch, reactive, type Ref } from 'vue'; // 添加 Ref
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import { useFocusSwitcherStore, type FocusableInput, type ConfiguredFocusableInput } from '../stores/focusSwitcher.store'; // +++ 导入新接口 +++
import { storeToRefs } from 'pinia';
// --- 移除本地类型定义 ---




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
// 本地副本，用于在弹窗内编辑而不直接修改 store
const localSequence: Ref<ConfiguredFocusableInput[]> = ref([]); // +++ 使用导入的接口 +++
// +++ 存储原始序列（包含 ID 和快捷键），用于比较 +++
const originalSequence: Ref<ConfiguredFocusableInput[]> = ref([]); // +++ 使用导入的接口 +++

// --- Watchers ---
watch(() => props.isVisible, (newValue) => {
  if (newValue) {
    // 从 Store 加载当前配置到本地副本
    // 从 Store 加载当前配置到本地副本
    // !!! 注意：Store 现在也需要支持快捷键，这里暂时假设它返回的数据包含 shortcut !!!
    // 假设 getConfiguredInputs 返回的是 LocalFocusableInput[] 或能转换的类型
    const loadedSequenceFromStore = focusSwitcherStore.getConfiguredInputs; // 这个 getter 可能需要修改
    console.log('[FocusSwitcherConfigurator] Loading sequence from store getter...');
    // 深拷贝，并确保每个项目都有 shortcut 属性（可能为 undefined）
    // Store getter 现在返回正确的类型，可以直接深拷贝
    localSequence.value = JSON.parse(JSON.stringify(loadedSequenceFromStore));
    originalSequence.value = JSON.parse(JSON.stringify(loadedSequenceFromStore)); // 同样直接拷贝
    hasChanges.value = false;
    console.log('[FocusSwitcherConfigurator] Dialog opened. Loaded sequence to local copy:', localSequence.value);
    console.log('[FocusSwitcherConfigurator] Original sequence stored:', originalSequence.value);
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
watch(localSequence, (currentLocalSequence) => {
  // 比较当前本地序列和原始序列的 JSON 字符串
  const hasChanged = JSON.stringify(currentLocalSequence) !== JSON.stringify(originalSequence.value);
  if (hasChanged) {
    // console.log('[FocusSwitcherConfigurator] Local sequence changed.'); // +++ Log: Changed +++
    hasChanges.value = true;
  } else {
    // console.log('[FocusSwitcherConfigurator] Local sequence reverted to original.'); // +++ Log: Reverted +++
    // 如果序列变回和原来一样，则标记为无更改
    hasChanges.value = false;
  }
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
  // 提取仅包含 id 和 shortcut 的配置项数组
  const configToSave = localSequence.value.map(item => ({
    id: item.id,
    shortcut: item.shortcut || undefined, // 空字符串视为未设置
  }));
  console.log('[FocusSwitcherConfigurator] Saving configuration. Config to save:', configToSave);
  // 调用 Store 中正确的更新函数
  focusSwitcherStore.updateConfiguration(configToSave);
  console.log('[FocusSwitcherConfigurator] Configuration save process triggered via updateConfiguration.');
  hasChanges.value = false;
  emit('close'); // 保存后关闭
};

// --- Computed ---
// 新的计算属性：基于本地已配置列表动态计算可用输入框
const localAvailableInputs = computed(() => {
  // 获取本地已配置项的 ID 集合
  const configuredIds = new Set(localSequence.value.map(item => item.id));
  // 从 store 的 availableInputs state 中过滤掉已在本地配置的项
  // 注意：直接访问 store 的 state ref
  return focusSwitcherStore.availableInputs.filter(input => !configuredIds.has(input.id));
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

      <main class="dialog-content">
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
            <template #item="{ element }: { element: FocusableInput }">
              <li class="draggable-item">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <span class="item-label">{{ element.label }}</span>
              </li>
            </template>
             <template #footer>
               <li v-if="localAvailableInputs.length === 0" class="no-items-placeholder"> <!-- 判断条件也更新 -->
                 {{ t('focusSwitcher.allInputsConfigured', '所有输入框都已配置') }}
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
             <template #item="{ element, index }: { element: ConfiguredFocusableInput, index: number }">
               <div> <!-- Wrap the content in a single div -->
                 <li class="draggable-item">
                   <i class="fas fa-grip-vertical drag-handle"></i>
                   <span class="item-label">{{ element.label }}</span>
                 <!-- +++ 添加快捷键输入框 +++ -->
                 <input
                   type="text"
                   v-model="element.shortcut"
                   class="shortcut-input"
                   :placeholder="t('focusSwitcher.shortcutPlaceholder')"
                   @keydown.prevent="captureShortcut($event, element)"
                 />
                 <!-- 添加移除按钮 -->
                 <button @click="localSequence.splice(index, 1)" class="remove-button" :title="t('common.remove', '移除')">&times;</button>
                 </li>
               </div>
             </template>
              <template #footer>
                <li v-if="localSequence.length === 0" class="no-items-placeholder">
                  {{ t('focusSwitcher.dragHere', '从左侧拖拽输入框到此处') }}
                </li>
              </template>
           </draggable>
        </section>
      </main>

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

// 内部定义 captureShortcut
const captureShortcut = (event: KeyboardEvent, element: ConfiguredFocusableInput) => { // +++ 使用导入的接口 +++
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
        element.shortcut = `Alt+${key}`;
    } else if (key === 'Backspace' || key === 'Delete') {
        element.shortcut = ''; // 允许使用 Backspace 或 Delete 清空
    } else {
        // 可选：提示不支持的键
        console.warn(`[FocusSwitcherConfigurator] Unsupported key for shortcut: ${key}`);
    }
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
      // 允许单独按 Backspace 或 Delete 清空 (即使没有 Alt)
      element.shortcut = '';
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

.dialog-content {
  flex-grow: 1; padding: 1.5rem; overflow-y: auto;
  display: flex; gap: 1.5rem;
  background-color: var(--app-bg-color); /* 内容区背景 */
}
.available-inputs-section, .configured-sequence-section {
  flex: 1; padding: 1rem; border: 1px solid var(--border-color);
  border-radius: 4px; background-color: var(--input-bg-color); /* 区域背景 */
  display: flex; /* +++ 添加 flex 布局 +++ */
  flex-direction: column; /* +++ 垂直排列内部元素 +++ */
  overflow-y: auto; /* +++ 允许垂直滚动 +++ */
}
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
  margin-left: auto; /* 将其推到标签和移除按钮之间 */
  margin-right: 0.5rem; /* 与移除按钮保持间距 */
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
  /* margin-left: auto; 现在由 shortcut-input 推 */
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