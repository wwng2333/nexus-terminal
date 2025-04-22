<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, defineExpose } from 'vue';
import * as monaco from 'monaco-editor';
// import { useAppearanceStore } from '../stores/appearance.store'; // <-- 移除 Store 导入
// import { storeToRefs } from 'pinia'; // <-- 移除 storeToRefs 导入

// Props for the component (will be expanded later)
const localFontSize = ref(14); // <-- 添加本地字体大小状态，默认 14

const props = defineProps({
  modelValue: { // Use modelValue for v-model support
    type: String,
    default: '',
  },
  language: {
    type: String,
    default: 'plaintext', // Default language
  },
  theme: {
    type: String,
    default: 'vs-dark', // Default theme (can be 'vs', 'vs-dark', 'hc-black')
  },
  readOnly: {
    type: Boolean,
    default: false,
  }
});

// Emits for v-model update and save request
const emit = defineEmits(['update:modelValue', 'request-save']);

const editorContainer = ref<HTMLElement | null>(null);
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

// --- 移除 Appearance Store 相关代码 ---
// const appearanceStore = useAppearanceStore();
// const { currentEditorFontSize } = storeToRefs(appearanceStore);

// --- 移除防抖函数和相关调用 ---
// let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// const debounce = (func: Function, delay: number) => { ... };
// const debouncedSetEditorFontSize = debounce((size: number) => { ... });

onMounted(() => {
  if (editorContainer.value) {
    editorInstance = monaco.editor.create(editorContainer.value, {
      value: props.modelValue,
      language: props.language,
      theme: props.theme,
      fontSize: localFontSize.value, // <-- 使用本地字体大小
      automaticLayout: true, // Auto resize editor on container resize
      readOnly: props.readOnly,
      // Add more options as needed
      minimap: { enabled: true },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
    });

    // Listen for content changes and emit update event for v-model
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance) {
        const currentValue = editorInstance.getValue();
        if (currentValue !== props.modelValue) {
          emit('update:modelValue', currentValue);
        }
      }
    });

    // Add Ctrl+S / Cmd+S keybinding for saving
    editorInstance.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      ],
      precondition: undefined, // Fix: Use undefined instead of null
      keybindingContext: undefined, // Fix: Use undefined instead of null
      contextMenuGroupId: 'navigation', // Optional: where to show in context menu
      contextMenuOrder: 1.5, // Optional: order in context menu
      run: () => {
        console.log('[MonacoEditor] Save action triggered (Ctrl+S / Cmd+S)');
        emit('request-save');
      },
    });

    // Listen for content changes and emit update event for v-model
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance) {
        const currentValue = editorInstance.getValue();
        if (currentValue !== props.modelValue) {
          emit('update:modelValue', currentValue);
        }
      }
    });

    // Add Ctrl+S / Cmd+S keybinding for saving
    editorInstance.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      ],
      precondition: undefined, // Fix: Use undefined instead of null
      keybindingContext: undefined, // Fix: Use undefined instead of null
      contextMenuGroupId: 'navigation', // Optional: where to show in context menu
      contextMenuOrder: 1.5, // Optional: order in context menu
      run: () => {
        console.log('[MonacoEditor] Save action triggered (Ctrl+S / Cmd+S)');
        emit('request-save');
      },
    });

    // --- 添加带防抖的鼠标滚轮缩放功能 ---
    const editorDomNode = editorInstance?.getDomNode();
    if (editorDomNode) {
        console.log('[MonacoEditor] Adding wheel event listener with debounce.');
        editorDomNode.addEventListener('wheel', (event: WheelEvent) => {
            if (event.ctrlKey) {
                event.preventDefault();

                // Calculate new font size immediately based on local state
                const currentSize = localFontSize.value; // 使用本地状态
                let newSize: number;
                if (event.deltaY < 0) {
                    newSize = Math.min(currentSize + 1, 40); // Increase size, max 40
                } else {
                    newSize = Math.max(currentSize - 1, 8); // Decrease size, min 8
                }

                // Update visual font size and local state immediately
                if (editorInstance && newSize !== currentSize) {
                    console.log(`[MonacoEditor] Updating local font size to: ${newSize}`);
                    localFontSize.value = newSize; // 更新本地状态
                    editorInstance.updateOptions({ fontSize: newSize }); // 更新编辑器视觉效果

                    // --- 移除触发防抖保存的逻辑 ---
                    // debouncedSetEditorFontSize(newSize);
                }
            }
        }, { passive: false }); // passive: false allows preventDefault
    } else {
        console.error('[MonacoEditor] editorDomNode is null, cannot add wheel listener.');
    }
    // --- End of wheel event listener ---

    // --- 移除鼠标滚轮缩放功能 ---
    // const editorDomNode = editorInstance?.getDomNode();
    // if (editorDomNode) {
    //   editorDomNode.addEventListener('wheel', (event: WheelEvent) => {
    //     if (event.ctrlKey) {
    //       event.preventDefault();
    //       // ... (移除字体大小调整逻辑) ...
    //       // if (editorInstance) {
    //       //   editorInstance.updateOptions({ fontSize: fontSize.value }); // 使用本地 fontSize
    //       // }
    //     }
    //   }, { passive: false });
    // }

  }
});

// Update editor content if modelValue prop changes from outside
watch(() => props.modelValue, (newValue) => {
  if (editorInstance && editorInstance.getValue() !== newValue) {
    editorInstance.setValue(newValue);
  }
});

// Update language if prop changes
watch(() => props.language, (newLanguage) => {
  if (editorInstance && editorInstance.getModel()) {
    monaco.editor.setModelLanguage(editorInstance.getModel()!, newLanguage);
  }
});

// Update theme if prop changes
watch(() => props.theme, (newTheme) => {
  if (editorInstance) {
    monaco.editor.setTheme(newTheme);
  }
});

// Update readOnly status if prop changes
watch(() => props.readOnly, (newReadOnly) => {
  if (editorInstance) {
    editorInstance.updateOptions({ readOnly: newReadOnly });
  }
});


// --- 移除对全局字体大小的监听 ---
// watch(currentEditorFontSize, (newSize) => { ... });

onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.dispose();
    editorInstance = null;
  }
});

// Expose a method to get the current value if needed (optional)
// defineExpose({
//   getValue: () => editorInstance?.getValue()
// });

// Expose the focus method
defineExpose({
  focus: () => editorInstance?.focus()
});

</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%; /* Ensure the container has height */
  min-height: 300px; /* Example minimum height */
  text-align: left; /* Ensure editor content aligns left */
}
</style>
