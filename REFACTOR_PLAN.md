# 重构设置加载与存储机制计划 (Refactoring Plan for Settings Loading/Storage)

**目标:** 重构 `SettingsView.vue` 和 `settings.store.ts` 中的设置加载与存储机制，以明确区分登录和未登录状态，整合浏览器默认设置，使用 `localStorage` 进行未登录状态的持久化，并实现由后端驱动的首次登录同步机制。

**阶段 1: 后端调整 (需要后端开发协调)**

1.  **`/settings` API (GET):**
    *   用户已登录：返回该用户保存的设置。
    *   用户未登录：返回明确表示未登录的响应（例如 401 Unauthorized，或带有特定标志的 200 OK）。
2.  **`/settings` API (PUT):**
    *   确保能接受并存储所有相关设置项，包括 `language` 和 `timezone`。
3.  **登录/认证接口:**
    *   成功登录后，响应中应包含一个标志（例如 `isFirstLogin: true/false`）来表明这是否是用户的首次登录。

**阶段 2: 前端 `settings.store.ts` 重构**

1.  **状态 (State):**
    *   保留 `settings = ref<Partial<SettingsState>>({})`。
    *   添加 `isUsingLocalStorage = ref(false)` 来跟踪当前状态是否基于 localStorage（用于未登录用户）。
2.  **`loadInitialSettings` Action:**
    *   注入 `authStore`。
    *   检查 `authStore.isAuthenticated`。
    *   **如果未认证:**
        *   设置 `isUsingLocalStorage.value = true`。
        *   尝试从 `localStorage` 加载设置 (键名: `nexus_guest_settings`)。
        *   如果 `localStorage` 数据存在且有效:
            *   解析数据并与必要的硬编码默认值（如 UI 相关的）合并。
            *   更新 `settings.value`。
        *   如果 `localStorage` 数据不存在或无效:
            *   检测浏览器语言 (`navigator.language`) 和时区 (`Intl.DateTimeFormat().resolvedOptions().timeZone`)。
            *   将这些值与硬编码默认值结合，形成初始的 `settings.value`。
            *   将这套初始设置保存到 `localStorage`。
        *   根据确定的语言设置 `i18n`。
    *   **如果已认证:**
        *   设置 `isUsingLocalStorage.value = false`。
        *   调用后端 `/settings` API (GET)。
        *   使用响应数据更新 `settings.value`。**移除** 此处补充默认值的逻辑。
        *   根据获取的语言设置 `i18n`。
        *   清除 `localStorage` 中的访客设置 (`localStorage.removeItem('nexus_guest_settings')`)。
3.  **`syncInitialSettingsOnLogin` Action:**
    *   此 action 在用户**首次**成功登录后被外部调用。
    *   读取当前的 `settings.value`。
    *   调用 `updateMultipleSettings` 将这些设置推送到后端。
4.  **`updateSetting` & `updateMultipleSettings` Actions:**
    *   检查 `authStore.isAuthenticated`。
    *   **如果已认证:**
        *   调用后端 `/settings` API (PUT)。
        *   API 调用成功后更新 `settings.value`。
    *   **如果未认证:**
        *   更新 `settings.value` 中的相应键值。
        *   将整个更新后的 `settings.value` 对象保存回 `localStorage`。
        *   **不**调用后端 API。
5.  **Getters:** 无需大的改动。

**阶段 3: 前端登录/认证逻辑调整**

1.  登录 API 调用成功后:
    *   检查响应中的 `isFirstLogin` 标志。
    *   如果 `isFirstLogin` 为 `true`:
        *   先调用 `settingsStore.loadInitialSettings()`。
        *   然后调用 `settingsStore.syncInitialSettingsOnLogin()`。
    *   如果 `isFirstLogin` 为 `false`:
        *   仅调用 `settingsStore.loadInitialSettings()`。

**阶段 4: 前端 `SettingsView.vue` 简化**

1.  移除用于同步本地组件状态和 store 的复杂 `watch` 逻辑。直接依赖 store 状态。
2.  确保所有保存操作都调用 `settingsStore.updateSetting` 或 `settingsStore.updateMultipleSettings`。

**Mermaid 流程图:**

```mermaid
graph TD
    subgraph Initialization [应用初始化]
        A[应用加载] --> B{用户是否已认证?};
        B -- 是 --> C[API GET /settings 获取用户设置];
        B -- 否 --> D{从 localStorage 加载访客设置?};
        D -- 是 --> E[解析 localStorage 数据];
        D -- 否 --> F[检测浏览器语言/时区];
        F --> G[结合硬编码默认值];
        G --> H[保存初始设置到 localStorage];
        E --> I[合并 localStorage 数据与硬编码默认值];
        C --> J[更新 Pinia 状态 (来自后端)];
        I --> K[更新 Pinia 状态 (来自 localStorage)];
        H --> K;
        J --> L[设置 i18n 语言];
        K --> L;
        C --> CL[清除 localStorage 访客设置]
    end

    subgraph Login [用户登录流程]
        M[登录成功] --> N{后端返回 isFirstLogin?};
        N -- 是 --> O[调用 settingsStore.loadInitialSettings() *];
        O --> P[调用 settingsStore.syncInitialSettingsOnLogin()];
        P --> Q[API PUT /settings (同步初始设置)];
        N -- 否 --> R[调用 settingsStore.loadInitialSettings()];
    end
    subgraph SettingsUpdate [设置更新流程]
        S[用户在 UI 修改设置] --> T{用户是否已认证?};
        T -- 是 --> U[调用 settingsStore.updateSetting/updateMultiple];
        U --> V[API PUT /settings];
        V --> W[更新 Pinia 状态];
        T -- 否 --> X[调用 settingsStore.updateSetting/updateMultiple];
        X --> Y[更新 Pinia 状态];
        Y --> Z[保存到 localStorage];
    end

    note right of O *加载可能已修改的访客设置，准备同步