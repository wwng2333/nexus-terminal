<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useTagsStore, TagInfo } from '../stores/tags.store';

// 定义 Props
const props = defineProps<{
  tags: TagInfo[];
}>();

// 定义发出的事件
const emit = defineEmits(['edit-tag']);

const { t } = useI18n();
const tagsStore = useTagsStore();

// 处理删除标签
const handleDelete = async (tag: TagInfo) => {
    // 可以添加确认提示框
    if (confirm(t('tags.prompts.confirmDelete', { name: tag.name }))) {
        const success = await tagsStore.deleteTag(tag.id);
        if (!success) {
            // 可以显示错误提示，例如使用 alert 或更复杂的通知系统
            alert(t('tags.errors.deleteFailed', { error: tagsStore.error || 'Unknown error' }));
        }
        // 列表会在 store 内部刷新
    }
};

// 格式化时间戳 (可以提取为公共工具函数)
const formatDate = (timestamp: number) => {
    if (!timestamp) return t('tags.status.never');
    return new Date(timestamp * 1000).toLocaleString();
};
</script>

<template>
    <table class="tag-list-table">
        <thead>
            <tr>
                <th>{{ t('tags.table.name') }}</th>
                <th>{{ t('tags.table.updatedAt') }}</th>
                <th>{{ t('tags.table.actions') }}</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="tag in tags" :key="tag.id">
                <td>{{ tag.name }}</td>
                <td>{{ formatDate(tag.updated_at) }}</td>
                <td>
                    <button @click="emit('edit-tag', tag)" class="action-button edit-button">
                        {{ t('tags.actions.edit') }}
                    </button>
                    <button @click="handleDelete(tag)" class="action-button delete-button" :disabled="tagsStore.isLoading">
                        {{ t('tags.actions.delete') }}
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<style scoped>
.tag-list-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
}

th, td {
    border: 1px solid #ddd;
    padding: 0.8rem;
    text-align: left;
}

th {
    background-color: #f2f2f2;
}

.action-button {
    padding: 0.3rem 0.6rem;
    margin-right: 0.5rem;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    font-size: 0.9em;
}

.edit-button {
    background-color: #ffc107; /* Amber */
    color: #333;
}

.delete-button {
    background-color: #dc3545; /* Red */
    color: white;
}

.action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
