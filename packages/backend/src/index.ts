import express = require('express');
// import express = require('express'); // 移除重复导入
import { Request, Response, NextFunction, RequestHandler } from 'express'; // 添加 RequestHandler
import http from 'http'; // 引入 http 模块
import fs from 'fs'; // 导入 fs 模块用于创建目录
import session from 'express-session';
import sessionFileStore from 'session-file-store'; // 替换为 session-file-store
import path from 'path'; // 需要 path 模块
import bcrypt from 'bcrypt'; // 引入 bcrypt 用于哈希密码
import { getDbInstance } from './database/connection'; // Updated import path, use getDbInstance
import { runMigrations } from './database/migrations'; // Updated import path
import authRouter from './auth/auth.routes'; // 导入认证路由
import connectionsRouter from './connections/connections.routes';
import sftpRouter from './sftp/sftp.routes';
import proxyRoutes from './proxies/proxies.routes'; // 导入代理路由
import tagsRouter from './tags/tags.routes'; // 导入标签路由
import settingsRoutes from './settings/settings.routes'; // 导入设置路由
import notificationRoutes from './notifications/notification.routes'; // 导入通知路由
import auditRoutes from './audit/audit.routes'; // 导入审计路由
import commandHistoryRoutes from './command-history/command-history.routes'; // 导入命令历史记录路由
import quickCommandsRoutes from './quick-commands/quick-commands.routes'; // 导入快捷指令路由
import terminalThemeRoutes from './terminal-themes/terminal-theme.routes'; // 导入终端主题路由
import appearanceRoutes from './appearance/appearance.routes'; // 导入外观设置路由
// import dockerRouter from './docker/docker.routes'; // <--- 移除 Docker 路由导入
import { initializeWebSocket } from './websocket';
import { ipWhitelistMiddleware } from './auth/ipWhitelist.middleware'; // 导入 IP 白名单中间件


// 基础 Express 应用设置 (后续会扩展)
const app = express();
const server = http.createServer(app); // 创建 HTTP 服务器实例

// --- 信任代理设置 (用于正确获取 req.ip) ---
// 如果应用部署在反向代理后面，需要设置此项
// 'true' 信任直接连接的代理；更安全的做法是配置具体的代理 IP 或子网
app.set('trust proxy', true);
// --- 结束信任代理设置 ---

// --- 会话存储设置 ---
// const SQLiteStore = connectSqlite3(session); // 移除旧的 Store 初始化
// 使用 process.cwd() 获取项目根目录，然后拼接路径，确保路径一致性
// console.log('[Index CWD 1]', process.cwd()); // 移除调试日志
// const dbPath = path.join(process.cwd(), 'data'); // 移除未使用的变量

// --- 中间件 ---
// !! 重要：IP 白名单应尽可能早地应用，通常在其他中间件之前 !!
app.use(ipWhitelistMiddleware as RequestHandler); // 应用 IP 白名单中间件 (使用类型断言)

app.use(express.json()); // 添加此行以解析 JSON 请求体

// 会话中间件配置
// TODO: 将 secret 移到环境变量中，不要硬编码在代码里！
const sessionSecret = process.env.SESSION_SECRET || 'a-very-insecure-secret-for-dev';
if (sessionSecret === 'a-very-insecure-secret-for-dev') {
    console.warn('警告：正在使用默认的不安全会话密钥，请在生产环境中设置 SESSION_SECRET 环境变量！');
}

// !! 移除顶层的 session 中间件应用，将其移至 startServer 内部 !!
// !! 将 sessionMiddleware 的创建和应用移到 startServer 函数内部 !!
// const sessionMiddleware = session({ ... }); // 不在这里创建
// app.use(sessionMiddleware); // 不在这里应用

// --- 静态文件服务 ---
// 提供上传的背景图片等静态资源
const uploadsPath = path.join(__dirname, '../uploads'); // 指向 backend/uploads 目录
app.use('/uploads', express.static(uploadsPath));
// console.log(`静态文件服务已启动，路径: ${uploadsPath}`); // 移除调试日志
// --- 结束静态文件服务 ---


// 扩展 Express Request 类型以包含 session 数据 (如果需要更明确的类型提示)
declare module 'express-session' {
    interface SessionData {
        userId?: number; // 存储登录用户的 ID
        username?: string;
    }
}


const port = process.env.PORT || 3001; // 示例端口，可配置

// --- API 路由 (移动到 startServer 内部，在 session 中间件之后应用) ---

// 在服务器启动前初始化数据库并执行迁移
const initializeDatabase = async () => {
  try {
    // getDb() now returns a Promise and handles initialization internally
    const db = await getDbInstance(); // Correctly await the Promise, use getDbInstance
    // console.log('数据库实例已获取并初始化完成。'); // 移除调试日志

    // runMigrations is now just a placeholder and initialization is done within getDb
    // await runMigrations(db); // Removed call to placeholder runMigrations

    // 检查管理员用户是否存在
    const userCount = await new Promise<number>((resolve, reject) => {
      // Use the resolved db instance here
      db.get('SELECT COUNT(*) as count FROM users', (err: Error | null, row: { count: number }) => { // Add type for err
        if (err) {
          console.error('检查 users 表时出错:', err.message);
          return reject(err); // Reject the promise on error
        }
        resolve(row.count);
      });
    });

    // 检查用户数量后不再执行任何操作 (移除了自动创建和日志记录)

    // console.log(`数据库中找到 ${userCount} 个用户。`); // 移除调试日志

    // console.log('数据库初始化后检查完成。'); // 移除调试日志
  } catch (error) {
    console.error('数据库初始化或检查失败:', error); // More specific error message
    process.exit(1); // 如果数据库初始化失败，则退出进程
  }
};

// 启动 HTTP 服务器 (而不是直接 app.listen)
const startServer = () => {
    // !! 在服务器启动前，但在数据库初始化后，设置会话中间件 !!
    // console.log('数据库初始化成功，现在设置会话存储...'); // 移除调试日志
    const FileStore = sessionFileStore(session); // 使用新的 FileStore
    // 使用 process.cwd() 获取项目根目录，然后拼接路径，确保路径一致性
    // console.log('[Index CWD 2]', process.cwd()); // 移除调试日志
    // const dataPath = path.join(process.cwd(), 'data'); // 不再需要 dataPath 在此文件
    // 使用 __dirname 定位到 dist，然后回退一级到 packages/backend，再进入 sessions
    const sessionsPath = path.join(__dirname, '..', 'sessions');
    // 确保 sessions 目录存在
    if (!fs.existsSync(sessionsPath)) {
        fs.mkdirSync(sessionsPath, { recursive: true });
        // console.log(`[Session Store] 已创建会话目录: ${sessionsPath}`); // 移除调试日志
    }
    // console.log(`[Session Store] 使用文件存储，路径: ${sessionsPath}`); // 移除调试日志
    const sessionMiddleware = session({
        store: new FileStore({
            path: sessionsPath, // 指定会话文件存储目录
            ttl: 31536000, // 会话有效期 (秒)，设置为 1 年，确保服务器端会话数据长期存在
            // logFn: (message) => { console.log('[SessionFileStore]', message); } // 移除调试日志
            // reapInterval: 3600 // 清理过期会话间隔 (秒)，默认1小时
        }),
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            // maxAge: 1000 * 60 * 60 * 24 * 7, // 移除固定的 cookie maxAge，默认为会话期
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    });
    app.use(sessionMiddleware); // 在这里应用会话中间件
    // console.log('会话中间件已应用。'); // 移除调试日志

    // --- 应用 API 路由 ---
    // console.log('应用 API 路由...'); // 移除调试日志
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
    // app.use('/api/v1/docker', dockerRouter); // <--- 移除 Docker 路由注册

    // 状态检查接口
    app.get('/api/v1/status', (req: Request, res: Response) => {
      res.json({ status: '后端服务运行中！' });
    });
    // console.log('API 路由已应用。'); // 移除调试日志


    server.listen(port, () => { // 使用 server.listen
        console.log(`后端服务器正在监听 http://localhost:${port}`);
        // 初始化 WebSocket 服务器，并传入 HTTP 服务器实例和会话解析器
        initializeWebSocket(server, sessionMiddleware as RequestHandler); // 传递新创建的 sessionMiddleware
    });
};

// 先执行数据库初始化，成功后再启动服务器
initializeDatabase().then(startServer);
