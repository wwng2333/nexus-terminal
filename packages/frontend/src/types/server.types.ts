// 类型定义：用于服务器状态监控数据 (从 useStatusMonitor 迁移)
export interface ServerStatus {
    cpuPercent?: number;
    memPercent?: number;
    memUsed?: number; // MB
    memTotal?: number; // MB
    diskPercent?: number;
    diskUsed?: number; // KB
    diskTotal?: number; // KB
    cpuModel?: string;
    // 可以根据后端实际发送的数据添加更多字段
    // 例如：swapPercent?, swapUsed?, swapTotal?, netRxRate?, netTxRate?, netInterface?, osName?, loadAvg?, timestamp?
}

// 可以根据需要添加其他与服务器或连接状态相关的类型
