<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTagsStore, TagInfo } from '../stores/tags.store';

// 定义 Props
const props = defineProps<{
  tagToEdit: TagInfo | null; // 接收要编辑的标签对象
}>();

// 定义发出的事件
const emit = defineEmits(['close', 'tag-saved']);

const { t } = useI18n();
const tagsStore = useTagsStore();

const tagName = ref('');
const formError = ref<string | null>(null);

// 计算属性判断是否为编辑模式
const isEditMode = computed(() => !!props.tagToEdit);

// 计算属性动态设置表单标题
const formTitle = computed(() => {
    return isEditMode.value ? t('tags.form.titleEdit') : t('tags.form.title');
});

// 计算属性动态设置提交按钮文本
const submitButtonText = computed(() => {
    if (tagsStore.isLoading) {
        return isEditMode.value ? t('tags.form.saving') : t('tags.form.adding');
    }
    return isEditMode.value ? t('tags.form.confirmEdit') : t('tags.form.confirm');
});

// 监听 prop 变化以填充或重置表单
watch(() => props.tagToEdit, (newVal) => {
    formError.value = null; // 清除错误
    if (newVal) {
        // 编辑模式：填充表单
        tagName.value = newVal.name;
    } else {
        // 添加模式：重置表单
        tagName.value = '';
    }
}, { immediate: true });

// 处理表单提交
const handleSubmit = async () => {
    formError.value = null;
    tagsStore.error = null; // 清除 store 中的旧错误

    const nameToSubmit = tagName.value.trim();
    if (!nameToSubmit) {
        formError.value = t('tags.form.errorNameRequired');
        return;
    }

    let success = false;
    if (isEditMode.value && props.tagToEdit) {
        // 调用更新 action
        if (nameToSubmit !== props.tagToEdit.name) { // 只有名称改变时才更新
             success = await tagsStore.updateTag(props.tagToEdit.id, nameToSubmit);
             if (!success) {
                 formError.value = t('tags.form.errorUpdate', { error: tagsStore.error || 'Unknown error' });
             }
        } else {
            success = true; // 名称未改变，视为成功
        }
    } else {
        // 调用添加 action
        success = await tagsStore.addTag(nameToSubmit);
        if (!success) {
            formError.value = t('tags.form.errorAdd', { error: tagsStore.error || 'Unknown error' });
        }
    }

    if (success) {
        emit('tag-saved'); // 发出保存成功事件
    }
};
</script>

<template>
    <div class="add-tag-form-overlay">
        <div class="add-tag-form">
            <h3>{{ formTitle }}</h3>
            <form @submit.prevent="handleSubmit">
                <div class="form-group">
                    <label for="tag-name">{{ t('tags.form.name') }}</label>
                    <input type="text" id="tag-name" v-model="tagName" required />
                </div>

                <div v-if="formError || tagsStore.error" class="error-message">
                    {{ formError || tagsStore.error }}
                </div>

                <div class="form-actions">
                    <button type="submit" :disabled="tagsStore.isLoading">
                        {{ submitButtonText }}
                    </button>
                    <button type="button" @click="emit('close')" :disabled="tagsStore.isLoading">
                        {{ t('tags.form.cancel') }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<style scoped>
/* 样式与 AddConnectionForm 类似，可以考虑提取公共样式 */
.add-tag-form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1001; /* 比 TagList 高一层 */
}

.add-tag-form {
  background-color: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  min-width: 300px;
  max-width: 400px;
}

h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  text-align: center;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: bold;
}

input[type="text"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.error-message {
  color: red;
  margin-bottom: 1rem;
  text-align: center;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.form-actions button {
  margin-left: 0.5rem;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
  border: none;
  border-radius: 4px;
}

.form-actions button[type="submit"] {
  background-color: #007bff;
  color: white;
}

.form-actions button[type="button"] {
  background-color: #ccc;
  color: #333;
}

.form-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
