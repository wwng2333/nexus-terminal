import { Router } from 'express';
import * as QuickCommandsController from './quick-commands.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // 引入认证中间件

const router = Router();

// 应用认证中间件到所有快捷指令相关的路由
router.use(isAuthenticated);

// 定义路由
router.post('/', QuickCommandsController.addQuickCommand); // POST /api/v1/quick-commands
router.get('/', QuickCommandsController.getAllQuickCommands); // GET /api/v1/quick-commands?sortBy=name|usage_count
router.put('/:id', QuickCommandsController.updateQuickCommand); // PUT /api/v1/quick-commands/:id
router.delete('/:id', QuickCommandsController.deleteQuickCommand); // DELETE /api/v1/quick-commands/:id
router.post('/:id/increment-usage', QuickCommandsController.incrementUsage); // POST /api/v1/quick-commands/:id/increment-usage

export default router;
