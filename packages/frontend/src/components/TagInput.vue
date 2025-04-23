<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useTagsStore, TagInfo } from '../stores/tags.store';

const props = defineProps<{
  modelValue: number[]; // 接收选中的 tag_ids
}>();

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const tagsStore = useTagsStore();
const { tags, isLoading, error } = storeToRefs(tagsStore);

const inputValue = ref(''); // 输入框的值
const inputRef = ref<HTMLInputElement | null>(null); // 输入框引用
const showSuggestions = ref(false); // 是否显示建议列表
const selectedTagIds = ref<number[]>([]); // 本地维护选中的 tag_ids

// 监听 props.modelValue 的变化，同步到本地 selectedTagIds
watch(() => props.modelValue, (newVal) => {
  // 只有在值确实不同的情况下才更新，避免无限循环
  if (JSON.stringify(newVal.sort()) !== JSON.stringify(selectedTagIds.value.sort())) {
    selectedTagIds.value = [...newVal];
  }
}, { immediate: true, deep: true });

// 监听本地 selectedTagIds 的变化，通知父组件
watch(selectedTagIds, (newVal) => {
  // 只有在值确实不同的情况下才更新，避免无限循环
  if (JSON.stringify(newVal.sort()) !== JSON.stringify(props.modelValue.sort())) {
    emit('update:modelValue', [...newVal]);
  }
}, { deep: true });


// 计算属性：所有标签的 Map，方便通过 ID 查找
const tagsMap = computed(() => {
  const map = new Map<number, TagInfo>();
  tags.value.forEach(tag => map.set(tag.id, tag));
  return map;
});

// 计算属性：已选中的标签对象
const selectedTags = computed(() => {
  // 确保先从 map 中查找，再过滤掉未找到的 (可能标签已被删除)
  return selectedTagIds.value
    .map(id => tagsMap.value.get(id))
    .filter((tag): tag is TagInfo => tag !== undefined);
});

// 计算属性：过滤后的建议列表
const suggestions = computed(() => {
  if (!showSuggestions.value) { // 仅在需要显示时计算
    return [];
  }
  let result: TagInfo[];
  // 如果输入框为空，显示所有未选中的标签
  if (!inputValue.value) {
    result = tags.value.filter(tag => !selectedTagIds.value.includes(tag.id));
  } else {
    const lowerCaseInput = inputValue.value.toLowerCase();
    result = tags.value.filter(tag =>
      tag.name.toLowerCase().includes(lowerCaseInput) &&
      !selectedTagIds.value.includes(tag.id) // 排除已选中的
    );
  }
  return result;
});

// 处理输入框聚焦
const handleFocus = async () => {
  showSuggestions.value = false; // 在异步操作前显式设置为 false
  // 1. 首先获取最新的标签
  await tagsStore.fetchTags();

  // 2. 基于更新后的标签列表和当前输入值，计算出实际可以显示的建议标签
  //    (这部分逻辑与 computed 'suggestions' 类似，但不依赖 showSuggestions.value)
  let potentialSuggestions: TagInfo[];
  const currentInput = inputValue.value; // 获取当前输入框的值
  // 过滤掉已选中的标签
  const availableTags = tags.value.filter(tag => !selectedTagIds.value.includes(tag.id));

  if (!currentInput) {
    // 如果输入框为空，所有未选中的标签都是潜在建议
    potentialSuggestions = availableTags;
  } else {
    // 如果输入框有值，则根据输入值过滤可用标签
    const lowerCaseInput = currentInput.toLowerCase();
    potentialSuggestions = availableTags.filter(tag =>
      tag.name.toLowerCase().includes(lowerCaseInput)
    );
  }

  // 3. 只有当确实存在潜在建议时，才显示建议列表
  const shouldShow = potentialSuggestions.length > 0;
  showSuggestions.value = shouldShow; // 最终状态由计算结果决定
};

// 处理输入框失焦
const handleBlur = () => {
  // 立即隐藏菜单，无需延迟
  showSuggestions.value = false;
};

// 处理键盘事件 (Enter 创建, Backspace 删除)
const handleKeyDown = async (event: KeyboardEvent) => {
  if (event.key === 'Enter' && inputValue.value.trim()) {
    event.preventDefault(); // 阻止表单提交等默认行为
    const trimmedInput = inputValue.value.trim();
    const lowerCaseInput = trimmedInput.toLowerCase();
    const existingTag = tags.value.find(tag => tag.name.toLowerCase() === lowerCaseInput);

    if (existingTag && !selectedTagIds.value.includes(existingTag.id)) {
      // 如果是现有标签且未选中，则选中它
      selectTag(existingTag);
    } else if (!existingTag) {
      // 如果是新标签，则创建并选中
      const success = await tagsStore.addTag(trimmedInput);
      if (success) {
        // addTag 内部会 fetchTags, store 会更新
        // 需要等待 DOM 更新和 store 更新完成
        await nextTick(); // 等待 store 更新
        const newTag = tags.value.find(tag => tag.name === trimmedInput); // 再次查找确保获取到 ID
        if (newTag) {
          selectTag(newTag);
        }
      }
    }
    inputValue.value = ''; // 清空输入框
    showSuggestions.value = false; // 创建或选择后隐藏建议
  } else if (event.key === 'Backspace' && !inputValue.value && selectedTagIds.value.length > 0) {
    // 如果输入框为空且按了退格键，则移除最后一个选中的标签 (仅从当前选择移除)
    removeTagLocally(selectedTags.value[selectedTags.value.length - 1]);
  }
};

// 选中一个标签 (来自建议列表或 Enter 创建)
const selectTag = (tag: TagInfo) => {
  if (!selectedTagIds.value.includes(tag.id)) {
    // 使用 .push() 来触发 watch
    const updatedIds = [...selectedTagIds.value, tag.id];
    selectedTagIds.value = updatedIds;
  }
  inputValue.value = ''; // 清空输入框
  showSuggestions.value = false; // 选择后隐藏建议
  inputRef.value?.focus(); // 重新聚焦输入框
};

// 仅从本地选择中移除一个标签 (点击选中标签的 'x' 或 Backspace)
const removeTagLocally = (tagToRemove: TagInfo) => {
  selectedTagIds.value = selectedTagIds.value.filter(id => id !== tagToRemove.id);
};

// 处理全局删除标签 (点击标签上的 'x' 图标) - 这是全局删除
const handleDeleteTagGlobally = async (tagToDelete: TagInfo) => {
    // 弹出确认框，防止误删
    if (confirm(t('tags.prompts.confirmDelete', { name: tagToDelete.name }))) {
        const success = await tagsStore.deleteTag(tagToDelete.id);
        if (success) {
            // deleteTag 内部会 fetchTags, store 会更新
            // selectedTagIds 会因为 watch props.modelValue 而自动更新 (如果父组件也更新了)
            // 或者手动从 selectedTagIds 中移除 (更保险)
            removeTagLocally(tagToDelete);
            // 可选：显示成功提示
        } else {
            // 可选：显示错误提示
            alert(t('tags.errorDelete', { error: tagsStore.error || '未知错误' }));
        }
    }
};

</script>

<template>
  <div class="relative w-full">
    <div class="flex flex-wrap items-center gap-1 p-1.5 border border-border rounded cursor-text bg-background" @click="inputRef?.focus()">
       <div class="inline-flex flex-wrap gap-1">
          <span v-for="tag in selectedTags" :key="tag.id" class="inline-flex items-center bg-background-alt text-foreground text-sm px-2 py-0.5 rounded whitespace-nowrap border border-border">
            {{ tag.name }}
            <button
              type="button"
              class="ml-1.5 p-0 bg-transparent border-none cursor-pointer text-text-secondary hover:text-foreground text-lg leading-none"
              @click.stop="removeTagLocally(tag)"
              :title="t('tags.removeSelection')"
            >&times;</button>
            <button
              type="button"
              class="ml-1 p-0 bg-transparent border-none cursor-pointer text-text-alt hover:text-error text-xs leading-none"
              @click.stop="handleDeleteTagGlobally(tag)"
              :title="t('tags.deleteTagGlobally')"
            >
              <i class="fas fa-trash-alt"></i>
            </button>
          </span>
       </div>
      <input
        ref="inputRef"
        type="text"
        class="flex-grow border-none outline-none p-0.5 text-sm min-w-[100px] bg-transparent"
        v-model="inputValue"
        :placeholder="t('tags.inputPlaceholder')"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeyDown"
        autocomplete="off"
      />
    </div>
    <ul v-if="showSuggestions && suggestions.length > 0" class="absolute top-full left-0 right-0 mt-0.5 bg-background border border-border rounded-b shadow-md list-none p-0 m-0 max-h-[150px] overflow-y-auto z-10">
      <li
        v-for="suggestion in suggestions"
        :key="suggestion.id"
        class="px-3 py-1.5 cursor-pointer hover:bg-hover text-sm"
        @mousedown.prevent="selectTag(suggestion)"
      >
        {{ suggestion.name }}
      </li>
    </ul>
    <div v-if="isLoading" class="absolute bottom-[-1.5em] left-0 text-xs text-text-secondary mt-1">{{ t('tags.loading') }}</div>
    <div v-if="error" class="absolute bottom-[-1.5em] left-0 text-xs text-error mt-1">{{ t('tags.error', { error: error }) }}</div>
  </div>
</template>

