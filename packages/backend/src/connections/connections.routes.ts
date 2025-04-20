import { Router, Request, Response, NextFunction } from 'express'; // 引入 Request, Response, NextFunction
import { isAuthenticated } from '../auth/auth.middleware'; // 引入认证中间件
import multer from 'multer'; // 引入 multer 用于文件上传
import {
    createConnection,
    getConnections,
    getConnectionById, // 引入获取单个连接的控制器
    updateConnection, // 引入更新连接的控制器
    deleteConnection, // 引入删除连接的控制器
    testConnection, // 引入测试连接的控制器
    testUnsavedConnection, // 添加导入: 引入测试未保存连接的控制器
    exportConnections, // 引入导出连接的控制器
    importConnections // 引入导入连接的控制器
} from './connections.controller';

const router = Router();

// 配置 multer 用于处理 JSON 文件上传 (存储在内存中)
const storage = multer.memoryStorage(); // 将文件存储在内存中作为 Buffer
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 限制文件大小为 5MB
    fileFilter: (req: Request, file, cb) => { // Add type for req
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            // Attach error to request instead of calling cb with error directly
            // This makes it easier to handle consistently and return JSON
            (req as any).fileValidationError = '只允许上传 JSON 文件！';
            cb(null, false); // Reject the file
        }
    }
});

// 应用认证中间件到所有 /connections 路由
router.use(isAuthenticated); // 恢复认证检查

// --- Specific routes before parameterized routes ---

// GET /api/v1/connections/export - 导出连接配置
router.get('/export', exportConnections);

// POST /api/v1/connections/import - 导入连接配置
router.post('/import', (req: Request, res: Response, next: NextFunction) => {
    // Use multer middleware, but handle errors specifically
    upload.single('connectionsFile')(req, res, (err: any) => {
        // Check for file filter validation error first
        if ((req as any).fileValidationError) {
            return res.status(400).json({ message: (req as any).fileValidationError });
        }
        // Check for other multer errors (e.g., file size limit)
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `文件上传错误: ${err.message}` });
        } else if (err) {
            // Other unexpected errors during upload
            console.error("Unexpected error during file upload:", err);
            return res.status(500).json({ message: '文件上传处理失败' });
        }
        // If no errors, proceed to the controller
        next();
    });
}, importConnections);


// --- General CRUD and other routes ---

// GET /api/v1/connections - 获取连接列表
router.get('/', getConnections);

// POST /api/v1/connections - 创建新连接
router.post('/', createConnection);

// GET /api/v1/connections/:id - 获取单个连接信息
router.get('/:id', getConnectionById);

// PUT /api/v1/connections/:id - 更新连接信息
router.put('/:id', updateConnection);

// DELETE /api/v1/connections/:id - 删除连接
router.delete('/:id', deleteConnection);

// POST /api/v1/connections/:id/test - 测试连接
router.post('/:id/test', testConnection);

// POST /api/v1/connections/test-unsaved - 测试未保存的连接信息
router.post('/test-unsaved', testUnsavedConnection);

export default router;
