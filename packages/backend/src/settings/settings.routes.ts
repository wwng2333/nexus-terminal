import express from 'express';
import { settingsController } from './settings.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // 导入认证中间件

const router = express.Router();

// 应用认证中间件，确保只有登录用户才能访问设置相关 API
router.use(isAuthenticated);

// 定义路由
router.get('/', settingsController.getAllSettings); // GET /api/v1/settings
router.put('/', settingsController.updateSettings); // PUT /api/v1/settings

// +++ 新增：焦点切换顺序路由 +++
// GET /api/v1/settings/focus-switcher-sequence - 获取焦点切换顺序
router.get('/focus-switcher-sequence', settingsController.getFocusSwitcherSequence);
// PUT /api/v1/settings/focus-switcher-sequence - 更新焦点切换顺序
router.put('/focus-switcher-sequence', settingsController.setFocusSwitcherSequence);

// +++ 新增：导航栏可见性路由 +++
// GET /api/v1/settings/nav-bar-visibility - 获取导航栏可见性
router.get('/nav-bar-visibility', settingsController.getNavBarVisibility);
// PUT /api/v1/settings/nav-bar-visibility - 更新导航栏可见性
router.put('/nav-bar-visibility', settingsController.setNavBarVisibility);

// +++ 新增：布局树路由 +++
// GET /api/v1/settings/layout - 获取布局树
router.get('/layout', settingsController.getLayoutTree);
// PUT /api/v1/settings/layout - 更新布局树
router.put('/layout', settingsController.setLayoutTree);

// --- IP 黑名单管理路由 ---
// GET /api/v1/settings/ip-blacklist - 获取 IP 黑名单列表 (需要认证)
router.get('/ip-blacklist', settingsController.getIpBlacklist);

// DELETE /api/v1/settings/ip-blacklist/:ip - 从黑名单中删除指定 IP (需要认证)
router.delete('/ip-blacklist/:ip', settingsController.deleteIpFromBlacklist);


export default router;
