<script setup lang="ts">
import { ref, computed, PropType, onMounted, watch } from 'vue'; // 导入 ref, computed, onMounted, watch
import { useI18n } from 'vue-i18n'; // 导入 i18n
import { useRoute } from 'vue-router'; // 导入 useRoute
import { storeToRefs } from 'pinia'; // 导入 storeToRefs
import WorkspaceConnectionListComponent from './WorkspaceConnectionList.vue'; // 导入连接列表组件
import { useSessionStore } from '../stores/session.store'; // 导入 session store
import { useLayoutStore, type PaneName } from '../stores/layout.store'; // 导入布局 store 和类型
// 导入会话状态类型
import type { SessionTabInfoWithStatus } from '../stores/session.store'; // 导入更新后的类型
// *** 假设 layoutStore 会有这些状态和方法 ***
// import { useLayoutStore } from '../stores/layout.store';

// --- Setup ---
const { t } = useI18n(); // 初始化 i18n
const layoutStore = useLayoutStore(); // 初始化布局 store
const { isHeaderVisible } = storeToRefs(layoutStore); // 从 layout store 获取主导航栏可见状态
const route = useRoute(); // 获取路由实例

// 定义 Props
const props = defineProps({
  sessions: {
    type: Array as PropType<SessionTabInfoWithStatus[]>, // 使用更新后的类型
    required: true,
  },
  activeSessionId: {
    type: String as PropType<string | null>, // 类型已包含 null
    required: false, // 改为非必需，允许初始为 null
    default: null,   // 提供默认值 null
  },
});

// 定义事件
const emit = defineEmits([
  'activate-session',
  'close-session',
  'open-layout-configurator',
  'request-add-connection-from-popup' // 新增：声明从弹窗发出的添加请求事件
]);

const activateSession = (sessionId: string) => {
  if (sessionId !== props.activeSessionId) {
    emit('activate-session', sessionId);
  }
};

const closeSession = (event: MouseEvent, sessionId: string) => {
  event.stopPropagation(); // 阻止事件冒泡到标签点击事件
  emit('close-session', sessionId);
};

// --- 本地状态 ---
const sessionStore = useSessionStore(); // Session store 保持不变
const showConnectionListPopup = ref(false); // 连接列表弹出状态

const togglePopup = () => {
  showConnectionListPopup.value = !showConnectionListPopup.value;
};

// 处理从弹出列表中选择连接的事件
const handlePopupConnect = (connectionId: number) => {
  console.log(`[TabBar] Popup connect request for ID: ${connectionId}`);
  // 使用 sessionStore 的方法来处理连接请求（它现在总是新建标签）
  sessionStore.handleConnectRequest(connectionId);
  showConnectionListPopup.value = false; // 关闭弹出窗口
};

// 新增：处理从弹窗内部发出的添加连接请求
const handleRequestAddFromPopup = () => {
  console.log('[TabBar] Received request-add-connection from popup component.');
  showConnectionListPopup.value = false; // 关闭弹窗
  emit('request-add-connection-from-popup'); // 向上发出事件
};

// 新增：处理打开布局配置器的事件
const openLayoutConfigurator = () => {
  console.log('[TabBar] Emitting open-layout-configurator event');
  emit('open-layout-configurator'); // 发出事件
};

// --- Header Visibility Logic ---
const isWorkspaceRoute = ref(route.path === '/workspace'); // 检查是否在 /workspace 路由

// 监视路由变化
watch(() => route.path, (newPath) => {
  isWorkspaceRoute.value = newPath === '/workspace';
  if (isWorkspaceRoute.value) {
    // 进入 /workspace 时，不需要在这里加载 Header 状态，App.vue 会处理
    console.log('[TabBar] Entered /workspace route. Header toggle button is now active.');
  }
});

// 组件挂载时检查一次
onMounted(() => {
  isWorkspaceRoute.value = route.path === '/workspace';
  if (isWorkspaceRoute.value) {
    // 初始加载时，不需要在这里加载 Header 状态，App.vue 会处理
     console.log('[TabBar] Mounted on /workspace route. Header toggle button is now active.');
  }
});

// 切换主导航栏可见性 (只在 workspace 路由下生效)
const toggleHeader = () => {
  if (isWorkspaceRoute.value) {
    console.log('[TabBar] Toggling header visibility');
    // 调用 store action
    layoutStore.toggleHeaderVisibility();
  } else {
    console.log('[TabBar] Not on /workspace route, toggle ignored.');
  }
};

// 计算属性，用于确定眼睛图标的类
const eyeIconClass = computed(() => {
  // 默认显示眼睛图标，如果主导航栏不可见，则显示斜杠眼睛
  // 注意：这里假设 isHeaderVisible 为 true 时是可见的
  return isHeaderVisible.value ? 'fas fa-eye' : 'fas fa-eye-slash';
});

// 计算属性，用于按钮的 title
const toggleButtonTitle = computed(() => {
  // 调整 i18n key 和默认文本
  return isHeaderVisible.value ? t('header.hide', '隐藏顶部导航') : t('header.show', '显示顶部导航');
});
// --- End Header Visibility Logic ---

</script>

<template>
  <div class="flex bg-header border border-border rounded-t-md mx-2 mt-2 overflow-hidden h-10"> 
    <div class="flex items-center overflow-x-auto flex-shrink min-w-0">
      <ul class="flex list-none p-0 m-0 h-full flex-shrink-0">
        <li
          v-for="session in sessions"
          :key="session.sessionId"
          :class="['flex items-center px-3 h-full cursor-pointer border-r border-border transition-colors duration-150 relative group',
                   session.sessionId === activeSessionId ? 'bg-background text-foreground' : 'bg-header text-text-secondary hover:bg-border']"
          @click="activateSession(session.sessionId)"
          :title="session.connectionName"
        >
          <!-- Status dot -->
          <span :class="['w-2 h-2 rounded-full mr-2 flex-shrink-0',
                         session.status === 'connected' ? 'bg-green-500' :
                         session.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                         session.status === 'disconnected' ? 'bg-red-500' : 'bg-gray-400']"></span>
          <span class="truncate text-sm">{{ session.connectionName }}</span>
          <button class="ml-2 p-0.5 rounded-full text-text-secondary hover:bg-border hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  :class="{'text-foreground hover:bg-header': session.sessionId === activeSessionId}"
                  @click="closeSession($event, session.sessionId)" title="关闭标签页">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </li>
      </ul>
      <!-- Add Tab Button -->
      <button class="flex items-center justify-center px-3 h-full border-l border-border text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150 flex-shrink-0"
              @click="togglePopup" title="新建连接标签页">
        <i class="fas fa-plus text-sm"></i>
      </button>
    </div>
    <!-- Action Buttons -->
    <div class="flex items-center ml-auto h-full flex-shrink-0">
        <button
          v-if="isWorkspaceRoute"
          class="flex items-center justify-center px-3 h-full border-l border-border text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150"
          @click="toggleHeader"
          :title="toggleButtonTitle"
        >
          <i :class="[eyeIconClass, 'text-sm']"></i>
        </button>
        <button class="flex items-center justify-center px-3 h-full border-l border-border text-text-secondary hover:bg-border hover:text-foreground transition-colors duration-150"
                @click="openLayoutConfigurator" :title="t('layout.configure', '配置布局')">
          <i class="fas fa-th-large text-sm"></i>
        </button>
    </div>
    <!-- Connection List Popup -->
    <div v-if="showConnectionListPopup" class="fixed inset-0 bg-overlay flex justify-center items-center z-50 p-4" @click.self="togglePopup">
      <div class="bg-background text-foreground p-6 rounded-lg shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col relative">
        <button class="absolute top-2 right-2 p-1 text-text-secondary hover:text-foreground" @click="togglePopup">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
             <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
           </svg>
        </button>
        <h3 class="text-lg font-semibold text-center mb-4">选择要连接的服务器</h3>
        <div class="flex-grow overflow-y-auto border border-border rounded">
            <WorkspaceConnectionListComponent
              @connect-request="handlePopupConnect"
              @open-new-session="handlePopupConnect"
              @request-add-connection="handleRequestAddFromPopup"
              class="popup-connection-list"
            />
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Scoped styles removed, now using Tailwind utility classes -->
