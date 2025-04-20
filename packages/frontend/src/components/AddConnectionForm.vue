<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import apiClient from '../utils/apiClient'; // 修正导入路径和名称
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

// 测试连接状态
const testStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle');
const testResult = ref<string | number | null>(null); // 存储延迟或错误信息
const testLatency = ref<number | null>(null); // 单独存储延迟用于颜色计算

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

// 处理测试连接
const handleTestConnection = async () => {
  testStatus.value = 'testing';
  testResult.value = null;
  testLatency.value = null;

  try {
    let response;
    if (isEditMode.value && props.connectionToEdit) {
      // --- 编辑模式: 测试已保存的连接 ---
      console.log(`Testing saved connection ID: ${props.connectionToEdit.id}`);
      // 调用测试已保存连接的 API
      response = await apiClient.post(`/connections/${props.connectionToEdit.id}/test`);
    } else {
      // --- 添加模式: 测试未保存的连接 ---
      console.log("Testing unsaved connection data");
      // 准备要发送的数据
      const dataToSend = {
          host: formData.host,
          port: formData.port,
          username: formData.username,
          auth_method: formData.auth_method,
          password: formData.auth_method === 'password' ? formData.password : undefined,
          private_key: formData.auth_method === 'key' ? formData.private_key : undefined,
          passphrase: formData.auth_method === 'key' ? formData.passphrase : undefined,
          proxy_id: formData.proxy_id || null,
      };

      // 仅在添加模式下进行前端凭证验证
      if (!dataToSend.host || !dataToSend.port || !dataToSend.username || !dataToSend.auth_method) {
        // 使用 Error 抛出，由下面的 catch 块统一处理显示
        throw new Error(t('connections.test.errorMissingFields'));
      }
      // 在添加模式下，密码或密钥必须提供
      if (dataToSend.auth_method === 'password' && !formData.password) { // 检查 formData 而不是 dataToSend.password
         throw new Error(t('connections.form.errorPasswordRequired')); // 复用表单提交的翻译键
      }
      if (dataToSend.auth_method === 'key' && !formData.private_key) { // 检查 formData 而不是 dataToSend.private_key
         throw new Error(t('connections.form.errorPrivateKeyRequired')); // 复用表单提交的翻译键
      }

      // 调用测试未保存连接的 API
      response = await apiClient.post('/connections/test-unsaved', dataToSend);
    }

    // --- 处理 API 响应 (对两种模式通用) ---
    if (response.data.success) {
      testStatus.value = 'success';
      testLatency.value = response.data.latency; // 两个测试 API 现在都返回 latency
      testResult.value = `${response.data.latency} ms`;
    } else {
      // 如果后端 API 返回 success: false (理论上不应发生，但作为保险)
      testStatus.value = 'error';
      testResult.value = response.data.message || t('connections.test.errorUnknown');
    }

  } catch (error: any) {
    // --- 统一处理错误 (前端验证错误或 API 调用错误) ---
    console.error('测试连接失败:', error);
    testStatus.value = 'error';
    if (error.response && error.response.data && error.response.data.message) {
      // API 返回的错误信息
      testResult.value = error.response.data.message;
    } else {
      // 前端验证错误 (error.message) 或 网络/其他错误
      testResult.value = error.message || t('connections.test.errorNetwork');
    }
  }
};

// 计算延迟颜色
const latencyColor = computed(() => {
  if (testStatus.value !== 'success' || testLatency.value === null) {
    return 'inherit'; // 默认颜色
  }
  const latency = testLatency.value;
  if (latency < 100) return 'var(--color-success, #28a745)'; // 绿色
  if (latency < 500) return 'var(--color-warning, #ffc107)'; // 黄色
  return 'var(--color-danger, #dc3545)'; // 红色
});

// 计算测试按钮文本
const testButtonText = computed(() => {
    if (testStatus.value === 'testing') {
        return t('connections.form.testing'); // 新增翻译键
    }
    return t('connections.form.testConnection'); // 新增翻译键
});

</script>

<template>
  <div class="add-connection-form-overlay">
    <div class="add-connection-form">
      <h3>{{ formTitle }}</h3> <!-- 使用计算属性 -->
      <form @submit.prevent="handleSubmit">
         <div class="form-sections"> <!-- Container for sections -->

           <fieldset class="form-section">
             <legend>{{ t('connections.form.sectionBasic', '基本信息') }}</legend>
             <div class="form-group">
               <label for="conn-name">{{ t('connections.form.name') }} ({{ t('connections.form.optional') }})</label>
               <input type="text" id="conn-name" v-model="formData.name" />
             </div>
             <!-- Host and Port Row -->
             <div class="form-row">
               <div class="form-group form-group-host">
                 <label for="conn-host">{{ t('connections.form.host') }}</label>
                 <input type="text" id="conn-host" v-model="formData.host" required />
               </div>
               <div class="form-group form-group-port">
                 <label for="conn-port">{{ t('connections.form.port') }}</label>
                 <input type="number" id="conn-port" v-model.number="formData.port" required min="1" max="65535" />
               </div>
             </div>
           </fieldset>

           <fieldset class="form-section">
              <legend>{{ t('connections.form.sectionAuth', '认证方式') }}</legend>
              <!-- Username moved here -->
              <div class="form-group">
                <label for="conn-username">{{ t('connections.form.username') }}</label>
                <input type="text" id="conn-username" v-model="formData.username" required />
              </div>
              <!-- Auth Method -->
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
           </fieldset>

           <fieldset class="form-section">
             <legend>{{ t('connections.form.sectionAdvanced', '高级选项') }}</legend>
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
           </fieldset>

           <!-- Error message remains outside sections -->
           <div v-if="formError || storeError" class="error-message">
             {{ formError || storeError }}
           </div>

         </div> <!-- 结束 form-sections -->

         <div class="form-actions">
            <div class="test-action-area"> <!-- New container for button, icon, and result -->
                <div class="test-button-wrapper"> <!-- Container for button and icon -->
                    <button type="button" @click="handleTestConnection" :disabled="isLoading || testStatus === 'testing'">
                      {{ testButtonText }}
                    </button>
                    <span class="info-icon">?
                      <span class="tooltip-text">{{ t('connections.test.latencyTooltip') }}</span>
                    </span>
                </div>
                <!-- Test result moved below the button -->
                <div class="test-status-wrapper">
                    <div v-if="testStatus === 'testing'" class="test-status loading-small">
                      {{ t('connections.test.testingInProgress', '测试中...') }}
                    </div>
                    <div v-else-if="testStatus === 'success'" class="test-status success" :style="{ color: latencyColor }">
                      {{ testResult }}
                    </div>
                    <div v-else-if="testStatus === 'error'" class="test-status error">
                      {{ t('connections.test.errorPrefix', '错误:') }} {{ testResult }}
                    </div>
                </div>
            </div>
            <div class="main-actions">
                <button type="submit" :disabled="isLoading || testStatus === 'testing'">
                  {{ submitButtonText }}
                </button>
                <button type="button" @click="emit('close')" :disabled="isLoading || testStatus === 'testing'">{{ t('connections.form.cancel') }}</button>
            </div>
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
  min-width: 320px; /* 减小最小宽度 */
  max-width: 600px; /* 调回宽度 */
  width: 90vw;
  border: 1px solid var(--border-color, #ccc);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: calc(var(--base-padding, 1rem) * 1.5); /* 减少整体内边距 */
}

h3 {
  margin-top: 0;
  margin-bottom: calc(var(--base-margin, 0.5rem) * 2); /* 进一步减少标题下边距 */
  text-align: center;
  color: var(--text-color, #333);
  font-family: var(--font-family-sans-serif, sans-serif);
  font-size: 1.3em; /* 减小标题字号 */
  font-weight: 600;
  flex-shrink: 0;
  padding-bottom: calc(var(--base-padding, 1rem) * 0.3); /* 进一步减少标题和内容间距 */
}

/* 移除两列布局相关样式 (.two-columns, .form-column, .full-width-error) */

/* 新增：表单分段样式 */
.form-sections {
  flex-grow: 1; /* 占据主要空间 */
  overflow-y: auto; /* 使 sections 内部可滚动 */
  padding: 5px; /* 增加一点内边距防止滚动条遮挡 */
  margin: -5px; /* 抵消内边距 */
}

.form-section {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 5px; /* 稍小圆角 */
  padding: calc(var(--base-padding, 1rem) * 1); /* 进一步减少 fieldset 内边距 */
  margin-bottom: calc(var(--base-margin, 0.5rem) * 1.5); /* 进一步减少 fieldset 间距 */
}

.form-section legend {
  padding: 0 calc(var(--base-padding, 1rem) * 0.5); /* legend 左右内边距 */
  font-weight: 600; /* 加粗 legend */
  color: var(--text-color, #333);
  font-size: 1.05em; /* 减小 legend 字号 */
  margin-left: calc(var(--base-margin, 0.5rem) * 0.8); /* 减少 legend 左边距 */
}

/* 认证部分内部可以考虑两列，如果需要的话 */
/* .auth-section-content { display: flex; gap: 1rem; } */
/* .auth-section-content > * { flex: 1; } */


/* Host/Port 行样式 */
.form-row {
  display: flex;
  gap: calc(var(--base-padding, 1rem) * 1); /* Host 和 Port 之间的间距 */
  align-items: flex-start; /* 顶部对齐 */
}
.form-row .form-group {
  margin-bottom: 0; /* 移除行内元素的下边距，由行处理 */
}
.form-group-host {
  flex: 3; /* Host 占据更多空间 */
}
.form-group-port {
  flex: 1; /* Port 占据较少空间 */
}


.form-group {
  margin-bottom: calc(var(--base-margin, 0.5rem) * 1.2); /* 进一步减少组间距 */
}

label {
  display: block;
  margin-bottom: calc(var(--base-margin, 0.5rem) * 0.8); /* 调整标签下边距 */
  font-weight: 500;
  font-size: 0.9em; /* 减小标签字号 */
  color: var(--text-color-secondary, #666);
  font-family: var(--font-family-sans-serif, sans-serif);
  margin-bottom: calc(var(--base-margin, 0.5rem) * 0.5); /* 减少标签下边距 */
}

input[type="text"],
input[type="number"],
input[type="password"],
select,
textarea {
  width: 100%;
  padding: calc(var(--base-padding, 1rem) * 0.5); /* 减少输入框内边距 */
  border: 1px solid var(--border-color, #ccc);
  border-radius: 3px; /* 稍小圆角 */
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
    min-height: 50px; /* 进一步减小文本域最小高度 */
    resize: vertical;
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
  justify-content: space-between; /* 改为 space-between 对齐 */
  align-items: center; /* 垂直居中对齐 */
  margin-top: calc(var(--base-margin, 0.5rem) * 1.5); /* 减少顶部间距 */
  padding-top: calc(var(--base-padding, 1rem) * 0.8); /* 减少按钮上方间距 */
  border-top: 1px solid var(--border-color, #eee);
  flex-shrink: 0; /* 防止按钮区域压缩 */
  /* 确保按钮区域背景色，避免滚动内容透视 */
  background-color: var(--app-bg-color, white);
  padding-left: calc(var(--base-padding, 1rem) * 0.5);
  padding-right: calc(var(--base-padding, 1rem) * 0.5);
  padding-bottom: calc(var(--base-padding, 1rem) * 0.5);
  margin-left: calc(var(--base-padding, 1rem) * -0.5); /* 抵消容器内边距 */
  margin-right: calc(var(--base-padding, 1rem) * -0.5);
}

.main-actions button { /* 主操作按钮（保存/取消） */
  margin-left: calc(var(--base-margin, 0.5rem) * 0.8); /* 保持按钮间距 */
  padding: calc(var(--base-padding, 1rem) * 0.5) calc(var(--base-padding, 1rem) * 1.2);
  cursor: pointer;
  border-radius: 3px; /* 稍小圆角 */
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

/* 测试按钮、图标和结果的整体区域 */
.test-action-area {
    display: flex;
    flex-direction: column; /* 让结果显示在按钮下方 */
    align-items: flex-start; /* 左对齐 */
    gap: calc(var(--base-padding, 1rem) * 0.3); /* 按钮行和结果行之间的间距 */
}

/* 包裹测试按钮和信息图标的容器 */
.test-button-wrapper {
    display: flex;
    align-items: center;
    gap: calc(var(--base-padding, 1rem) * 0.5); /* 按钮和图标之间的间距 */
}

/* 信息图标样式 & Tooltip Container */
.info-icon {
    position: relative; /* Needed for absolute positioning of the tooltip text */
    cursor: help;
    color: var(--text-color-secondary, #666);
    font-size: 1.1em;
    line-height: 1;
    user-select: none;
    display: inline-block; /* Ensure it takes space for positioning */
}

/* Tooltip Text Style */
.tooltip-text {
    visibility: hidden; /* Hide by default */
    opacity: 0;
    position: absolute;
    bottom: 140%; /* Position above the icon */
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.85); /* Slightly darker background */
    color: white;
    padding: 8px 12px; /* Slightly more padding */
    border-radius: 5px; /* Slightly larger radius */
    font-size: 0.9em; /* Slightly larger font */
    white-space: pre-wrap; /* Allow line breaks */
    min-width: 180px; /* Adjust width as needed */
    max-width: 320px;
    text-align: left;
    z-index: 10;
    pointer-events: none; /* Prevent tooltip from blocking hover */
    transition: opacity 0.25s ease, visibility 0.25s ease; /* Slightly longer transition */
    box-shadow: 0 2px 5px rgba(0,0,0,0.2); /* Add subtle shadow */
}

/* Tooltip Arrow */
.tooltip-text::after {
    content: '';
    position: absolute;
    top: 100%; /* Position arrow at the bottom of the tooltip */
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px; /* Slightly larger arrow */
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.85) transparent transparent transparent;
}


/* Show tooltip on hover */
.info-icon:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
}

/* 测试按钮样式 (从之前的 .test-result-container button 移过来) */
.test-button-wrapper button {
  /* 测试按钮可以有自己的样式，或者继承 .form-actions button */
  padding: calc(var(--base-padding, 1rem) * 0.5) calc(var(--base-padding, 1rem) * 1.2);
  cursor: pointer;
  border-radius: 3px;
  font-family: var(--font-family-sans-serif, sans-serif);
  font-weight: 500;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  /* 可以给测试按钮一个不同的边框或背景色 */
  background-color: transparent;
  color: var(--text-color-secondary, #666);
  border: 1px solid var(--border-color, #ccc);
}
.test-result-container button:hover:not(:disabled) {
  background-color: var(--border-color, #eee);
  border-color: var(--text-color-secondary, #bbb);
  color: var(--text-color, #333);
}
.test-result-container button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 包裹测试状态文本的容器 */
.test-status-wrapper {
    min-height: 1.2em; /* 预留空间，防止布局跳动 */
    padding-left: 2px; /* 轻微缩进，与按钮对齐 */
}

.test-status {
  font-size: 0.9em;
  font-weight: 500;
  font-family: var(--font-family-sans-serif, sans-serif);
}

.test-status.loading-small {
  color: var(--text-color-secondary, #666);
}

.test-status.success {
  /* 颜色由 latencyColor 计算属性动态设置 */
}

.test-status.error {
  color: var(--color-danger, #dc3545); /* 红色 */
}

/* 主操作按钮容器 */
.main-actions {
    display: flex; /* 保持原有按钮布局 */
}

</style>
