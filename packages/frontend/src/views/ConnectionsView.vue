<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'; // 引入 computed 和 onMounted
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia'; // 引入 storeToRefs
import ConnectionList from '../components/ConnectionList.vue';
import AddConnectionForm from '../components/AddConnectionForm.vue';
import { useConnectionsStore, ConnectionInfo } from '../stores/connections.store'; // 引入 ConnectionInfo 和 Store
import { useTagsStore } from '../stores/tags.store'; // 引入 Tags Store

const { t } = useI18n();
const connectionsStore = useConnectionsStore(); // 获取 Connections Store
const tagsStore = useTagsStore(); // 获取 Tags Store
const { connections } = storeToRefs(connectionsStore); // 获取连接列表
const { tags } = storeToRefs(tagsStore); // 获取标签列表

const showForm = ref(false);
const editingConnection = ref<ConnectionInfo | null>(null);
const selectedTagId = ref<number | null>(null); // 用于存储选中的标签 ID，null 表示所有

// 计算筛选后的连接列表
const filteredConnections = computed(() => {
    if (selectedTagId.value === null) {
        return connections.value; // 返回所有连接
    }
    return connections.value.filter(conn =>
        conn.tag_ids?.includes(selectedTagId.value!) // 筛选包含选中标签 ID 的连接
    );
});

// 组件挂载时获取连接和标签列表
onMounted(() => {
    connectionsStore.fetchConnections(); // 添加获取连接列表的调用
    tagsStore.fetchTags();
});

const handleConnectionAdded = () => {
  showForm.value = false; // 使用新变量名
    // ConnectionList 组件会自动从 store 获取更新后的列表
    // 如果添加后需要清除筛选，可以在这里设置 selectedTagId.value = null;
};

// 新增：处理编辑成功后的逻辑
const handleConnectionUpdated = () => {
    editingConnection.value = null; // 清除正在编辑的连接
    showForm.value = false; // 编辑成功后隐藏表单
};

// 新增：处理来自 ConnectionList 的编辑请求
const handleEditRequest = (connection: ConnectionInfo) => {
    editingConnection.value = connection; // 设置要编辑的连接
    showForm.value = true; // 显示表单
};

// 新增：显式打开添加表单的方法
const openAddForm = () => {
    editingConnection.value = null; // 确保不在编辑模式
    showForm.value = true;
};

// 新增：统一的关闭表单方法
const closeForm = () => {
    editingConnection.value = null; // 清除编辑状态
    showForm.value = false;
};

// 新增：处理导出连接按钮点击事件
const handleExportConnections = async () => {
    try {
        // 调用后端导出 API
        const response = await fetch('/api/v1/connections/export', {
            method: 'GET',
            headers: {
                // 如果需要认证，可能需要添加 Authorization 头
                // 'Authorization': `Bearer ${token}`, // 示例
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            // 处理错误响应
            const errorData = await response.json();
            console.error('导出连接失败:', errorData.message || response.statusText);
            alert(t('connections.exportError', { message: errorData.message || response.statusText })); // 提示用户错误
            return;
        }

        // 获取文件名 (从 Content-Disposition 头)
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'nexus-terminal-connections.json'; // 默认文件名
        if (disposition && disposition.includes('attachment')) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) {
                filename = matches[1].replace(/['"]/g, '');
            }
        }

        // 创建 Blob 对象并触发下载
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); // 需要添加到 DOM 才能触发点击
        a.click();
        a.remove(); // 清理
        window.URL.revokeObjectURL(url); // 释放对象 URL

    } catch (error: any) {
        console.error('导出连接时发生网络或处理错误:', error);
        alert(t('connections.exportError', { message: error.message || '未知错误' }));
    }
};

// --- Import/Export Logic ---
const fileInput = ref<HTMLInputElement | null>(null); // Ref for the hidden file input

// 点击导入按钮时触发文件选择
const handleImportClick = () => {
    fileInput.value?.click(); // 触发隐藏 input 的点击事件
};

// 处理文件选择变化
const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
        return; // 没有选择文件
    }

    if (file.type !== 'application/json') {
        alert(t('connections.importErrorFileType')); // 提示文件类型错误
        target.value = ''; // 清空文件输入，以便可以再次选择相同文件
        return;
    }

    const formData = new FormData();
    formData.append('connectionsFile', file); // 'connectionsFile' 必须与后端 multer 配置匹配

    try {
        const response = await fetch('/api/v1/connections/import', {
            method: 'POST',
            body: formData,
            headers: {
                // 不需要 'Content-Type': 'multipart/form-data'，浏览器会自动设置
                // 如果需要认证，添加 Authorization 头
                'Accept': 'application/json', // 期望服务器返回 JSON
            },
        });

        // 首先检查响应是否成功
        if (!response.ok) {
            let errorMsg = `${response.status} ${response.statusText}`;
            try {
                // 尝试解析可能的 JSON 错误体
                const errorResult = await response.json();
                console.error('导入连接失败 (JSON):', errorResult.message || response.statusText, errorResult.errors);
                errorMsg = errorResult.message || errorMsg;
                if (errorResult.errors && Array.isArray(errorResult.errors)) {
                     errorMsg += '\n' + errorResult.errors.map((e: any) => `- ${e.connectionName || '未知'}: ${e.message}`).join('\n');
                }
            } catch (jsonError) {
                // 如果解析 JSON 失败，尝试读取文本
                try {
                    const textError = await response.text();
                    console.error('导入连接失败 (Text):', textError);
                    // 如果文本错误信息不为空，则使用它，否则保留状态码/文本
                    if (textError) {
                        errorMsg = textError.substring(0, 500); // 限制长度避免过长的 HTML 错误页
                    }
                } catch (textReadError) {
                    console.error('读取错误响应文本失败:', textReadError);
                    // 保留原始的状态码/文本错误
                }
            }
            alert(t('connections.importError', { message: errorMsg }));
        } else {
            // 响应成功，解析 JSON
            try {
                const result = await response.json();
                console.log('导入连接成功:', result);
                alert(t('connections.importSuccess', { successCount: result.successCount, failureCount: result.failureCount }));
                // 导入成功后刷新连接列表
                connectionsStore.fetchConnections();
            } catch (jsonParseError: any) {
                 console.error('解析成功响应 JSON 时出错:', jsonParseError);
                 alert(t('connections.importError', { message: `无法解析服务器成功响应: ${jsonParseError.message}` }));
            }
        }

    } catch (error: any) {
        console.error('导入连接时发生网络或处理错误:', error);
        alert(t('connections.importError', { message: error.message || t('connections.importErrorNetwork') }));
    } finally {
        // 无论成功或失败，都清空文件输入框的值，以便用户可以重新上传相同的文件
        if (target) {
            target.value = '';
        }
    }
};
</script>

<template>
  <div class="connections-view">
    <h2>{{ t('connections.title') }}</h2>

    <div class="actions-bar">
        <div> <!-- Wrap buttons -->
            <button @click="openAddForm" v-if="!showForm" style="margin-right: 0.5rem;">{{ t('connections.addConnection') }}</button>
            <button @click="handleExportConnections" style="margin-right: 0.5rem;">{{ t('connections.exportConnections') }}</button> <!-- Export Button -->
            <button @click="handleImportClick">{{ t('connections.importConnections') }}</button> <!-- Import Button -->
            <input type="file" ref="fileInput" @change="handleFileChange" accept=".json" style="display: none;" /> <!-- Hidden File Input -->
        </div>
        <!-- 标签筛选下拉框 -->
        <select v-model="selectedTagId" class="tag-filter-select">
            <option :value="null">{{ t('connections.filterAllTags') }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.id">
                {{ tag.name }}
            </option>
        </select>
    </div>

    <!-- 添加/编辑连接表单 (条件渲染) -->
    <AddConnectionForm
      v-if="showForm"
      :connection-to-edit="editingConnection"
      @close="closeForm"
      @connection-added="handleConnectionAdded"
      @connection-updated="handleConnectionUpdated"
    />

    <!-- 连接列表，传入筛选后的列表 -->
    <ConnectionList :connections="filteredConnections" @edit-connection="handleEditRequest" />
  </div>
</template>

<style scoped>
.connections-view {
  padding: 1rem;
}

.actions-bar {
    display: flex;
    justify-content: space-between; /* 让按钮和下拉框分开 */
    align-items: center;
    margin-bottom: 1rem;
}

.actions-bar button {
  /* margin-bottom: 1rem; */ /* 移除按钮的下边距 */
  padding: 0.5rem 1rem;
  cursor: pointer;
}

.tag-filter-select {
    padding: 0.4rem 0.8rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-width: 150px; /* 给下拉框一个最小宽度 */
}
</style>
