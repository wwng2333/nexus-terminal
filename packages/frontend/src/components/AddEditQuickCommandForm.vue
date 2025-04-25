<template>
  <div class="fixed inset-0 bg-overlay flex justify-center items-center z-[1050]" @click.self="closeForm">
    <div class="bg-background text-foreground p-6 rounded-xl border border-border/50 shadow-2xl w-[90%] max-w-lg">
      <h2 class="m-0 mb-6 text-center text-xl font-semibold">{{ isEditing ? t('quickCommands.form.titleEdit', '编辑快捷指令') : t('quickCommands.form.titleAdd', '添加快捷指令') }}</h2>
      <form @submit.prevent="handleSubmit" class="space-y-5">
        <div>
          <label for="qc-name" class="block mb-1.5 text-sm font-medium text-text-secondary">{{ t('quickCommands.form.name', '名称:') }}</label>
          <input
            id="qc-name"
            type="text"
            v-model="formData.name"
            :placeholder="t('quickCommands.form.namePlaceholder', '可选，用于快速识别')"
            class="w-full px-4 py-2 border border-border/50 rounded-lg bg-input text-foreground text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out"
          />
        </div>
        <div>
          <label for="qc-command" class="block mb-1.5 text-sm font-medium text-text-secondary">{{ t('quickCommands.form.command', '指令:') }} <span class="text-error">*</span></label>
          <textarea
            id="qc-command"
            v-model="formData.command"
            required
            rows="4"
            :placeholder="t('quickCommands.form.commandPlaceholder', '例如：ls -alh /home/user')"
            class="w-full px-4 py-2 border border-border/50 rounded-lg bg-input text-foreground text-sm resize-y min-h-[100px] shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition duration-150 ease-in-out"
          ></textarea>
          <small v-if="commandError" class="text-error text-xs mt-1 block">{{ commandError }}</small>
        </div>
        <div class="flex justify-end mt-8 pt-4 border-t border-border/50">
          <!-- Secondary/Cancel Button -->
          <button type="button" @click="closeForm" class="py-2 px-5 rounded-lg text-sm font-medium transition-colors duration-150 bg-background border border-border/50 text-text-secondary hover:bg-border hover:text-foreground mr-3">{{ t('common.cancel', '取消') }}</button>
          <!-- Primary/Submit Button -->
          <button type="submit" :disabled="isSubmitting || !!commandError" class="py-2 px-5 rounded-lg text-sm font-semibold transition-colors duration-150 bg-primary text-white border-none shadow-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed">
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

