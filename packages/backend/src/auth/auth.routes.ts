import { Router } from 'express';
import { login, changePassword } from './auth.controller'; // 导入 changePassword
import { isAuthenticated } from './auth.middleware'; // 导入认证中间件

const router = Router();

// POST /api/v1/auth/login - 用户登录接口
router.post('/login', login);

// PUT /api/v1/auth/password - 修改密码接口 (需要认证)
router.put('/password', isAuthenticated, changePassword);

// 未来可以添加的其他认证相关路由
// router.post('/logout', logout); // 登出
// router.get('/status', getStatus); // 获取当前登录状态
// router.post('/setup', setupAdmin); // 用于首次创建管理员账号的接口

export default router;
