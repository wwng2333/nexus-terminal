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
      <form @submit.prevent="handleSubmit"> <!-- 移除 form-content class -->
        <div class="form-fields two-columns"> <!-- 添加 two-columns class -->
          <!-- Column 1: Basic Info -->
          <div class="form-column">
            <div class="form-group">
              <label for="conn-name">{{ t('connections.form.name') }} ({{ t('connections.form.optional') }})</label>
              <input type="text" id="conn-name" v-model="formData.name" />
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
          </div>

          <!-- Column 2: Authentication, Proxy, Tags -->
          <div class="form-column">
            <div class="form-group">
              <label for="conn-auth-method">{{ t('connections.form.authMethod') }}</label>
              <select id="conn-auth-method" v-model="formData.auth_method">
                <option value="password">{{ t('connections.form.authMethodPassword') }}</option>
                <option value="key">{{ t('connections.form.authMethodKey') }}</option>
              </select>
            </div>

            <div class="form-group" v-if="formData.auth_method === 'password'">
              <label for="conn-password">{{ t('connections.form.password') }}</label>
              <input type="password" id="conn-password" v-model="formData.password" :required="formData.auth_method === 'password' && !isEditMode" />
            </div>

            <div v-if="formData.auth_method === 'key'">
              <div class="form-group">
                <label for="conn-private-key">{{ t('connections.form.privateKey') }}</label>
                <textarea id="conn-private-key" v-model="formData.private_key" rows="4" :required="formData.auth_method === 'key' && !isEditMode"></textarea>
              </div>
              <div class="form-group">
                <label for="conn-passphrase">{{ t('connections.form.passphrase') }} ({{ t('connections.form.optional') }})</label>
                <input type="password" id="conn-passphrase" v-model="formData.passphrase" />
              </div>
              <div class="form-group" v-if="isEditMode && formData.auth_method === 'key'">
                <small>{{ t('connections.form.keyUpdateNote') }}</small>
              </div>
            </div>

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

            <div class="form-group">
              <label>{{ t('connections.form.tags') }} ({{ t('connections.form.optional') }})</label>
              <TagInput v-model="formData.tag_ids" />
            </div>
          </div> <!-- End Column 2 -->

          <!-- Error message spans across columns -->
          <div v-if="formError || storeError" class="error-message full-width-error">
            {{ formError || storeError }}
          </div>
        </div> <!-- 结束 form-fields -->

        <div class="form-actions">
          <button type="submit" :disabled="isLoading">
            {{ submitButtonText }}
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
  background-color: rgba(0, 0, 0, 0.6); /* 加深背景 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000; /* Ensure it's on top */
}

.add-connection-form {
  background-color: var(--app-bg-color, white);
  color: var(--text-color, #333);
  padding: calc(var(--base-padding, 1rem) * 2);
  border-radius: 8px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25); /* 调整阴影 */
  min-width: 350px;
  max-width: 750px; /* 增加最大宽度以容纳两列 */
  width: 80vw; /* 宽度适应视口 */
  border: 1px solid var(--border-color, #ccc);
  /* 移除 max-height 和 flex 布局 */
}

h3 {
  margin-top: 0;
  margin-bottom: calc(var(--base-margin, 0.5rem) * 4); /* 增加标题下边距 */
  text-align: center;
  color: var(--text-color, #333);
  font-family: var(--font-family-sans-serif, sans-serif);
  font-size: 1.4em; /* 稍微增大标题字号 */
  font-weight: 600; /* 加粗标题 */
  flex-shrink: 0; /* 防止标题被压缩 */
  padding-bottom: calc(var(--base-padding, 1rem) * 1); /* 增加标题和内容间距 */
}

/* 移除 .form-content 滚动相关样式 */

/* 两列布局样式 */
.form-fields.two-columns {
  display: flex;
  flex-wrap: wrap; /* 允许换行，虽然主要目的是两列 */
  gap: calc(var(--base-padding, 1rem) * 2); /* 列之间的间距 */
}

.form-column {
  flex: 1; /* 每列占据可用空间 */
  min-width: 250px; /* 设置最小宽度，防止列过窄 */
}

/* 错误消息跨列 */
.full-width-error {
    width: 100%; /* 占据父容器（.two-columns）的全部宽度 */
    order: 99; /* 确保错误消息在列之后显示 */
    margin-top: var(--base-margin, 0.5rem); /* 与上方元素保持间距 */
}


.form-group {
  margin-bottom: calc(var(--base-margin, 0.5rem) * 2); /* 保持组间距 */
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
select,
textarea {
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
select:focus,
textarea:focus {
  outline: none; /* 移除默认 outline */
  border-color: var(--button-bg-color, #007bff); /* 聚焦时使用按钮背景色 (保持) */
  box-shadow: 0 0 5px var(--button-bg-color, #007bff); /* 恢复光晕效果并使用主题色 */
}

textarea {
    min-height: 60px; /* 减小文本域最小高度 */
    resize: vertical; /* 允许垂直调整大小 */
}

select {
    appearance: none; /* 移除默认下拉箭头 (可能需要自定义箭头) */
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e"); /* 添加自定义箭头 */
    background-repeat: no-repeat;
    background-position: right calc(var(--base-padding, 1rem) * 0.6) center;
    background-size: 16px 12px;
    padding-right: calc(var(--base-padding, 1rem) * 2); /* 为箭头腾出空间 */
}


 .loading-small, .info-small {
    font-size: 0.85em; /* 调整字号 */
    color: var(--text-color-secondary, #666);
    margin-top: calc(var(--base-margin, 0.5rem) * 0.5); /* 调整上边距 */
    font-family: var(--font-family-sans-serif, sans-serif);
}
.error-small {
    font-size: 0.85em; /* 调整字号 */
    color: red;
    margin-top: calc(var(--base-margin, 0.5rem) * 0.5); /* 调整上边距 */
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
  margin-top: calc(var(--base-margin, 0.5rem) * 2); /* 减少顶部间距 */
  padding-top: calc(var(--base-padding, 1rem) * 1); /* 在按钮上方增加间距 */
  border-top: 1px solid var(--border-color, #eee); /* 添加分隔线 */
  /* 移除 flex-shrink 和背景色、内外边距调整 */
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
