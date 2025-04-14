<script setup lang="ts">
import { ref, reactive } from 'vue';
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
import { useI18n } from 'vue-i18n'; // 引入 useI18n
import { useConnectionsStore } from '../stores/connections.store';

// 定义组件发出的事件
const emit = defineEmits(['close', 'connection-added']);

const { t } = useI18n(); // 获取 t 函数
const connectionsStore = useConnectionsStore();
const { isLoading, error } = storeToRefs(connectionsStore); // 获取加载和错误状态

// 表单数据模型
const formData = reactive({
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
});

const formError = ref<string | null>(null); // 表单级别的错误信息

// 处理表单提交
const handleSubmit = async () => {
  formError.value = null; // 清除之前的错误

  // 基础前端验证 (可以添加更复杂的验证)
  if (!formData.name || !formData.host || !formData.username || !formData.password) {
    formError.value = t('connections.form.errorRequired');
    return;
  }
  if (formData.port <= 0 || formData.port > 65535) {
      formError.value = t('connections.form.errorPort');
      return;
  }

  const success = await connectionsStore.addConnection({
      name: formData.name,
      host: formData.host,
      port: formData.port,
      username: formData.username,
      password: formData.password,
  });

  if (success) {
    emit('connection-added'); // 通知父组件添加成功
  } else {
    // 如果 store action 返回 false，则显示 store 中的错误信息
    formError.value = t('connections.form.errorAdd', { error: connectionsStore.error || '未知错误' });
  }
};
</script>

<template>
  <div class="add-connection-form-overlay">
    <div class="add-connection-form">
      <h3>{{ t('connections.form.title') }}</h3>
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
        <div class="form-group">
          <label for="conn-password">{{ t('connections.form.password') }}</label>
          <input type="password" id="conn-password" v-model="formData.password" required />
          <!-- 提示：MVP 仅支持密码认证 -->
        </div>

        <div v-if="formError || error" class="error-message">
          {{ formError || error }} <!-- 保持显示具体错误 -->
        </div>

        <div class="form-actions">
          <button type="submit" :disabled="isLoading">
            {{ isLoading ? t('connections.form.adding') : t('connections.form.confirm') }}
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
input[type="password"] {
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
