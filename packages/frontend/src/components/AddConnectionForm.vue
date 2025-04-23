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
  <div class="fixed inset-0 bg-overlay flex justify-center items-center z-50 p-4"> <!-- Overlay -->
    <div class="bg-background text-foreground p-6 rounded-lg shadow-xl border border-border w-full max-w-2xl max-h-[90vh] flex flex-col"> <!-- Form Panel -->
      <h3 class="text-xl font-semibold text-center mb-6 flex-shrink-0">{{ formTitle }}</h3> <!-- Title -->
      <form @submit.prevent="handleSubmit" class="flex-grow overflow-y-auto pr-2 space-y-6"> <!-- Form with scroll and spacing -->

        <!-- Basic Info Section -->
        <div class="space-y-4 p-4 border border-border rounded-md bg-header/30">
          <h4 class="text-base font-semibold mb-3 pb-2 border-b border-border/50">{{ t('connections.form.sectionBasic', '基本信息') }}</h4>
          <div>
            <label for="conn-name" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.name') }} ({{ t('connections.form.optional') }})</label>
            <input type="text" id="conn-name" v-model="formData.name"
                   class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </div>
          <!-- Host and Port Row -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="md:col-span-2">
              <label for="conn-host" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.host') }}</label>
              <input type="text" id="conn-host" v-model="formData.host" required
                     class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
            </div>
            <div>
              <label for="conn-port" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.port') }}</label>
              <input type="number" id="conn-port" v-model.number="formData.port" required min="1" max="65535"
                     class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
            </div>
          </div>
        </div>

        <!-- Authentication Section -->
        <div class="space-y-4 p-4 border border-border rounded-md bg-header/30">
           <h4 class="text-base font-semibold mb-3 pb-2 border-b border-border/50">{{ t('connections.form.sectionAuth', '认证方式') }}</h4>
           <div>
             <label for="conn-username" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.username') }}</label>
             <input type="text" id="conn-username" v-model="formData.username" required
                    class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
           </div>
           <div>
             <label for="conn-auth-method" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.authMethod') }}</label>
             <select id="conn-auth-method" v-model="formData.auth_method"
                     class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none bg-no-repeat bg-right pr-8"
                     style="background-image: url('data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%236c757d\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M2 5l6 6 6-6\'/%3e%3c/svg%3e'); background-position: right 0.75rem center; background-size: 16px 12px;">
               <option value="password">{{ t('connections.form.authMethodPassword') }}</option>
               <option value="key">{{ t('connections.form.authMethodKey') }}</option>
             </select>
           </div>

           <div v-if="formData.auth_method === 'password'">
             <label for="conn-password" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.password') }}</label>
             <input type="password" id="conn-password" v-model="formData.password" :required="formData.auth_method === 'password' && !isEditMode" autocomplete="new-password"
                    class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
           </div>

           <div v-if="formData.auth_method === 'key'" class="space-y-4">
             <div>
               <label for="conn-private-key" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.privateKey') }}</label>
               <textarea id="conn-private-key" v-model="formData.private_key" rows="4" :required="formData.auth_method === 'key' && !isEditMode"
                         class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono text-sm"></textarea>
             </div>
             <div>
               <label for="conn-passphrase" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.passphrase') }} ({{ t('connections.form.optional') }})</label>
               <input type="password" id="conn-passphrase" v-model="formData.passphrase" autocomplete="new-password"
                      class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
             </div>
             <div v-if="isEditMode && formData.auth_method === 'key'">
               <small class="block text-xs text-text-secondary">{{ t('connections.form.keyUpdateNote') }}</small>
             </div>
           </div>
        </div>

        <!-- Advanced Options Section -->
        <div class="space-y-4 p-4 border border-border rounded-md bg-header/30">
           <h4 class="text-base font-semibold mb-3 pb-2 border-b border-border/50">{{ t('connections.form.sectionAdvanced', '高级选项') }}</h4>
           <div>
             <label for="conn-proxy" class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.proxy') }} ({{ t('connections.form.optional') }})</label>
             <select id="conn-proxy" v-model="formData.proxy_id"
                     class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none bg-no-repeat bg-right pr-8"
                     style="background-image: url('data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%236c757d\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M2 5l6 6 6-6\'/%3e%3c/svg%3e'); background-position: right 0.75rem center; background-size: 16px 12px;">
               <option :value="null">{{ t('connections.form.noProxy') }}</option>
               <option v-for="proxy in proxies" :key="proxy.id" :value="proxy.id">
                 {{ proxy.name }} ({{ proxy.type }} - {{ proxy.host }}:{{ proxy.port }})
               </option>
             </select>
             <div v-if="isProxyLoading" class="mt-1 text-xs text-text-secondary">{{ t('proxies.loading') }}</div>
             <div v-if="proxyStoreError" class="mt-1 text-xs text-error">{{ t('proxies.error', { error: proxyStoreError }) }}</div>
           </div>

           <div>
             <label class="block text-sm font-medium text-text-secondary mb-1">{{ t('connections.form.tags') }} ({{ t('connections.form.optional') }})</label>
             <TagInput v-model="formData.tag_ids" />
           </div>
        </div>

        <!-- Error message -->
        <div v-if="formError || storeError" class="text-error bg-error/10 border border-error/30 rounded-md p-3 text-sm text-center font-medium">
          {{ formError || storeError }}
        </div>

      </form> <!-- End Form -->

      <!-- Form Actions -->
      <div class="flex justify-between items-center pt-5 mt-6 border-t border-border flex-shrink-0">
         <div class="flex flex-col items-start gap-1"> <!-- Test Area -->
             <div class="flex items-center gap-2"> <!-- Button and Icon -->
                 <button type="button" @click="handleTestConnection" :disabled="isLoading || testStatus === 'testing'"
                         class="px-3 py-1.5 border border-border rounded-md text-sm font-medium text-text-secondary bg-background hover:bg-border focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center transition-colors duration-150">
                     <svg v-if="testStatus === 'testing'" class="animate-spin -ml-0.5 mr-2 h-4 w-4 text-text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                       <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                     {{ testButtonText }}
                 </button>
                 <div class="relative group"> <!-- Tooltip Container -->
                     <i class="fas fa-info-circle text-text-secondary cursor-help"></i>
                     <span class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs p-2 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-pre-wrap">
                         {{ t('connections.test.latencyTooltip') }}
                     </span>
                 </div>
             </div>
             <!-- Test Result -->
             <div class="min-h-[1.2em] pl-1 text-xs">
                 <div v-if="testStatus === 'testing'" class="text-text-secondary animate-pulse">
                   {{ t('connections.test.testingInProgress', '测试中...') }}
                 </div>
                 <div v-else-if="testStatus === 'success'" class="font-medium" :style="{ color: latencyColor }">
                   {{ testResult }}
                 </div>
                 <div v-else-if="testStatus === 'error'" class="text-error font-medium">
                   {{ t('connections.test.errorPrefix', '错误:') }} {{ testResult }}
                 </div>
             </div>
         </div>
         <div class="flex space-x-3"> <!-- Main Actions -->
             <button type="submit" @click="handleSubmit" :disabled="isLoading || testStatus === 'testing'"
                     class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out">
               {{ submitButtonText }}
             </button>
             <button type="button" @click="emit('close')" :disabled="isLoading || testStatus === 'testing'"
                     class="px-4 py-2 bg-transparent text-text-secondary border border-border rounded-md shadow-sm hover:bg-border hover:text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out">
               {{ t('connections.form.cancel') }}
             </button>
         </div>
      </div> <!-- End Form Actions -->

    </div> <!-- End Form Panel -->
  </div> <!-- End Overlay -->
</template>

<!-- Scoped styles removed, now using Tailwind utility classes -->
