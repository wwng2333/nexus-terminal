// @ts-ignore - Still need this for the import as no types exist
import GuacamoleLite from 'guacamole-lite';
import express, { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
// --- Removed fs, path, dotenv imports ---

// --- Configuration ---
const GUAC_WS_PORT = process.env.GUAC_WS_PORT || 8081;
const API_PORT = process.env.API_PORT || 9090;
const GUACD_HOST = process.env.GUACD_HOST || 'localhost';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);

// --- Generate In-Memory Encryption Key on Startup ---
console.log("Generating new in-memory encryption key for this session...");
const ENCRYPTION_KEY_STRING = crypto.randomBytes(32).toString('hex');
const ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY_STRING, 'hex');
console.log("In-memory encryption key generated.");

// --- Express App Setup ---
const app = express();
const apiServer = http.createServer(app);

const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    process.env.MAIN_BACKEND_URL || 'http://localhost:3000'
];
app.use(cors({ origin: allowedOrigins }));


const guacdOptions = {
    host: GUACD_HOST,
    port: GUACD_PORT,
};

const websocketOptions = {
    port: GUAC_WS_PORT,
    host: '0.0.0.0',
};

const clientOptions = {
    crypt: {
        // Pass the actual key Buffer to guacamole-lite for its internal crypto operations
        key: ENCRYPTION_KEY_BUFFER,
        cypher: 'aes-256-cbc' // Ensure cipher matches between encryption and decryption
    },
};

let guacServer: any; // Define guacServer here to make it accessible in gracefulShutdown

try {
    console.log(`[RDP 服务] 正在使用选项初始化 GuacamoleLite: WS 端口=${websocketOptions.port}, Guacd=${guacdOptions.host}:${guacdOptions.port}`);
    guacServer = new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);
    console.log(`[RDP 服务] GuacamoleLite 初始化成功。`);

    if (guacServer.on) {
        guacServer.on('error', (error: Error) => {
            console.error(`[RDP 服务] GuacamoleLite 服务器错误:`, error);
        });
        guacServer.on('connection', (client: any) => {
            // 注意：这里的 'client' 通常代表到 guacd 的连接，而不是直接的 WebSocket 连接。
            // guacamole-lite 库可能抽象了直接的 WebSocket 处理。
            // 我们主要记录与 guacd 交互的事件。
            const clientId = client.id || '未知客户端ID';
            console.log(`[RDP 服务] Guacd 连接事件触发。客户端 ID: ${clientId}`);
            // 尝试记录更多信息，如果库提供的话 (可能需要查看 guacamole-lite 文档或源码)
            // console.log(`[RDP 服务] 客户端连接参数 (如果可用):`, client.connection?.settings);

            if (client && typeof client.on === 'function') {
                client.on('disconnect', (reason: string) => {
                    console.log(`[RDP 服务] Guacd 连接断开。客户端 ID: ${clientId}, 原因: ${reason || '未知'}`);
                });
                client.on('error', (err: Error) => {
                     console.error(`[RDP 服务] Guacd 客户端错误。客户端 ID: ${clientId}, 错误:`, err);
                });

                client.on('message', (message: Buffer | string) => {
                    // Message handling removed in reverted state
                });

            } else {
                 // Minimal handling for clients without 'on'
            }
        });
   }
} catch (error) {
   console.error(`[RDP 服务] 初始化 GuacamoleLite 失败:`, error);
   process.exit(1);
}

// Updated encryptToken to match guacamole-lite's expected format (aes-256-cbc and specific JSON structure)
// Now accepts the key Buffer directly for correct crypto operation
const encryptToken = (data: string, keyBuffer: Buffer): string => {
    try {
        const iv = crypto.randomBytes(16); // AES-CBC typically uses a 16-byte IV
        // Use the key Buffer for Node.js crypto operations
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);

        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Construct the JSON object expected by guacamole-lite's decrypt function
        const output = {
            iv: iv.toString('base64'),
            value: encrypted
        };

        // Stringify the JSON and then Base64 encode the entire string
        const jsonString = JSON.stringify(output);
        return Buffer.from(jsonString).toString('base64');

    } catch (e) {
        console.error("Token encryption failed:", e); // Log the actual error
        throw new Error("Token encryption failed.");
    }
};

// Example Decryption (if needed elsewhere, ensure consistency)
// const decryptToken = (token: string, keyBuffer: Buffer): string => {
//     try {
//         const combined = Buffer.from(token, 'base64');
//         const iv = combined.slice(0, 12);
//         const tag = combined.slice(12, 12 + 16);
//         const encrypted = combined.slice(12 + 16);
//
//         const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
//         decipher.setAuthTag(tag);
//
//         const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
//         return decrypted.toString('utf8');
//     } catch (e) {
//         console.error("Token decryption failed:", e);
//         throw new Error("Token decryption failed.");
//     }
// };


// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.get('/api/get-token', (req: any, res: any) => {
    const { hostname, port, username, password, security = 'any', ignoreCert = 'true' } = req.query;

    if (!hostname || !port || !username || typeof password === 'undefined') {
        return res.status(400).json({ error: 'Missing required RDP parameters (hostname, port, username, password)' });
    }

    const connectionParams = {
        connection: {
            type: 'rdp',
            settings: {
                hostname: hostname as string,
                port: port as string,
                username: username as string,
                password: password as string,
                security: 'tls', // 尝试 TLS 安全模式
                'ignore-cert': ignoreCert as string,
                // Include the dynamic (or default) size parameters from query
                width: String(req.query.width || '1024'),
                height: String(req.query.height || '768'),
                dpi: String(req.query.dpi || '96'),
            }
        }
    };

    try {
        const tokenData = JSON.stringify(connectionParams);
        // Use the validated key buffer for encryption
        // Use the key Buffer for encryption
        const encryptedToken = encryptToken(tokenData, ENCRYPTION_KEY_BUFFER);
        res.json({ token: encryptedToken });
    } catch (error) {
        console.error("Error in /api/get-token:", error); // Log specific error
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

apiServer.listen(API_PORT, () => {
    console.log(`[RDP 服务] API 服务器正在监听端口 ${API_PORT}`);
    console.log(`[RDP 服务] Guacamole WebSocket 服务器应在端口 ${GUAC_WS_PORT} 上运行 (由 GuacamoleLite 管理)`);
});

const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`); // Added shutdown log

  let guacClosed = false;
  let apiClosed = false;

  const tryExit = () => {
    if (guacClosed && apiClosed) {
      console.log("All servers closed. Exiting."); // Added exit log
      process.exit(0);
    }
  };

  apiServer.close((err) => {
    if (err) {
        console.error("Error closing API server:", err); // Added error log
    } else {
        console.log("API server closed."); // Added close log
    }
    apiClosed = true;
    tryExit();
  });

  // @ts-ignore - Assuming close method exists based on common patterns
  if (typeof guacServer !== 'undefined' && guacServer && typeof guacServer.close === 'function') {
    console.log("Closing Guacamole server..."); // Added close log
    // @ts-ignore
    guacServer.close(() => {
        console.log("Guacamole server closed."); // Added close log
        guacClosed = true;
        tryExit();
    });
  } else {
    console.log("Guacamole server not running or doesn't support close()."); // Added info log
    guacClosed = true;
    tryExit();
  }

  // Force exit after timeout
  setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit."); // Added timeout log
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('SIGUSR2', () => {
    // Handle nodemon restarts gracefully
    gracefulShutdown('SIGUSR2 (nodemon restart)');
});