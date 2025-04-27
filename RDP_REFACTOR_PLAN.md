# RDP 连接重构计划

**目标:** 将 RDP 令牌生成流程移至后端，提高安全性，遵循高内聚低耦合原则。

**核心流程:**
前端请求主后端 -> 主后端获取连接信息和解密密码 -> 主后端调用 RDP 后端获取令牌 -> RDP 后端生成并返回令牌 -> 主后端将令牌返回给前端 -> 前端使用令牌连接 RDP 后端的 WebSocket。

**具体步骤:**

1.  **主后端 (`packages/backend`)**
    *   **创建新 API 端点:**
        *   在 `packages/backend/src/connections/connections.routes.ts` 中添加一个新的路由，例如 `POST /api/connections/:id/rdp-session`。
        *   在 `packages/backend/src/connections/connections.controller.ts` 中添加对应的处理函数。
    *   **实现 Controller 逻辑:**
        *   接收路径参数 `id`。
        *   调用 `connection.service.ts` 的 `getConnectionWithDecryptedCredentials(id)`。
        *   验证连接是否存在且类型为 'RDP'。
        *   从环境变量或配置中读取 RDP 后端的 API 地址 (例如 `RDP_API_URL=http://localhost:9090`)。
        *   构造向 RDP 后端 `/api/get-token` 发送请求所需的参数 (hostname, port, username, decryptedPassword, security, ignore-cert)。
        *   使用 HTTP 客户端 (如 `axios`，如果未安装则需添加依赖) 向 `RDP_API_URL/api/get-token` 发送 GET 请求。
        *   处理 RDP 后端的响应，提取 `token`。
        *   将获取到的 `token` 返回给前端。
        *   添加错误处理逻辑（连接不存在、类型错误、调用 RDP 后端失败等）。
    *   **配置:** 确保可以通过环境变量或其他方式配置 `RDP_API_URL`。

2.  **RDP 后端 (`packages/rdp`)**
    *   **修改 CORS:**
        *   在 `packages/rdp/backend/src/server.ts` 中调整 `cors` 中间件的配置。需要允许来自主后端 API 的请求源。例如，如果主后端运行在 `http://localhost:3000`，则配置为 `cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] })` 或更灵活的配置。
    *   **(可选) 增强安全性:** 考虑在主后端调用 `/api/get-token` 时增加一个简单的认证机制（例如，一个共享的 API 密钥放在请求头中），并在 RDP 后端进行验证，防止未授权访问。

3.  **前端 (`packages/frontend`)**
    *   **修改 RDP 连接触发逻辑:**
        *   找到当前获取 RDP 令牌并发起连接的代码（可能在 `src/components/RemoteDesktopViewer.vue` 或相关 `composables` 中）。
        *   修改代码，使其调用主后端新增的 `POST /api/connections/:id/rdp-session` 端点来获取 Guacamole 令牌。
        *   使用从主后端获取到的 `token` 来初始化 `Guacamole.Client` 或类似实例。
    *   **确认 WebSocket 地址:** 确保 `Guacamole.Tunnel` 或 WebSocket 连接的目标地址仍然是 RDP 后端的 WebSocket 地址 (例如 `ws://localhost:8081` 或配置的值)。

**架构图 (Mermaid):**

```mermaid
sequenceDiagram
    participant F as 前端 (packages/frontend)
    participant BE as 主后端 (packages/backend)
    participant RDP as RDP 后端 (packages/rdp)
    participant GuacD as guacd

    F->>+BE: POST /api/connections/{id}/rdp-session
    BE->>+BE: getConnectionWithDecryptedCredentials(id)
    Note right of BE: 获取连接信息 (host, port, user) 和解密后的密码
    BE-->>-BE: 返回连接信息和密码
    alt 连接类型为 RDP
        BE->>+RDP: GET /api/get-token?hostname=...&port=...&username=...&password=...
        Note right of BE: 从配置读取 RDP_API_URL
        RDP->>+RDP: 构建 Guacamole 连接参数
        RDP->>+RDP: encryptToken(connectionParams)
        RDP-->>-RDP: 返回加密后的令牌 (token)
        RDP-->>-BE: 返回 { token: "..." }
        BE-->>-F: 返回 { token: "..." }
    else 连接类型非 RDP
        BE-->>-F: 返回错误信息
    end

    Note over F: 前端获取到 token
    F->>+RDP: WebSocket 连接 (ws://<RDP_WS_HOST>:<RDP_WS_PORT>)
    Note right of F: 使用获取到的 token 进行认证
    RDP->>+GuacD: 建立 Guacamole 连接
    GuacD-->>-RDP: Guacamole 协议通信
    RDP-->>-F: Guacamole 协议通信 (通过 WebSocket)