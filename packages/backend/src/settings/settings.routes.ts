import express from 'express';
import { settingsController } from './settings.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // 导入认证中间件

const router = express.Router();

// 应用认证中间件，确保只有登录用户才能访问设置相关 API
router.use(isAuthenticated);

// 定义路由
router.get('/', settingsController.getAllSettings); // GET /api/v1/settings
router.put('/', settingsController.updateSettings); // PUT /api/v1/settings

export default router;
