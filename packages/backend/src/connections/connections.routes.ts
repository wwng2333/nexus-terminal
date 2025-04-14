import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware'; // 引入认证中间件
import { createConnection, getConnections } from './connections.controller';

const router = Router();

// 应用认证中间件到所有 /connections 路由
router.use(isAuthenticated); // 恢复认证检查

// GET /api/v1/connections - 获取连接列表
router.get('/', getConnections);

// POST /api/v1/connections - 创建新连接
router.post('/', createConnection);

// 未来可以添加其他路由，如获取单个连接、更新、删除、测试连接等
// router.get('/:id', getConnectionById);
// router.put('/:id', updateConnection);
// router.delete('/:id', deleteConnection);
// router.post('/:id/test', testConnection);

export default router;
