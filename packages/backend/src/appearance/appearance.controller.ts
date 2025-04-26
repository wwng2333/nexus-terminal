import { Request, Response } from 'express';
import * as appearanceService from '../services/appearance.service';
import { UpdateAppearanceDto } from '../types/appearance.types';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// --- 背景图片上传配置 ---
const backgroundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/backgrounds/');
        // 确保目录存在
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // 使用时间戳和原始文件名（去除特殊字符）创建唯一文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, uniqueSuffix + '-' + safeOriginalName);
    }
});

const backgroundUpload = multer({
    storage: backgroundStorage,
    fileFilter: (req, file, cb) => {
        // 允许常见的图片格式
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP, SVG)！'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 限制文件大小为 5MB
});



/**
 * 获取外观设置
 */
export const getAppearanceSettingsController = async (req: Request, res: Response): Promise<void> => {
    try {
        const settings = await appearanceService.getSettings();
        res.status(200).json(settings);
    } catch (error: any) {
        res.status(500).json({ message: '获取外观设置失败', error: error.message });
    }
};

/**
 * 更新外观设置
 */
export const updateAppearanceSettingsController = async (req: Request, res: Response): Promise<void> => {
    try {
        const settingsDto: UpdateAppearanceDto = req.body;
        // 注意：背景图片通常通过单独的上传接口处理，这里只更新文本类设置
        const success = await appearanceService.updateSettings(settingsDto);
        if (success) {
            // 获取更新后的设置并返回
            const updatedSettings = await appearanceService.getSettings();
            res.status(200).json(updatedSettings);
        } else {
            // 理论上更新单行设置总能找到 ID=1 的行，除非数据库有问题
            res.status(500).json({ message: '更新外观设置似乎失败了' });
        }
    } catch (error: any) {
        res.status(400).json({ message: '更新外观设置失败', error: error.message });
    }
};


/**
 * 上传页面背景图片
 */
export const uploadPageBackgroundController = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
        res.status(400).json({ message: '没有上传文件' });
        return;
    }
    try {
        // 文件已由 multer 保存到 uploads/backgrounds/
        // 返回相对于服务器根目录的文件路径，供前端使用
        const relativePath = `/uploads/backgrounds/${req.file.filename}`;

        // 更新数据库中的设置
        await appearanceService.updateSettings({ pageBackgroundImage: relativePath });

        res.status(200).json({ message: '页面背景上传成功', filePath: relativePath });
    } catch (error: any) {
        // 如果出错，尝试删除已上传的文件
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("删除上传失败的背景文件时出错:", err);
            });
        }
        res.status(500).json({ message: '上传页面背景失败', error: error.message });
    }
};

/**
 * 上传终端背景图片
 */
export const uploadTerminalBackgroundController = async (req: Request, res: Response): Promise<void> => {
     if (!req.file) {
        res.status(400).json({ message: '没有上传文件' });
        return;
    }
    try {
        const relativePath = `/uploads/backgrounds/${req.file.filename}`;
        await appearanceService.updateSettings({ terminalBackgroundImage: relativePath });
        res.status(200).json({ message: '终端背景上传成功', filePath: relativePath });
    } catch (error: any) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("删除上传失败的背景文件时出错:", err);
            });
        }
        res.status(500).json({ message: '上传终端背景失败', error: error.message });
    }
};

// 导出 multer 中间件以便在路由中使用
export const uploadPageBackgroundMiddleware = backgroundUpload.single('pageBackgroundFile');
export const uploadTerminalBackgroundMiddleware = backgroundUpload.single('terminalBackgroundFile');
