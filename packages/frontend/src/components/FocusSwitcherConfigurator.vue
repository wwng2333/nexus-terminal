<script setup lang="ts">
import { ref, computed, watch, reactive, type Ref } from 'vue'; // 添加 Ref
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable'; // 导入 draggable
import { useFocusSwitcherStore, type FocusableInput } from '../stores/focusSwitcher.store'; // 导入 Store 和类型
import { storeToRefs } from 'pinia'; // 导入 storeToRefs

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
const localSequence: Ref<FocusableInput[]> = ref([]);

// --- Watchers ---
watch(() => props.isVisible, (newValue) => {
  if (newValue) {
    // 从 Store 加载当前配置到本地副本
    // 使用深拷贝确保 localSequence 是独立的
    localSequence.value = JSON.parse(JSON.stringify(focusSwitcherStore.getConfiguredInputs));
    hasChanges.value = false;
    console.log('[FocusSwitcherConfigurator] 弹窗打开, 已加载配置到本地副本:', localSequence.value);
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

// 监听本地序列变化，标记未保存更改
watch(localSequence, (newValue, oldValue) => {
  // 确保不是初始化加载触发的 watch
  if (oldValue.length > 0 || (oldValue.length === 0 && newValue.length > 0)) {
     // 比较 ID 序列是否真的改变了
     const oldIds = oldValue.map(item => item.id);
     const newIds = newValue.map(item => item.id);
     if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
        hasChanges.value = true;
        console.log('[FocusSwitcherConfigurator] 本地序列已更改。');
     }
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
  // 从本地副本提取 ID 序列
  const newSequenceIds = localSequence.value.map(item => item.id);
  focusSwitcherStore.updateSequence(newSequenceIds); // 更新 Store 中的序列
  focusSwitcherStore.saveConfiguration(); // 持久化保存
  console.log('[FocusSwitcherConfigurator] 配置已保存:', newSequenceIds);
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
                {{ element.label }}
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
             :group="{ name: 'focus-inputs', put: true }" <!-- 明确允许放入 -->
             handle=".drag-handle"
           >
             <template #item="{ element, index }: { element: FocusableInput, index: number }">
               <li class="draggable-item">
                 <i class="fas fa-grip-vertical drag-handle"></i>
                 {{ element.label }}
                 <!-- 添加移除按钮 -->
                 <button @click="localSequence.splice(index, 1)" class="remove-button" :title="t('common.remove', '移除')">&times;</button>
               </li>
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
}
.draggable-item {
  padding: 0.6rem 0.8rem; margin-bottom: 0.5rem;
  background-color: var(--app-bg-color); border: 1px solid var(--border-color);
  border-radius: 4px; cursor: grab;
  display: flex; /* 使用 flex 布局 */
  align-items: center; /* 垂直居中 */
  justify-content: space-between; /* 两端对齐 */
  transition: background-color 0.2s ease;
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
.remove-button {
  background: none; border: none; color: var(--text-color-secondary);
  font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem; line-height: 1;
  margin-left: auto; /* 推到最右边 */
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