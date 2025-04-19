import express = require('express');
// import express = require('express'); // 移除重复导入
import { Request, Response, NextFunction, RequestHandler } from 'express'; // 添加 RequestHandler
import http from 'http'; // 引入 http 模块
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import path from 'path'; // 需要 path 模块
import bcrypt from 'bcrypt'; // 引入 bcrypt 用于哈希密码
import { getDb } from './database';
import { runMigrations } from './migrations';
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
const SQLiteStore = connectSqlite3(session);
const dbPath = path.resolve(__dirname, '../../data'); // 数据库目录路径

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

app.use(session({
    // 使用类型断言 (as any) 来解决 @types/connect-sqlite3 和 @types/express-session 的类型冲突
    store: new SQLiteStore({
        db: 'nexus-terminal.db', // 数据库文件名
        dir: dbPath,          // 数据库文件所在目录
        table: 'sessions'     // 存储会话的表名 (会自动创建)
    }) as any,
    secret: sessionSecret,
    resave: false,             // 强制保存 session 即使它没有变化 (通常为 false)
    saveUninitialized: false,  // 强制将未初始化的 session 存储 (通常为 false)
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // Cookie 有效期：7天 (毫秒)
        httpOnly: true,                 // 防止客户端脚本访问 cookie
        secure: process.env.NODE_ENV === 'production' // 仅在 HTTPS 下发送 cookie (生产环境)
    }
}));
// 将 session 中间件保存到一个变量，以便传递给 WebSocket 初始化函数
const sessionMiddleware = session({
    // 使用类型断言 (as any) 来解决 @types/connect-sqlite3 和 @types/express-session 的类型冲突
    store: new SQLiteStore({
        db: 'nexus-terminal.db', // 数据库文件名
        dir: dbPath,          // 数据库文件所在目录
        table: 'sessions'     // 存储会话的表名 (会自动创建)
    }) as any,
    secret: sessionSecret,
    resave: false,             // 强制保存 session 即使它没有变化 (通常为 false)
    saveUninitialized: false,  // 强制将未初始化的 session 存储 (通常为 false)
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // Cookie 有效期：7天 (毫秒)
        httpOnly: true,                 // 防止客户端脚本访问 cookie
        secure: process.env.NODE_ENV === 'production' // 仅在 HTTPS 下发送 cookie (生产环境)
    }
});
app.use(sessionMiddleware); // 应用会话中间件

// --- 静态文件服务 ---
// 提供上传的背景图片等静态资源
const uploadsPath = path.join(__dirname, '../uploads'); // 指向 backend/uploads 目录
app.use('/uploads', express.static(uploadsPath));
console.log(`静态文件服务已启动，路径: ${uploadsPath}`);
// --- 结束静态文件服务 ---


// 扩展 Express Request 类型以包含 session 数据 (如果需要更明确的类型提示)
declare module 'express-session' {
    interface SessionData {
        userId?: number; // 存储登录用户的 ID
        username?: string;
    }
}


const port = process.env.PORT || 3001; // 示例端口，可配置

// --- API 路由 ---
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/connections', connectionsRouter);
app.use('/api/v1/sftp', sftpRouter);
app.use('/api/v1/proxies', proxyRoutes); // 挂载代理相关的路由
app.use('/api/v1/tags', tagsRouter); // 挂载标签相关的路由
app.use('/api/v1/settings', settingsRoutes); // 挂载设置相关的路由
app.use('/api/v1/notifications', notificationRoutes); // 挂载通知相关的路由
app.use('/api/v1/audit-logs', auditRoutes); // 挂载审计日志相关的路由
app.use('/api/v1/command-history', commandHistoryRoutes); // 挂载命令历史记录相关的路由
app.use('/api/v1/quick-commands', quickCommandsRoutes); // 挂载快捷指令相关的路由
app.use('/api/v1/terminal-themes', terminalThemeRoutes); // 挂载终端主题路由
app.use('/api/v1/appearance', appearanceRoutes); // 挂载外观设置路由

// 状态检查接口
app.get('/api/v1/status', (req: Request, res: Response) => {
  res.json({ status: '后端服务运行中！' }); // 响应也改为中文
});

// 在服务器启动前初始化数据库并执行迁移
const initializeDatabase = async () => {
  try {
    const db = getDb(); // 获取数据库实例 (同时会建立连接)
    await runMigrations(db); // 执行数据库迁移 (创建表)
    // console.log('数据库迁移执行成功。'); // 日志已移至 migrations.ts

    // 检查管理员用户是否存在
    const userCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row: { count: number }) => { // 查询用户数量
        if (err) {
          console.error('检查 users 表时出错:', err.message);
          return reject(err);
        }
        resolve(row.count);
      });
    });

    // 检查用户数量后不再执行任何操作 (移除了自动创建和日志记录)

    console.log('数据库初始化检查完成。');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1); // 如果数据库初始化失败，则退出进程
  }
};

// 启动 HTTP 服务器 (而不是直接 app.listen)
const startServer = () => {
  server.listen(port, () => { // 使用 server.listen
    console.log(`后端服务器正在监听 http://localhost:${port}`);
    // 初始化 WebSocket 服务器，并传入 HTTP 服务器实例和会话解析器
    initializeWebSocket(server, sessionMiddleware as RequestHandler);
  });
};

// 先执行数据库初始化，成功后再启动服务器
initializeDatabase().then(startServer);
