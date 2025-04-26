import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware';
import { downloadFile } from './sftp.controller';

const router = Router();

// 应用认证中间件
router.use(isAuthenticated);

// GET /api/v1/sftp/download?connectionId=...&remotePath=...
router.get('/download', downloadFile);


export default router;
