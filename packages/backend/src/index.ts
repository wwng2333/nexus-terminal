import express = require('express');
import { Request, Response, NextFunction, RequestHandler } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto'; 
import dotenv from 'dotenv';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import { getDbInstance } from './database/connection';
import authRouter from './auth/auth.routes';
import connectionsRouter from './connections/connections.routes';
import sftpRouter from './sftp/sftp.routes';
import proxyRoutes from './proxies/proxies.routes';
import tagsRouter from './tags/tags.routes';
import settingsRoutes from './settings/settings.routes';
import notificationRoutes from './notifications/notification.routes';
import auditRoutes from './audit/audit.routes';
import commandHistoryRoutes from './command-history/command-history.routes';
import quickCommandsRoutes from './quick-commands/quick-commands.routes';
import terminalThemeRoutes from './terminal-themes/terminal-theme.routes';
import appearanceRoutes from './appearance/appearance.routes';
import { initializeWebSocket } from './websocket';
import { ipWhitelistMiddleware } from './auth/ipWhitelist.middleware';

// --- 初始化通知系统 (导入即初始化单例) ---
import './services/event.service'; // 确保事件服务被加载
import './services/notification.processor.service'; // 确保处理器被加载并监听事件
import './services/notification.dispatcher.service'; // 确保分发器被加载并监听处理器事件
// --- 结束通知系统初始化 ---
// --- 环境变量和密钥初始化 ---
const initializeEnvironment = async () => {
    const rootEnvPath = path.resolve(__dirname, '../../.env'); // 指向项目根目录的 .env
    let keysGenerated = false;
    let keysToAppend = '';

    // 1. 尝试加载根目录的 .env 文件 (如果存在)
    // dotenv.config 不会覆盖已存在的 process.env 变量
    dotenv.config({ path: rootEnvPath });

    // 2. 检查 ENCRYPTION_KEY
    if (!process.env.ENCRYPTION_KEY) {
        console.log('[ENV Init] ENCRYPTION_KEY 未设置，正在生成...');
        const newEncryptionKey = crypto.randomBytes(32).toString('hex');
        process.env.ENCRYPTION_KEY = newEncryptionKey; // 更新当前进程环境
        keysToAppend += `\nENCRYPTION_KEY=${newEncryptionKey}`;
        keysGenerated = true;
    }

    // 3. 检查 SESSION_SECRET
    if (!process.env.SESSION_SECRET) {
        console.log('[ENV Init] SESSION_SECRET 未设置，正在生成...');
        const newSessionSecret = crypto.randomBytes(64).toString('hex');
        process.env.SESSION_SECRET = newSessionSecret; // 更新当前进程环境
        keysToAppend += `\nSESSION_SECRET=${newSessionSecret}`;
        keysGenerated = true;
    }

    // 4. 如果生成了新密钥，则追加到 .env 文件
    if (keysGenerated) {
        try {
            // 确保追加前有换行符 (如果文件非空)
            let prefix = '';
            if (fs.existsSync(rootEnvPath)) {
                const content = fs.readFileSync(rootEnvPath, 'utf-8');
                if (content.trim().length > 0 && !content.endsWith('\n')) {
                    prefix = '\n';
                }
            }
            fs.appendFileSync(rootEnvPath, prefix + keysToAppend.trim()); // trim() 移除开头的换行符
            console.warn(`[ENV Init] 已自动生成密钥并保存到 ${rootEnvPath}`);
            console.warn('[ENV Init] !!! 重要：请务必备份此 .env 文件，并在生产环境中妥善保管 !!!');
        } catch (error) {
            console.error(`[ENV Init] 无法写入密钥到 ${rootEnvPath}:`, error);
            console.error('[ENV Init] 请检查文件权限或手动创建 .env 文件并添加生成的密钥。');
            // 即使写入失败，密钥已在 process.env 中，程序可以继续运行本次
        }
    }

    // 5. 生产环境最终检查 (虽然理论上已被覆盖，但作为保险)
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.ENCRYPTION_KEY) {
            console.error('错误：生产环境中 ENCRYPTION_KEY 最终未能设置！');
            process.exit(1);
        }
        if (!process.env.SESSION_SECRET) {
            console.error('错误：生产环境中 SESSION_SECRET 最终未能设置！');
            process.exit(1);
        }
    }
};
// --- 结束环境变量和密钥初始化 ---


// 基础 Express 应用设置
const app = express();
const server = http.createServer(app);

// --- 信任代理设置 ---
app.set('trust proxy', true);

// --- 中间件 ---
app.use(ipWhitelistMiddleware as RequestHandler);
app.use(express.json());

// --- 静态文件服务 ---
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) { // 确保 uploads 目录存在
    fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));


// 扩展 Express Request 类型
declare module 'express-session' {
    interface SessionData {
        userId?: number;
        username?: string;
    }
}

const port = process.env.PORT || 3001;

// 初始化数据库
const initializeDatabase = async () => {
  try {
    const db = await getDbInstance();
    console.log('[Index] Checking user count...');
    const userCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err: Error | null, row: { count: number }) => {
        if (err) {
          console.error('检查 users 表时出错:', err.message);
          return reject(err);
        }
        resolve(row.count);
      });
    });
    console.log(`[Index] User count check completed. Found ${userCount} users.`);
  } catch (error) {
    console.error('数据库初始化或检查失败:', error);
    process.exit(1);
  }
};

// 启动服务器
const startServer = () => {
    // --- 会话中间件配置 ---
    const FileStore = sessionFileStore(session);
    // 修改路径以匹配 Docker volume 挂载点 /app/data
    const sessionsPath = path.join('/app/data', 'sessions');
    if (!fs.existsSync(sessionsPath)) {
        fs.mkdirSync(sessionsPath, { recursive: true });
    }
    const sessionMiddleware = session({
        store: new FileStore({
            path: sessionsPath,
            ttl: 31536000, // 1 year
            // logFn: console.log // 可选：启用详细日志
        }),
        // 直接从 process.env 读取，initializeEnvironment 已确保其存在
        secret: process.env.SESSION_SECRET as string,
        resave: false,
        saveUninitialized: false,
        proxy: true, // 信任反向代理设置的 X-Forwarded-Proto 头
        cookie: {
            httpOnly: true,
            secure: false, 
        }
    });
    app.use(sessionMiddleware);
    // --- 结束会话中间件配置 ---


    // --- 应用 API 路由 ---
    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1/connections', connectionsRouter);
    app.use('/api/v1/sftp', sftpRouter);
    app.use('/api/v1/proxies', proxyRoutes);
    app.use('/api/v1/tags', tagsRouter);
    app.use('/api/v1/settings', settingsRoutes);
    app.use('/api/v1/notifications', notificationRoutes);
    app.use('/api/v1/audit-logs', auditRoutes);
    app.use('/api/v1/command-history', commandHistoryRoutes);
    app.use('/api/v1/quick-commands', quickCommandsRoutes);
    app.use('/api/v1/terminal-themes', terminalThemeRoutes);
    app.use('/api/v1/appearance', appearanceRoutes);

    // 状态检查接口
    app.get('/api/v1/status', (req: Request, res: Response) => {
      res.json({ status: '后端服务运行中！' });
    });
    // --- 结束 API 路由 ---


    server.listen(port, () => {
        console.log(`后端服务器正在监听 http://localhost:${port}`);
        initializeWebSocket(server, sessionMiddleware as RequestHandler);
    });
};

// --- 主程序启动流程 ---
const main = async () => {
    await initializeEnvironment(); // 首先初始化环境和密钥
    await initializeDatabase();   // 然后初始化数据库
    startServer();                // 最后启动服务器
};

main().catch(error => {
    console.error("启动过程中发生未处理的错误:", error);
    process.exit(1);
});
