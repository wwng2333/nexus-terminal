import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth.store'; // 导入 Auth Store

// 路由配置
const routes: Array<RouteRecordRaw> = [
  // 首页/仪表盘 (占位符)
  {
    path: '/',
    name: 'Dashboard',
    // component: () => import('../views/DashboardView.vue') // 稍后创建
    component: { template: '<div>仪表盘 (建设中)</div>' } // 临时占位
  },
  // 登录页面 (占位符)
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue') // 指向实际的登录组件
  },
  // 连接管理页面
  {
    path: '/connections',
    name: 'Connections',
    component: () => import('../views/ConnectionsView.vue')
  },
  // 新增：代理管理页面
  {
    path: '/proxies',
    name: 'Proxies',
    component: () => import('../views/ProxiesView.vue')
  },
  // 新增：标签管理页面
  {
    path: '/tags',
    name: 'Tags',
    component: () => import('../views/TagsView.vue')
  },
  // 工作区页面，需要 connectionId 参数
  {
    path: '/workspace/:connectionId', // 使用动态路由段
    name: 'Workspace',
    component: () => import('../views/WorkspaceView.vue'),
    props: true // 将路由参数作为 props 传递给组件
  },
  // 新增：设置页面
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  },
  // 新增：通知管理页面
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('../views/NotificationsView.vue')
  },
  // 新增：审计日志页面
  {
    path: '/audit-logs',
    name: 'AuditLogs',
    component: () => import('../views/AuditLogView.vue')
  },
  // 其他路由...
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 使用 HTML5 History 模式
  routes,
});

// 添加全局前置守卫
router.beforeEach((to, from, next) => {
  // 在守卫内部获取 store 实例，确保 Pinia 已初始化
  const authStore = useAuthStore();

  // 定义不需要认证的路由名称列表
  const publicRoutes = ['Login'];
  const requiresAuth = !publicRoutes.includes(to.name as string);

  if (requiresAuth && !authStore.isAuthenticated) {
    // 如果需要认证但用户未登录，重定向到登录页
    console.log('路由守卫：未登录，重定向到 /login');
    next({ name: 'Login' });
  } else if (to.name === 'Login' && authStore.isAuthenticated) {
    // 如果用户已登录但尝试访问登录页，重定向到仪表盘
    console.log('路由守卫：已登录，从 /login 重定向到 /');
    next({ name: 'Dashboard' });
  } else {
    // 其他情况允许导航
    next();
  }
});

export default router;
