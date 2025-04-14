import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware'; // 引入认证中间件
import {
    createConnection,
    getConnections,
    getConnectionById, // 引入获取单个连接的控制器
    updateConnection, // 引入更新连接的控制器
    deleteConnection // 引入删除连接的控制器
} from './connections.controller';

const router = Router();

// 应用认证中间件到所有 /connections 路由
router.use(isAuthenticated); // 恢复认证检查

// GET /api/v1/connections - 获取连接列表
router.get('/', getConnections);

// POST /api/v1/connections - 创建新连接
router.post('/', createConnection);

// GET /api/v1/connections/:id - 获取单个连接信息
router.get('/:id', getConnectionById);

// PUT /api/v1/connections/:id - 更新连接信息
router.put('/:id', updateConnection);

// DELETE /api/v1/connections/:id - 删除连接
router.delete('/:id', deleteConnection); // 使用占位符

// TODO: 添加测试连接路由
// router.post('/:id/test', testConnection);

export default router;
