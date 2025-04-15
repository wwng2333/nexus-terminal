import { Router } from 'express';
import {
  login,
  verifyLogin2FA,
  changePassword,
  setup2FA,
  verifyAndActivate2FA,
  disable2FA,
  getAuthStatus     // 导入获取状态的方法
} from './auth.controller';
import { isAuthenticated } from './auth.middleware';

const router = Router();

// POST /api/v1/auth/login - 用户登录接口
router.post('/login', login);

// PUT /api/v1/auth/password - 修改密码接口 (需要认证)
router.put('/password', isAuthenticated, changePassword);

// POST /api/v1/auth/login/2fa - 登录时的 2FA 验证接口 (不需要单独的 isAuthenticated，依赖 login 接口设置的临时 session)
router.post('/login/2fa', verifyLogin2FA);

// --- 2FA 管理接口 (都需要认证) ---
// POST /api/v1/auth/2fa/setup - 开始 2FA 设置，生成密钥和二维码
router.post('/2fa/setup', isAuthenticated, setup2FA);

// POST /api/v1/auth/2fa/verify - 验证设置时的 TOTP 码并激活
router.post('/2fa/verify', isAuthenticated, verifyAndActivate2FA);

// DELETE /api/v1/auth/2fa - 禁用 2FA (需要验证当前密码，在控制器中处理)
router.delete('/2fa', isAuthenticated, disable2FA);

// GET /api/v1/auth/status - 获取当前认证状态 (需要认证)
router.get('/status', isAuthenticated, getAuthStatus);


// 未来可以添加的其他认证相关路由
// router.post('/logout', logout); // 登出
// router.get('/status', getStatus); // 获取当前登录状态
// router.post('/setup', setupAdmin); // 用于首次创建管理员账号的接口

export default router;
