// @ts-ignore - Still need this for the import as no types exist
import GuacamoleLite from 'guacamole-lite';
import express, { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';

const GUAC_WS_PORT = process.env.GUAC_WS_PORT || 8081;
const API_PORT = process.env.API_PORT || 9090;
const GUACD_HOST = process.env.GUACD_HOST || 'localhost';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);
const ENCRYPTION_KEY_STRING = process.env.ENCRYPTION_KEY || 'ThisIsASecretKeyForGuacLite123!!';
if (Buffer.byteLength(ENCRYPTION_KEY_STRING, 'utf8') !== 32) {
    process.exit(1);
}

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
        key: ENCRYPTION_KEY_STRING
    },
};

let guacServer: any; // Define guacServer here to make it accessible in gracefulShutdown

try {
    guacServer = new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);

    if (guacServer.on) {
        guacServer.on('error', (error: Error) => {
            // Minimal error handling for reverted state
        });
        guacServer.on('connection', (client: any) => {
            const clientId = client.id || 'unknown';

            if (client && typeof client.on === 'function') {
                client.on('disconnect', (reason: string) => {
                    // Minimal disconnect handling
                });
                client.on('error', (err: Error) => {
                     // Minimal client error handling
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
   process.exit(1);
}

const encryptToken = (data: string, key: string): string => {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

        const encryptedBuffer = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

        const ivBase64 = iv.toString('base64');
        const encryptedBase64 = encryptedBuffer.toString('base64');

        const encodedObject = {
            iv: ivBase64,
            value: encryptedBase64
        };

        const jsonString = JSON.stringify(encodedObject);

        const finalToken = Buffer.from(jsonString, 'utf8').toString('base64');

        return finalToken;
    } catch (e) {
        throw new Error("Token encryption failed.");
    }
};

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
                security: security as string,
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
        const encryptedToken = encryptToken(tokenData, ENCRYPTION_KEY_STRING);
        res.json({ token: encryptedToken });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

apiServer.listen(API_PORT, () => {
    // Startup log removed
});

const gracefulShutdown = (signal: string) => {

  let guacClosed = false;
  let apiClosed = false;

  const tryExit = () => {
    if (guacClosed && apiClosed) {
      process.exit(0);
    }
  };

  apiServer.close((err) => {
    if (err) {
        // Minimal error handling
    } else {
        // Minimal close handling
    }
    apiClosed = true;
    tryExit();
  });

  // @ts-ignore - Assuming close method exists based on common patterns
  if (typeof guacServer !== 'undefined' && guacServer && typeof guacServer.close === 'function') {
    // @ts-ignore
    guacServer.close(() => {
        guacClosed = true;
        tryExit();
    });
  } else {
    guacClosed = true;
    tryExit();
  }

  setTimeout(() => {
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('SIGUSR2', () => {
    gracefulShutdown('SIGUSR2 (nodemon restart)');
});