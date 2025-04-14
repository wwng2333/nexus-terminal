<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';

// Props for the component (will be expanded later)
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

// Emits for v-model update
const emit = defineEmits(['update:modelValue']);

const editorContainer = ref<HTMLElement | null>(null);
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

onMounted(() => {
  if (editorContainer.value) {
    editorInstance = monaco.editor.create(editorContainer.value, {
      value: props.modelValue,
      language: props.language,
      theme: props.theme,
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
