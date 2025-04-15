import express from 'express';
import { settingsController } from './settings.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // 导入认证中间件

const router = express.Router();

// 应用认证中间件，确保只有登录用户才能访问设置相关 API
router.use(isAuthenticated);

// 定义路由
router.get('/', settingsController.getAllSettings); // GET /api/v1/settings
router.put('/', settingsController.updateSettings); // PUT /api/v1/settings

// --- IP 黑名单管理路由 ---
// GET /api/v1/settings/ip-blacklist - 获取 IP 黑名单列表 (需要认证)
router.get('/ip-blacklist', settingsController.getIpBlacklist);

// DELETE /api/v1/settings/ip-blacklist/:ip - 从黑名单中删除指定 IP (需要认证)
router.delete('/ip-blacklist/:ip', settingsController.deleteIpFromBlacklist);


export default router;
