import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware';
import { downloadFile } from './sftp.controller'; // 稍后创建

const router = Router();

// 应用认证中间件
router.use(isAuthenticated);

// GET /api/v1/sftp/download?connectionId=...&remotePath=...
router.get('/download', downloadFile);

// 未来可以添加其他 SFTP 相关 REST API (如果需要，例如上传的大文件断点续传初始化)

export default router;
