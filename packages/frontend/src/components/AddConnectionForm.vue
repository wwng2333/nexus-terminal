<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'; // 引入 onMounted
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store';
import { useProxiesStore } from '../stores/proxies.store'; // 引入代理 Store
import { useTagsStore } from '../stores/tags.store'; // 引入标签 Store
import TagInput from './TagInput.vue'; // 导入新的 TagInput 组件

// 定义组件发出的事件
const emit = defineEmits(['close', 'connection-added', 'connection-updated']);

// 定义 Props
const props = defineProps<{
  connectionToEdit: ConnectionInfo | null; // 接收要编辑的连接对象
}>();

const { t } = useI18n();
const connectionsStore = useConnectionsStore();
const proxiesStore = useProxiesStore(); // 获取代理 store 实例
const tagsStore = useTagsStore(); // 获取标签 store 实例
const { isLoading: isConnLoading, error: connStoreError } = storeToRefs(connectionsStore);
const { proxies, isLoading: isProxyLoading, error: proxyStoreError } = storeToRefs(proxiesStore); // 获取代理列表和状态
const { tags, isLoading: isTagLoading, error: tagStoreError } = storeToRefs(tagsStore); // 获取标签列表和状态

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
  proxy_id: null as number | null,
  tag_ids: [] as number[], // 新增 tag_ids 字段
};
const formData = reactive({ ...initialFormData });

const formError = ref<string | null>(null); // 表单级别的错误信息
// 合并所有 store 的加载和错误状态
const isLoading = computed(() => isConnLoading.value || isProxyLoading.value || isTagLoading.value);
const storeError = computed(() => connStoreError.value || proxyStoreError.value || tagStoreError.value);

// 计算属性判断是否为编辑模式
const isEditMode = computed(() => !!props.connectionToEdit);

// 计算属性动态设置表单标题
const formTitle = computed(() => {
    return isEditMode.value ? t('connections.form.titleEdit') : t('connections.form.title');
});

// 计算属性动态设置提交按钮文本
const submitButtonText = computed(() => {
    // 使用合并后的 isLoading
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
        formData.proxy_id = newVal.proxy_id ?? null;
        formData.tag_ids = newVal.tag_ids ? [...newVal.tag_ids] : []; // 填充 tag_ids (深拷贝)
        // 清空敏感字段
        formData.password = '';
        formData.private_key = '';
        formData.passphrase = '';
    } else {
        // 添加模式：重置表单
        Object.assign(formData, initialFormData);
    }
}, { immediate: true });

// 组件挂载时获取代理和标签列表
onMounted(() => {
    proxiesStore.fetchProxies();
    tagsStore.fetchTags(); // 获取标签列表
});

// 处理表单提交
const handleSubmit = async () => {
  formError.value = null;
  connectionsStore.error = null;
  proxiesStore.error = null; // 同时清除代理 store 的错误

  // 基础前端验证 (移除名称验证)
  if (!formData.host || !formData.username) { // 移除 !formData.name
    formError.value = t('connections.form.errorRequiredFields'); // 保持通用错误消息，或可以细化
    return;
  }
  if (formData.port <= 0 || formData.port > 65535) {
      formError.value = t('connections.form.errorPort');
      return;
  }

  // --- 更新后的验证逻辑 ---
  // 1. 添加模式下，密码/密钥是必填的
  if (!isEditMode.value) {
      if (formData.auth_method === 'password' && !formData.password) {
          formError.value = t('connections.form.errorPasswordRequired');
          return;
      }
      if (formData.auth_method === 'key' && !formData.private_key) {
          formError.value = t('connections.form.errorPrivateKeyRequired');
          return;
      }
  }
  // 2. 编辑模式下，如果切换到密码认证，则密码必填
  else if (isEditMode.value && formData.auth_method === 'password' && !formData.password) {
      // 检查原始连接的认证方式，如果原始不是密码，则切换时必须提供密码
      if (props.connectionToEdit?.auth_method !== 'password') {
          formError.value = t('connections.form.errorPasswordRequiredOnSwitch'); // 新增翻译键
          return;
      }
      // 如果原始就是密码，编辑时密码可以不填（表示不修改）
  }
  // 3. 编辑模式下，如果切换到密钥认证，则私钥必填
  else if (isEditMode.value && formData.auth_method === 'key' && !formData.private_key) {
       // 检查原始连接的认证方式，如果原始不是密钥，则切换时必须提供私钥
       if (props.connectionToEdit?.auth_method !== 'key') {
           formError.value = t('connections.form.errorPrivateKeyRequiredOnSwitch'); // 新增翻译键
           return;
       }
       // 如果原始就是密钥，编辑时私钥可以不填（表示不修改）
  }
  // --- 验证逻辑结束 ---


  // 构建要发送的数据 (区分添加和编辑)
  const dataToSend: any = {
      name: formData.name,
      host: formData.host,
      port: formData.port,
      username: formData.username,
      auth_method: formData.auth_method,
      proxy_id: formData.proxy_id || null,
      tag_ids: formData.tag_ids || [], // 发送 tag_ids
  };

  // 处理敏感字段
  if (formData.auth_method === 'password') {
      // 仅当用户输入新密码或在编辑模式下明确清空时才发送
      if (formData.password) {
          dataToSend.password = formData.password;
      } else if (isEditMode.value && formData.password === '') {
          dataToSend.password = null; // 发送 null 表示清空密码 (后端需要能处理 null)
      }
  } else if (formData.auth_method === 'key') {
      // 仅当用户输入新私钥时才发送
      if (formData.private_key) {
          dataToSend.private_key = formData.private_key;
      }
      // 仅当用户输入新密码短语或在编辑模式下明确清空时才发送
      if (formData.passphrase) {
          dataToSend.passphrase = formData.passphrase;
      } else if (isEditMode.value && formData.passphrase === '') {
          dataToSend.passphrase = null; // 发送 null 表示清空密码短语
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
          <label for="conn-name">{{ t('connections.form.name') }} ({{ t('connections.form.optional') }})</label> <!-- 添加可选提示 -->
          <input type="text" id="conn-name" v-model="formData.name" /> <!-- 移除 required -->
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
          <!-- 编辑模式下非必填 -->
          <input type="password" id="conn-password" v-model="formData.password" :required="formData.auth_method === 'password' && !isEditMode" />
        </div>

        <!-- 密钥输入 (条件渲染) -->
        <div v-if="formData.auth_method === 'key'">
            <div class="form-group">
                <label for="conn-private-key">{{ t('connections.form.privateKey') }}</label>
                <!-- 编辑模式下非必填 -->
                <textarea id="conn-private-key" v-model="formData.private_key" rows="6" :required="formData.auth_method === 'key' && !isEditMode"></textarea>
            </div>
            <div class="form-group">
                <label for="conn-passphrase">{{ t('connections.form.passphrase') }} ({{ t('connections.form.optional') }})</label>
                <input type="password" id="conn-passphrase" v-model="formData.passphrase" />
            </div>
             <div class="form-group" v-if="isEditMode && formData.auth_method === 'key'">
                 <small>{{ t('connections.form.keyUpdateNote') }}</small>
             </div>
        </div>

        <!-- 新增：代理选择 -->
        <div class="form-group">
            <label for="conn-proxy">{{ t('connections.form.proxy') }} ({{ t('connections.form.optional') }})</label>
            <select id="conn-proxy" v-model="formData.proxy_id">
                <option :value="null">{{ t('connections.form.noProxy') }}</option>
                <option v-for="proxy in proxies" :key="proxy.id" :value="proxy.id">
                    {{ proxy.name }} ({{ proxy.type }} - {{ proxy.host }}:{{ proxy.port }})
                </option>
            </select>
             <div v-if="isProxyLoading" class="loading-small">{{ t('proxies.loading') }}</div>
              <div v-if="proxyStoreError" class="error-small">{{ t('proxies.error', { error: proxyStoreError }) }}</div>
         </div>

         <!-- 新增：标签选择 (使用新组件) -->
         <div class="form-group">
             <label>{{ t('connections.form.tags') }} ({{ t('connections.form.optional') }})</label>
             <TagInput v-model="formData.tag_ids" />
             <!-- TagInput 组件内部会处理加载和错误状态 -->
         </div>

         <!-- 显示 storeError 或 formError -->
         <div v-if="formError || storeError" class="error-message">
          {{ formError || storeError }} <!-- 使用合并后的 storeError -->
        </div>

        <div class="form-actions">
          <button type="submit" :disabled="isLoading"> <!-- 使用合并后的 isLoading -->
            {{ submitButtonText }}
          </button>
          <button type="button" @click="emit('close')" :disabled="isLoading">{{ t('connections.form.cancel') }}</button> <!-- 使用合并后的 isLoading -->
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

 /* 移除旧的标签选择样式 */
 /* .tag-checkbox-group ... */
 /* .tag-checkbox-label ... */

 .loading-small, .error-small, .info-small {
    font-size: 0.9em;
    color: #666;
    margin-top: 0.2rem;
}
.error-small {
    color: red;
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
