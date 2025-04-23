<template>
  <div class="fixed inset-0 bg-overlay flex justify-center items-center z-[1050]" @click.self="closeForm">
    <div class="bg-dialog text-dialog-text p-6 rounded-lg border border-border shadow-xl w-[90%] max-w-lg">
      <h2 class="m-0 mb-6 text-center text-xl font-medium">{{ isEditing ? t('quickCommands.form.titleEdit', '编辑快捷指令') : t('quickCommands.form.titleAdd', '添加快捷指令') }}</h2>
      <form @submit.prevent="handleSubmit">
        <div class="mb-4">
          <label for="qc-name" class="block mb-2 font-bold text-text-secondary text-sm">{{ t('quickCommands.form.name', '名称:') }}</label>
          <input
            id="qc-name"
            type="text"
            v-model="formData.name"
            :placeholder="t('quickCommands.form.namePlaceholder', '可选，用于快速识别')"
            class="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
          />
        </div>
        <div class="mb-4">
          <label for="qc-command" class="block mb-2 font-bold text-text-secondary text-sm">{{ t('quickCommands.form.command', '指令:') }} <span class="text-error">*</span></label>
          <textarea
            id="qc-command"
            v-model="formData.command"
            required
            rows="3"
            :placeholder="t('quickCommands.form.commandPlaceholder', '例如：ls -alh /home/user')"
            class="w-full px-3 py-2 border border-border rounded bg-input text-foreground text-base resize-vertical min-h-[80px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
          ></textarea>
          <small v-if="commandError" class="text-error text-xs mt-1 block">{{ commandError }}</small>
        </div>
        <div class="flex justify-end mt-6 pt-2 border-t border-border">
          <button type="button" @click="closeForm" class="py-2 px-4 rounded text-sm transition-colors duration-150 bg-button text-button-text hover:bg-button-hover border border-border mr-2">{{ t('common.cancel', '取消') }}</button>
          <button type="submit" :disabled="isSubmitting || !!commandError" class="py-2 px-4 rounded text-sm transition-colors duration-150 bg-primary text-white hover:bg-primary-dark disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed">
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

