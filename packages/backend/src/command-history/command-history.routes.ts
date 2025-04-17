import { Router } from 'express';
import * as CommandHistoryController from './command-history.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // 使用正确的认证中间件

const router = Router();

// 应用认证中间件到所有命令历史记录相关的路由
router.use(isAuthenticated);

// 定义路由
router.post('/', CommandHistoryController.addCommand); // POST /api/command-history
router.get('/', CommandHistoryController.getAllCommands); // GET /api/command-history
router.delete('/:id', CommandHistoryController.deleteCommand); // DELETE /api/command-history/:id
router.delete('/', CommandHistoryController.clearAllCommands); // DELETE /api/command-history (用于清空)

export default router;
