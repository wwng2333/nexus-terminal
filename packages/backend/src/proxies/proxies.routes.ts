import express, { RequestHandler } from 'express'; // 引入 RequestHandler
import { isAuthenticated } from '../auth/auth.middleware';
import {
    getAllProxies,
    getProxyById,
    createProxy,
    updateProxy,
    deleteProxy
} from './proxies.controller'; // 引入控制器函数

const router = express.Router();

// 应用认证中间件到所有代理路由
router.use(isAuthenticated);

// 定义代理 CRUD 路由
// 显式类型断言以解决潜在的类型不匹配问题
router.get('/', getAllProxies as RequestHandler);
router.get('/:id', getProxyById as RequestHandler);
router.post('/', createProxy as RequestHandler);
router.put('/:id', updateProxy as RequestHandler); // 类型断言
router.delete('/:id', deleteProxy as RequestHandler); // 类型断言

export default router;
