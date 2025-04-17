<template>
  <div class="modal-overlay" @click.self="closeForm">
    <div class="modal-content">
      <h2>{{ isEditing ? t('quickCommands.form.titleEdit', '编辑快捷指令') : t('quickCommands.form.titleAdd', '添加快捷指令') }}</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="qc-name">{{ t('quickCommands.form.name', '名称:') }}</label>
          <input
            id="qc-name"
            type="text"
            v-model="formData.name"
            :placeholder="t('quickCommands.form.namePlaceholder', '可选，用于快速识别')"
          />
        </div>
        <div class="form-group">
          <label for="qc-command">{{ t('quickCommands.form.command', '指令:') }} <span class="required">*</span></label>
          <textarea
            id="qc-command"
            v-model="formData.command"
            required
            rows="3"
            :placeholder="t('quickCommands.form.commandPlaceholder', '例如：ls -alh /home/user')"
          ></textarea>
          <small v-if="commandError" class="error-message">{{ commandError }}</small>
        </div>
        <div class="form-actions">
          <button type="button" @click="closeForm" class="cancel-btn">{{ t('common.cancel', '取消') }}</button>
          <button type="submit" :disabled="isSubmitting || !!commandError" class="confirm-btn">
            {{ isSubmitting ? t('common.saving', '保存中...') : (isEditing ? t('common.save', '保存') : t('quickCommands.form.add', '添加')) }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuickCommandsStore, type QuickCommandFE } from '../stores/quickCommands.store';

const props = defineProps<{
  commandToEdit?: QuickCommandFE | null; // 接收要编辑的指令对象
}>();

const emit = defineEmits(['close']);

const { t } = useI18n();
const quickCommandsStore = useQuickCommandsStore();
const isSubmitting = ref(false);

const isEditing = computed(() => !!props.commandToEdit);

const formData = reactive({
  name: '',
  command: '',
});

const commandError = ref<string | null>(null);

// 监听指令内容变化，进行校验
watch(() => formData.command, (newCommand) => {
  if (!newCommand || newCommand.trim().length === 0) {
    commandError.value = t('quickCommands.form.errorCommandRequired', '指令内容不能为空');
  } else {
    commandError.value = null;
  }
});

// 初始化表单数据 (如果是编辑模式)
onMounted(() => {
  if (isEditing.value && props.commandToEdit) {
    formData.name = props.commandToEdit.name ?? '';
    formData.command = props.commandToEdit.command;
  }
});

const handleSubmit = async () => {
  if (commandError.value) return; // 如果校验失败则不提交

  isSubmitting.value = true;
  let success = false;

  // 处理名称，空字符串视为 null
  const finalName = formData.name.trim().length > 0 ? formData.name.trim() : null;

  if (isEditing.value && props.commandToEdit) {
    success = await quickCommandsStore.updateQuickCommand(props.commandToEdit.id, finalName, formData.command.trim());
  } else {
    success = await quickCommandsStore.addQuickCommand(finalName, formData.command.trim());
  }

  isSubmitting.value = false;
  if (success) {
    closeForm();
  }
};

const closeForm = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6); /* 半透明背景保持不变 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1050;
}

.modal-content {
  background-color: var(--app-bg-color); /* 使用应用背景色 */
  padding: calc(var(--base-padding, 1rem) * 1.5); /* 使用基础内边距 */
  border-radius: 8px;
  border: 1px solid var(--border-color); /* 添加边框 */
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); /* 调整阴影 */
  width: 90%;
  max-width: 500px;
  color: var(--text-color); /* 默认文字颜色 */
}

h2 {
  margin: 0 0 calc(var(--base-margin, 0.5rem) * 3) 0; /* 使用基础外边距 */
  color: var(--text-color); /* 使用主要文字颜色 */
  text-align: center;
  font-size: 1.4rem;
  font-weight: 500;
}

.form-group {
  margin-bottom: var(--base-margin, 0.5rem) * 2; /* 使用基础外边距 */
}

label {
  display: block;
  margin-bottom: var(--base-margin, 0.5rem); /* 使用基础外边距 */
  font-weight: bold;
  color: var(--text-color-secondary); /* 使用次要文字颜色 */
  font-size: 0.95rem;
}

input[type="text"],
textarea {
  width: 100%;
  padding: calc(var(--base-padding, 1rem) * 0.75); /* 使用基础内边距 */
  border: 1px solid var(--border-color); /* 使用边框颜色 */
  border-radius: 4px;
  background-color: var(--app-bg-color); /* 输入框背景与应用背景一致 */
  color: var(--text-color); /* 使用主要文字颜色 */
  box-sizing: border-box;
  font-family: inherit;
  font-size: 1rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input[type="text"]:focus,
textarea:focus {
    outline: none;
    border-color: var(--button-bg-color); /* 聚焦时边框使用按钮背景色 */
    /* 使用按钮背景色变量创建光晕效果，移除 rgba 回退 */
    box-shadow: 0 0 0 3px rgba(from var(--button-bg-color) r g b / 0.25);
}


textarea {
  resize: vertical;
  min-height: 80px;
}

.required {
  color: var(--bs-danger, red); /* 使用 Bootstrap 危险色或备用色 */
  margin-left: 0.2rem;
}

.error-message {
  color: var(--bs-danger, red); /* 使用 Bootstrap 危险色或备用色 */
  font-size: 0.85em;
  margin-top: calc(var(--base-margin, 0.5rem) * 0.6); /* 使用基础外边距 */
  display: block;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: calc(var(--base-margin, 0.5rem) * 3); /* 使用基础外边距 */
  padding-top: calc(var(--base-padding, 1rem) * 0.5); /* 添加顶部内边距 */
  border-top: 1px solid var(--border-color); /* 添加分隔线 */
}

.cancel-btn,
.confirm-btn {
  padding: calc(var(--base-padding, 1rem) * 0.6) calc(var(--base-padding, 1rem) * 1.2); /* 使用基础内边距 */
  border: 1px solid transparent; /* 添加透明边框以便悬停时改变 */
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem; /* 调整字体大小 */
  font-weight: 500; /* 调整字重 */
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.cancel-btn {
  background-color: var(--header-bg-color); /* 使用头部背景色作为次要按钮背景 */
  color: var(--text-color); /* 使用主要文字颜色 */
  border-color: var(--border-color); /* 使用边框颜色 */
  margin-right: var(--base-margin, 0.5rem); /* 使用基础外边距 */
}
.cancel-btn:hover {
  background-color: darken(var(--header-bg-color, #f0f0f0), 5%); /* 悬停时稍微变暗 */
  border-color: darken(var(--border-color, #cccccc), 10%);
}

.confirm-btn {
  background-color: var(--button-bg-color); /* 使用按钮背景色 */
  color: var(--button-text-color); /* 使用按钮文字颜色 */
  border-color: var(--button-bg-color); /* 边框与背景同色 */
}
.confirm-btn:hover:not(:disabled) {
  background-color: var(--button-hover-bg-color); /* 使用按钮悬停背景色 */
  border-color: var(--button-hover-bg-color);
}
.confirm-btn:disabled {
  background-color: var(--text-color-secondary); /* 禁用时使用次要文字颜色作为背景 */
  border-color: var(--text-color-secondary);
  color: var(--app-bg-color); /* 禁用时文字颜色反转 */
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
