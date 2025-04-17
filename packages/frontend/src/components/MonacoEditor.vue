<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';

// Props for the component (will be expanded later)
const fontSize = ref(14); // 添加字体大小状态，默认 14

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

onMounted(() => {
  if (editorContainer.value) {
    editorInstance = monaco.editor.create(editorContainer.value, {
      value: props.modelValue,
      language: props.language,
      theme: props.theme,
      fontSize: fontSize.value, // 使用 ref 作为初始字体大小
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

    // 添加鼠标滚轮缩放功能
    editorContainer.value.addEventListener('wheel', (event: WheelEvent) => {
      // 只在按下Ctrl键时才触发缩放
      if (event.ctrlKey) {
        event.preventDefault(); // 阻止默认的滚动行为

        // 根据滚轮方向调整字体大小
        if (event.deltaY < 0) {
          // 向上滚动，增大字体
          fontSize.value = Math.min(fontSize.value + 1, 40); // 设置最大字体大小为40
        } else {
          // 向下滚动，减小字体
          fontSize.value = Math.max(fontSize.value - 1, 8); // 设置最小字体大小为8
        }

        // 更新编辑器字体大小
        if (editorInstance) {
          editorInstance.updateOptions({ fontSize: fontSize.value });
          console.log(`[MonacoEditor] Font size changed to: ${fontSize.value}`); // 添加日志
        }
      }
    }, { passive: false }); // 设置 passive: false 允许 preventDefault

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

</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%; /* Ensure the container has height */
  min-height: 300px; /* Example minimum height */
  text-align: left; /* Ensure editor content aligns left */
}
</style>
