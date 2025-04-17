<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'; // 添加 onMounted
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProxiesStore, ProxyInfo } from '../stores/proxies.store';
import { useTagsStore } from '../stores/tags.store'; // 引入标签 Store
import TagInput from './TagInput.vue'; // 导入新的 TagInput 组件

// 定义组件发出的事件
const emit = defineEmits(['close', 'proxy-added', 'proxy-updated']);

// 定义 Props
const props = defineProps<{
  proxyToEdit: ProxyInfo | null; // 接收要编辑的代理对象
}>();

const { t } = useI18n();
const proxiesStore = useProxiesStore();
const tagsStore = useTagsStore(); // 获取标签 store 实例
const { isLoading, error: proxyStoreError } = storeToRefs(proxiesStore); // 重命名 error 避免冲突
const { isLoading: isTagLoading, error: tagStoreError } = storeToRefs(tagsStore); // 获取标签状态

// 表单数据模型
const initialFormData = {
  name: '',
  type: 'SOCKS5' as 'SOCKS5' | 'HTTP',
  host: '',
  port: 1080, // 默认 SOCKS5 端口
  username: '',
  password: '',
  tag_ids: [] as number[], // 新增 tag_ids 字段
};
const formData = reactive({ ...initialFormData });

const formError = ref<string | null>(null); // 表单级别的错误信息
// 合并加载和错误状态
const isCombinedLoading = computed(() => isLoading.value || isTagLoading.value);
const combinedStoreError = computed(() => proxyStoreError.value || tagStoreError.value);

// 计算属性判断是否为编辑模式
const isEditMode = computed(() => !!props.proxyToEdit);

// 计算属性动态设置表单标题
const formTitle = computed(() => {
    return isEditMode.value ? t('proxies.form.titleEdit') : t('proxies.form.title');
});

// 计算属性动态设置提交按钮文本
const submitButtonText = computed(() => {
    if (isLoading.value) {
        return isEditMode.value ? t('proxies.form.saving') : t('proxies.form.adding');
    }
    return isEditMode.value ? t('proxies.form.confirmEdit') : t('proxies.form.confirm');
});

// 监听 prop 变化以填充或重置表单
watch(() => props.proxyToEdit, (newVal) => {
    formError.value = null; // 清除错误
    if (newVal) {
        // 编辑模式：填充表单，但不填充密码
        formData.name = newVal.name;
        formData.type = newVal.type;
        formData.host = newVal.host;
        formData.port = newVal.port;
        formData.username = newVal.username ?? '';
        formData.password = ''; // 清空密码，要求用户重新输入以更新
    } else {
        // 添加模式：重置表单
        Object.assign(formData, initialFormData);
    }
}, { immediate: true });

// 处理表单提交
const handleSubmit = async () => {
  formError.value = null;
  proxiesStore.error = null;

  // 基础前端验证 (保持不变)
  if (!formData.name || !formData.host || !formData.port) {
    formError.value = t('proxies.form.errorRequiredFields');
    return;
  }
   if (formData.port <= 0 || formData.port > 65535) {
      formError.value = t('proxies.form.errorPort');
      return;
  }

  // 构建要发送的数据
  const dataToSend: any = {
      name: formData.name,
      type: formData.type,
      host: formData.host,
      port: formData.port,
      username: formData.username || null, // 如果为空字符串则发送 null
  };

  // 处理密码字段
  // 仅当用户输入新密码或在编辑模式下明确清空时才发送
  if (formData.password) {
      dataToSend.password = formData.password;
  } else if (isEditMode.value && formData.password === '') {
      dataToSend.password = null; // 发送 null 表示清空密码 (后端需要能处理 null)
  }
  // 如果是添加模式且密码为空，则不发送 password 字段

  let success = false;
  if (isEditMode.value && props.proxyToEdit) {
      success = await proxiesStore.updateProxy(props.proxyToEdit.id, dataToSend);
      if (success) {
          emit('proxy-updated');
      } else {
          formError.value = t('proxies.form.errorUpdate', { error: proxiesStore.error || '未知错误' });
      }
  } else {
      success = await proxiesStore.addProxy(dataToSend);
      if (success) {
          emit('proxy-added');
      } else {
          formError.value = t('proxies.form.errorAdd', { error: proxiesStore.error || '未知错误' });
      }
  }
};
</script>

<template>
  <div class="add-proxy-form-overlay">
    <div class="add-proxy-form">
      <h3>{{ formTitle }}</h3>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="proxy-name">{{ t('proxies.form.name') }}</label>
          <input type="text" id="proxy-name" v-model="formData.name" required />
        </div>
        <div class="form-group">
          <label for="proxy-type">{{ t('proxies.form.type') }}</label>
          <select id="proxy-type" v-model="formData.type">
            <option value="SOCKS5">SOCKS5</option>
            <option value="HTTP">HTTP</option>
          </select>
        </div>
        <div class="form-group">
          <label for="proxy-host">{{ t('proxies.form.host') }}</label>
          <input type="text" id="proxy-host" v-model="formData.host" required />
        </div>
        <div class="form-group">
          <label for="proxy-port">{{ t('proxies.form.port') }}</label>
          <input type="number" id="proxy-port" v-model.number="formData.port" required min="1" max="65535" />
        </div>
        <div class="form-group">
          <label for="proxy-username">{{ t('proxies.form.username') }} ({{ t('proxies.form.optional') }})</label>
          <input type="text" id="proxy-username" v-model="formData.username" />
        </div>
        <div class="form-group">
          <label for="proxy-password">{{ t('proxies.form.password') }} ({{ t('proxies.form.optional') }})</label>
          <input type="password" id="proxy-password" v-model="formData.password" />
            <small v-if="isEditMode">{{ t('proxies.form.passwordUpdateNote') }}</small>
         </div>

         <div v-if="formError || combinedStoreError" class="error-message">
           {{ formError || combinedStoreError }}
         </div>

        <div class="form-actions">
          <button type="submit" :disabled="isLoading">
            {{ submitButtonText }}
          </button>
          <button type="button" @click="emit('close')" :disabled="isLoading">{{ t('proxies.form.cancel') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 应用更详细的美化样式 */
.add-proxy-form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6); /* 加深背景 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.add-proxy-form {
  background-color: var(--app-bg-color, white);
  color: var(--text-color, #333);
  padding: calc(var(--base-padding, 1rem) * 2);
  border-radius: 8px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25); /* 调整阴影 */
  min-width: 350px; /* 稍微加宽 */
  max-width: 550px; /* 调整最大宽度 */
  border: 1px solid var(--border-color, #ccc);
}

h3 {
  margin-top: 0;
  margin-bottom: calc(var(--base-margin, 0.5rem) * 4); /* 增加标题下边距 */
  text-align: center;
  color: var(--text-color, #333);
  font-family: var(--font-family-sans-serif, sans-serif);
  font-size: 1.4em; /* 稍微增大标题字号 */
  font-weight: 600; /* 加粗标题 */
}

.form-group {
  margin-bottom: calc(var(--base-margin, 0.5rem) * 2.5); /* 增加组间距 */
}

label {
  display: block;
  margin-bottom: calc(var(--base-margin, 0.5rem) * 0.8); /* 调整标签下边距 */
  font-weight: 500; /* 调整标签字重 */
  font-size: 0.95em; /* 调整标签字号 */
  color: var(--text-color-secondary, #666); /* 使用次要文本颜色 */
  font-family: var(--font-family-sans-serif, sans-serif);
}

input[type="text"],
input[type="number"],
input[type="password"],
select {
  width: 100%;
  padding: calc(var(--base-padding, 1rem) * 0.6); /* 调整输入框内边距 */
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  box-sizing: border-box;
  background-color: var(--app-bg-color, white);
  color: var(--text-color, #333);
  font-family: var(--font-family-sans-serif, sans-serif);
  font-size: 1em; /* 确保字体大小 */
  transition: border-color 0.2s ease, box-shadow 0.2s ease; /* 添加过渡效果 */
}

input[type="text"]:focus,
input[type="number"]:focus,
input[type="password"]:focus,
select:focus {
  outline: none; /* 移除默认 outline */
  border-color: var(--button-bg-color, #007bff); /* 聚焦时使用按钮背景色 */
  box-shadow: 0 0 5px var(--button-bg-color, #007bff); /* 恢复光晕效果并使用主题色 */
}

select {
    appearance: none; /* 移除默认下拉箭头 (可能需要自定义箭头) */
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e"); /* 添加自定义箭头 */
    background-repeat: no-repeat;
    background-position: right calc(var(--base-padding, 1rem) * 0.6) center;
    background-size: 16px 12px;
    padding-right: calc(var(--base-padding, 1rem) * 2); /* 为箭头腾出空间 */
}

small {
    display: block;
    margin-top: calc(var(--base-margin, 0.5rem) * 0.5); /* 调整上边距 */
    font-size: 0.85em; /* 调整字号 */
    color: var(--text-color-secondary, #666);
    font-family: var(--font-family-sans-serif, sans-serif);
}

.error-message {
  color: red;
  margin-bottom: var(--base-margin, 0.5rem);
  text-align: center;
  font-family: var(--font-family-sans-serif, sans-serif);
  font-weight: 500; /* 加粗错误信息 */
  padding: calc(var(--base-padding, 1rem) * 0.5); /* 添加内边距 */
  background-color: rgba(255, 0, 0, 0.05); /* 添加淡红色背景 */
  border: 1px solid rgba(255, 0, 0, 0.2); /* 添加边框 */
  border-radius: 4px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: calc(var(--base-margin, 0.5rem) * 4); /* 增加顶部间距 */
  padding-top: calc(var(--base-padding, 1rem) * 1); /* 在按钮上方增加间距 */
  border-top: 1px solid var(--border-color, #eee); /* 添加分隔线 */
}

.form-actions button {
  margin-left: var(--base-margin, 0.5rem);
  padding: calc(var(--base-padding, 1rem) * 0.7) calc(var(--base-padding, 1rem) * 1.4); /* 调整按钮内边距 */
  cursor: pointer;
  border-radius: 4px;
  font-family: var(--font-family-sans-serif, sans-serif);
  font-weight: 500; /* 调整按钮字重 */
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; /* 添加过渡 */
}

.form-actions button[type="submit"] {
  background-color: var(--button-bg-color, #007bff);
  color: var(--button-text-color, white);
  border: 1px solid var(--button-bg-color, #007bff); /* 添加边框 */
}
.form-actions button[type="submit"]:hover:not(:disabled) {
  background-color: var(--button-hover-bg-color, #0056b3);
  border-color: var(--button-hover-bg-color, #0056b3); /* 同步边框色 */
}

.form-actions button[type="button"] {
  background-color: transparent; /* 取消按钮透明背景 */
  color: var(--text-color-secondary, #666); /* 使用次要文本颜色 */
  border: 1px solid var(--border-color, #ccc); /* 添加边框 */
}
.form-actions button[type="button"]:hover:not(:disabled) {
  background-color: var(--border-color, #eee); /* 悬停时淡灰色背景 */
  border-color: var(--text-color-secondary, #bbb); /* 悬停时边框变深 */
  color: var(--text-color, #333); /* 悬停时文本变深 */
}

.form-actions button:disabled {
  opacity: 0.5; /* 调整禁用透明度 */
  cursor: not-allowed;
}
</style>
