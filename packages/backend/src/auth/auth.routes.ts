import { Router } from 'express';
import { login } from './auth.controller';

const router = Router();

// POST /api/v1/auth/login - 用户登录接口
router.post('/login', login);

// 未来可以添加的其他认证相关路由
// router.post('/logout', logout); // 登出
// router.get('/status', getStatus); // 获取当前登录状态
// router.post('/setup', setupAdmin); // 用于首次创建管理员账号的接口

export default router;
