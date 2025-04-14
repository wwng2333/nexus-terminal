<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'; // 引入 watch 和 computed
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo

// 定义组件发出的事件 (添加 connection-updated)
const emit = defineEmits(['close', 'connection-added', 'connection-updated']);

// 定义 Props
const props = defineProps<{
  connectionToEdit: ConnectionInfo | null; // 接收要编辑的连接对象
}>();

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const { isLoading, error: storeError } = storeToRefs(connectionsStore); // 重命名 error 避免冲突

// 表单数据模型
const initialFormData = {
  name: '',
  host: '',
  port: 22,
  username: '',
  auth_method: 'password' as 'password' | 'key',
  password: '',
  private_key: '',
  passphrase: '',
};
const formData = reactive({ ...initialFormData });

const formError = ref<string | null>(null); // 表单级别的错误信息

// 计算属性判断是否为编辑模式
const isEditMode = computed(() => !!props.connectionToEdit);

// 计算属性动态设置表单标题
const formTitle = computed(() => {
    return isEditMode.value ? t('connections.form.titleEdit') : t('connections.form.title');
});

// 计算属性动态设置提交按钮文本
const submitButtonText = computed(() => {
    if (isLoading.value) {
        return isEditMode.value ? t('connections.form.saving') : t('connections.form.adding');
    }
    return isEditMode.value ? t('connections.form.confirmEdit') : t('connections.form.confirm');
});

// 监听 prop 变化以填充或重置表单
watch(() => props.connectionToEdit, (newVal) => {
    formError.value = null; // 清除错误
    if (newVal) {
        // 编辑模式：填充表单，但不填充敏感信息
        formData.name = newVal.name;
        formData.host = newVal.host;
        formData.port = newVal.port;
        formData.username = newVal.username;
        formData.auth_method = newVal.auth_method;
        // 清空敏感字段，要求用户重新输入以更新
        formData.password = '';
        formData.private_key = '';
        formData.passphrase = '';
    } else {
        // 添加模式：重置表单
        Object.assign(formData, initialFormData);
    }
}, { immediate: true }); // immediate: true 确保初始加载时也执行

// 处理表单提交
const handleSubmit = async () => {
  formError.value = null; // 清除之前的错误
  connectionsStore.error = null; // 清除 store 中的旧错误

  // 基础前端验证 (保持不变)
  if (!formData.name || !formData.host || !formData.username) {
    formError.value = t('connections.form.errorRequiredFields'); // 更通用的错误消息
    return;
  }
  if (formData.port <= 0 || formData.port > 65535) {
      formError.value = t('connections.form.errorPort');
      return;
  }
  // 根据认证方式验证特定字段
  if (formData.auth_method === 'password' && !formData.password) {
      formError.value = t('connections.form.errorPasswordRequired');
      return;
  }
  if (formData.auth_method === 'key' && !formData.private_key) {
      formError.value = t('connections.form.errorPrivateKeyRequired');
      return;
  }

  // 构建要发送的数据 (区分添加和编辑)
  const dataToSend: any = {
      name: formData.name,
      host: formData.host,
      port: formData.port,
      username: formData.username,
      auth_method: formData.auth_method,
  };

  // 只有当用户输入了新的密码/密钥时才包含它们
  if (formData.auth_method === 'password' && formData.password) {
      dataToSend.password = formData.password;
  } else if (formData.auth_method === 'key') {
      if (formData.private_key) { // 只有输入了新私钥才发送
          dataToSend.private_key = formData.private_key;
      }
      if (formData.passphrase) { // 只有输入了新密码短语才发送
          dataToSend.passphrase = formData.passphrase;
      } else if (isEditMode.value && formData.private_key && !formData.passphrase) {
          // 如果是编辑模式，输入了新私钥但清空了密码短语，需要显式发送空字符串或 null
          // 取决于后端如何处理清空密码短语。假设发送空字符串。
          dataToSend.passphrase = '';
      }
  }

  let success = false;
  if (isEditMode.value && props.connectionToEdit) {
      // 调用更新 action
      success = await connectionsStore.updateConnection(props.connectionToEdit.id, dataToSend);
      if (success) {
          emit('connection-updated'); // 发出更新成功事件
      } else {
          formError.value = t('connections.form.errorUpdate', { error: connectionsStore.error || '未知错误' });
      }
  } else {
      // 调用添加 action
      success = await connectionsStore.addConnection(dataToSend);
      if (success) {
          emit('connection-added'); // 发出添加成功事件
      } else {
          formError.value = t('connections.form.errorAdd', { error: connectionsStore.error || '未知错误' });
      }
  }
};
</script>

<template>
  <div class="add-connection-form-overlay">
    <div class="add-connection-form">
      <h3>{{ formTitle }}</h3> <!-- 使用计算属性 -->
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="conn-name">{{ t('connections.form.name') }}</label>
          <input type="text" id="conn-name" v-model="formData.name" required />
        </div>
        <div class="form-group">
          <label for="conn-host">{{ t('connections.form.host') }}</label>
          <input type="text" id="conn-host" v-model="formData.host" required />
        </div>
        <div class="form-group">
          <label for="conn-port">{{ t('connections.form.port') }}</label>
          <input type="number" id="conn-port" v-model.number="formData.port" required min="1" max="65535" />
        </div>
        <div class="form-group">
          <label for="conn-username">{{ t('connections.form.username') }}</label>
          <input type="text" id="conn-username" v-model="formData.username" required />
        </div>

        <!-- 认证方式选择 -->
        <div class="form-group">
            <label for="conn-auth-method">{{ t('connections.form.authMethod') }}</label>
            <select id="conn-auth-method" v-model="formData.auth_method">
                <option value="password">{{ t('connections.form.authMethodPassword') }}</option>
                <option value="key">{{ t('connections.form.authMethodKey') }}</option>
            </select>
        </div>

        <!-- 密码输入 (条件渲染) -->
        <div class="form-group" v-if="formData.auth_method === 'password'">
          <label for="conn-password">{{ t('connections.form.password') }}</label>
          <input type="password" id="conn-password" v-model="formData.password" :required="formData.auth_method === 'password'" />
        </div>

        <!-- 密钥输入 (条件渲染) -->
        <div v-if="formData.auth_method === 'key'">
            <div class="form-group">
                <label for="conn-private-key">{{ t('connections.form.privateKey') }}</label>
                <textarea id="conn-private-key" v-model="formData.private_key" rows="6" :required="formData.auth_method === 'key'"></textarea>
            </div>
            <div class="form-group">
                <label for="conn-passphrase">{{ t('connections.form.passphrase') }} ({{ t('connections.form.optional') }})</label>
                <input type="password" id="conn-passphrase" v-model="formData.passphrase" />
            </div>
             <div class="form-group" v-if="isEditMode && formData.auth_method === 'key'">
                 <small>{{ t('connections.form.keyUpdateNote') }}</small>
             </div>
        </div>

        <!-- 显示 storeError 或 formError -->
        <div v-if="formError || storeError" class="error-message">
          {{ formError || storeError }}
        </div>

        <div class="form-actions">
          <button type="submit" :disabled="isLoading">
            {{ submitButtonText }} <!-- 使用计算属性 -->
          </button>
          <button type="button" @click="emit('close')" :disabled="isLoading">{{ t('connections.form.cancel') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.add-connection-form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* Ensure it's on top */
}

.add-connection-form {
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
select,
textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box; /* Include padding and border in element's total width and height */
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
