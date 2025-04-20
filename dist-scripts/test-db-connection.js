"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var sqlite3_1 = __importDefault(require("sqlite3"));
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
// --- 配置 ---
// 使用与 connection.ts 中相同的路径逻辑
var dbDir = path_1.default.resolve(__dirname, '../packages/backend/data');
var dbPath = path_1.default.join(dbDir, 'nexus-terminal-test-connection.db'); // 使用不同的测试文件名避免冲突
var flags = sqlite3_1.default.OPEN_READWRITE | sqlite3_1.default.OPEN_CREATE;
console.log("[Test Script] \u6D4B\u8BD5\u6570\u636E\u5E93\u76EE\u5F55: ".concat(dbDir));
console.log("[Test Script] \u6D4B\u8BD5\u6570\u636E\u5E93\u6587\u4EF6\u8DEF\u5F84: ".concat(dbPath));
console.log("[Test Script] \u4F7F\u7528\u7684\u6807\u5FD7: READWRITE | CREATE");
// --- 测试函数 ---
function testConnection(filePath, openFlags) {
    return new Promise(function (resolve, reject) {
        var connectionFailed = false; // 跟踪连接错误
        var successPathReached = false; // 跟踪是否进入成功回调
        var errorFromCallback = null; // 存储回调中的错误
        console.log("[Test Function] \u51C6\u5907\u8FDE\u63A5: ".concat(filePath));
        // 确保目录存在 (如果不存在则创建)
        var dir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(dir)) {
            console.log("[Test Function] \u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u521B\u5EFA: ".concat(dir));
            try {
                fs_1.default.mkdirSync(dir, { recursive: true });
                console.log("[Test Function] \u76EE\u5F55\u521B\u5EFA\u6210\u529F: ".concat(dir));
            }
            catch (mkdirErr) {
                console.error("[Test Function] \u521B\u5EFA\u76EE\u5F55\u5931\u8D25: ".concat(mkdirErr.message));
                reject("\u521B\u5EFA\u76EE\u5F55\u5931\u8D25: ".concat(mkdirErr.message));
                return;
            }
        }
        else {
            console.log("[Test Function] \u76EE\u5F55\u5DF2\u5B58\u5728: ".concat(dir));
        }
        // 删除旧的测试文件（如果存在）以确保干净的测试环境
        if (fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
                console.log("[Test Function] \u5DF2\u5220\u9664\u65E7\u7684\u6D4B\u8BD5\u6587\u4EF6: ".concat(filePath));
            }
            catch (unlinkErr) {
                console.warn("[Test Function] \u5220\u9664\u65E7\u6D4B\u8BD5\u6587\u4EF6\u5931\u8D25 (\u53EF\u80FD\u88AB\u9501\u5B9A?): ".concat(unlinkErr.message));
                // 不阻止测试继续，但记录警告
            }
        }
        var db = new sqlite3_1.default.Database(filePath, openFlags, function (err) {
            console.log('[Test Callback] 回调函数被触发');
            if (err) {
                console.error("[Test Callback] \u56DE\u8C03\u6536\u5230\u9519\u8BEF: ".concat(err.message));
                errorFromCallback = err;
                connectionFailed = true;
                // 注意：我们在这里故意不 reject 或 return，以模拟原始代码中可能的问题
                // reject(`回调错误: ${err.message}`); // 正常应该在这里 reject
                // return;
            }
            else {
                console.log('[Test Callback] 回调未收到错误 (成功路径)');
                successPathReached = true;
                // db.close(); // 正常应该在这里关闭连接
                // resolve("连接成功 (回调)"); // 正常应该在这里 resolve
            }
        });
        // 为了模拟异步回调完成，我们设置一个短暂的延迟
        // 这不是完美的，但可以帮助我们看到回调执行后的状态
        setTimeout(function () {
            var _a;
            console.log('[Test Timeout] 检查最终状态...');
            console.log("[Test Timeout] connectionFailed \u6807\u5FD7: ".concat(connectionFailed));
            console.log("[Test Timeout] successPathReached \u6807\u5FD7: ".concat(successPathReached));
            console.log("[Test Timeout] errorFromCallback: ".concat((_a = errorFromCallback === null || errorFromCallback === void 0 ? void 0 : errorFromCallback.message) !== null && _a !== void 0 ? _a : 'null'));
            // 根据标志判断最终结果
            if (connectionFailed && successPathReached) {
                reject("\u6D4B\u8BD5\u5931\u8D25\uFF1A\u68C0\u6D4B\u5230\u9519\u8BEF (".concat(errorFromCallback === null || errorFromCallback === void 0 ? void 0 : errorFromCallback.message, ")\uFF0C\u4F46\u6210\u529F\u8DEF\u5F84\u4E5F\u88AB\u6267\u884C\uFF01"));
            }
            else if (connectionFailed) {
                reject("\u6D4B\u8BD5\u5931\u8D25\uFF1A\u8FDE\u63A5\u65F6\u53D1\u751F\u9519\u8BEF: ".concat(errorFromCallback === null || errorFromCallback === void 0 ? void 0 : errorFromCallback.message));
            }
            else if (successPathReached) {
                // 尝试关闭数据库
                db.close(function (closeErr) {
                    if (closeErr) {
                        console.error("[Test Timeout] \u5173\u95ED\u6210\u529F\u8FDE\u63A5\u65F6\u51FA\u9519: ".concat(closeErr.message));
                        resolve("\u6D4B\u8BD5\u6210\u529F\uFF1A\u8FDE\u63A5\u6210\u529F\uFF0C\u4F46\u5173\u95ED\u65F6\u51FA\u9519: ".concat(closeErr.message));
                    }
                    else {
                        console.log('[Test Timeout] 数据库连接已成功关闭。');
                        resolve("测试成功：连接成功并已关闭。");
                    }
                });
            }
            else {
                // 如果回调从未被正确触发（理论上不太可能，除非超时太短）
                reject("测试失败：超时后未检测到成功或失败状态。");
            }
        }, 1000); // 等待 1 秒让回调执行
    });
}
// --- 执行测试 ---
console.log('--- 开始数据库连接测试 ---');
testConnection(dbPath, flags)
    .then(function (result) {
    console.log('--- 测试结果 ---');
    console.log(result);
    process.exit(0); // 成功退出
})
    .catch(function (error) {
    console.error('--- 测试结果 ---');
    console.error(error);
    process.exit(1); // 失败退出
});
