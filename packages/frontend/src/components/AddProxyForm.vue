<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProxiesStore, ProxyInfo } from '../stores/proxies.store';

// 定义组件发出的事件
const emit = defineEmits(['close', 'proxy-added', 'proxy-updated']);

// 定义 Props
const props = defineProps<{
  proxyToEdit: ProxyInfo | null; // 接收要编辑的代理对象
}>();

const { t } = useI18n();
const proxiesStore = useProxiesStore();
const { isLoading, error: storeError } = storeToRefs(proxiesStore);

// 表单数据模型
const initialFormData = {
  name: '',
  type: 'SOCKS5' as 'SOCKS5' | 'HTTP',
  host: '',
  port: 1080, // 默认 SOCKS5 端口
  username: '',
  password: '',
};
const formData = reactive({ ...initialFormData });

const formError = ref<string | null>(null); // 表单级别的错误信息

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

        <div v-if="formError || storeError" class="error-message">
          {{ formError || storeError }}
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
/* 样式可以复用 AddConnectionForm 的，或者根据需要调整 */
.add-proxy-form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.add-proxy-form {
  background-color: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  min-width: 300px;
  max-width: 500px;
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

input[type="text"],
input[type="number"],
input[type="password"],
select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

small {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.8em;
    color: #666;
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
