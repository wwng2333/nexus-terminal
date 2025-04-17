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
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1050; /* 比其他 UI 高 */
}

.modal-content {
  background-color: #ffffff; /* 强制设置不透明白色背景 */
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 500px;
}

h2 {
  margin: 0 0 1.5rem 0; /* 确保顶部 margin 为 0 */
  color: #333; /* 使用具体的颜色值 */
  text-align: center;
  font-size: 1.4rem; /* 调整字体大小 */
  font-weight: 500; /* 调整字重 */
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: var(--color-text-secondary);
}

input[type="text"],
textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-input-bg);
  color: var(--color-text);
  box-sizing: border-box; /* 确保 padding 不会撑大元素 */
  font-family: inherit;
  font-size: 1rem;
}

textarea {
  resize: vertical; /* 允许垂直调整大小 */
  min-height: 80px;
}

.required {
  color: var(--color-danger);
  margin-left: 0.2rem;
}

.error-message {
  color: var(--color-danger);
  font-size: 0.85em;
  margin-top: 0.3rem;
  display: block;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.cancel-btn,
.confirm-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s ease;
}

.cancel-btn {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
  margin-right: 0.5rem;
}
.cancel-btn:hover {
  background-color: var(--color-bg-tertiary);
}

.confirm-btn {
  background-color: var(--color-primary);
  color: white;
}
.confirm-btn:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
}
.confirm-btn:disabled {
  background-color: var(--color-disabled);
  cursor: not-allowed;
}
</style>
