import { Router } from 'express';
import {
  login,
  verifyLogin2FA,
  changePassword,
  setup2FA,
  verifyAndActivate2FA,
  disable2FA,
  getAuthStatus,
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions, // <-- 添加导入
  verifyPasskeyAuthentication, // <-- 添加导入
  listUserPasskeys,
  deleteUserPasskey,
  needsSetup,
  setupAdmin,
  logout,
  getPublicCaptchaConfig
} from './auth.controller';
import { isAuthenticated } from './auth.middleware';
import { ipBlacklistCheckMiddleware } from './ipBlacklistCheck.middleware';

const router = Router();

// --- Public CAPTCHA Configuration ---
// GET /api/v1/auth/captcha/config - 获取公共 CAPTCHA 配置 (公开访问)
router.get('/captcha/config', getPublicCaptchaConfig);

// --- Setup Routes (Public) ---
// GET /api/v1/auth/needs-setup - 检查是否需要初始设置 (公开访问)
router.get('/needs-setup', needsSetup);

// POST /api/v1/auth/setup - 执行初始管理员设置 (公开访问，控制器内部检查)
router.post('/setup', setupAdmin);

// POST /api/v1/auth/login - 用户登录接口 (添加黑名单检查)
router.post('/login', ipBlacklistCheckMiddleware, login);

// PUT /api/v1/auth/password - 修改密码接口 (需要认证)
router.put('/password', isAuthenticated, changePassword);

// POST /api/v1/auth/login/2fa - 登录时的 2FA 验证接口 (添加黑名单检查)
// (不需要单独的 isAuthenticated，依赖 login 接口设置的临时 session)
router.post('/login/2fa', ipBlacklistCheckMiddleware, verifyLogin2FA);

// --- 2FA 管理接口 (都需要认证) ---
// POST /api/v1/auth/2fa/setup - 开始 2FA 设置，生成密钥和二维码
router.post('/2fa/setup', isAuthenticated, setup2FA);

// POST /api/v1/auth/2fa/verify - 验证设置时的 TOTP 码并激活
router.post('/2fa/verify', isAuthenticated, verifyAndActivate2FA);

// DELETE /api/v1/auth/2fa - 禁用 2FA (需要验证当前密码，在控制器中处理)
router.delete('/2fa', isAuthenticated, disable2FA);

// GET /api/v1/auth/status - 获取当前认证状态 (需要认证)
router.get('/status', isAuthenticated, getAuthStatus);

// --- Passkey 管理接口 (都需要认证) ---
// POST /api/v1/auth/passkey/register-options - 生成 Passkey 注册选项
router.post('/passkey/register-options', isAuthenticated, generatePasskeyRegistrationOptions);

// POST /api/v1/auth/passkey/verify-registration - 验证 Passkey 注册响应
router.post('/passkey/verify-registration', isAuthenticated, verifyPasskeyRegistration);
// GET /api/v1/auth/passkeys - 获取当前用户的所有 Passkey
router.get('/passkeys', isAuthenticated, listUserPasskeys);

// DELETE /api/v1/auth/passkeys/:id - 删除指定的 Passkey
router.delete('/passkeys/:id', isAuthenticated, deleteUserPasskey);

// --- Passkey 认证接口 (公开访问，添加黑名单检查) ---
// POST /api/v1/auth/passkey/authenticate-options - 生成 Passkey 认证选项 (用于登录)
router.post('/passkey/authenticate-options', ipBlacklistCheckMiddleware, generatePasskeyAuthenticationOptions);

// POST /api/v1/auth/passkey/verify-authentication - 验证 Passkey 认证响应并登录
router.post('/passkey/verify-authentication', ipBlacklistCheckMiddleware, verifyPasskeyAuthentication);

// POST /api/v1/auth/logout - 用户登出接口 (公开访问)
router.post('/logout', logout);


export default router;
