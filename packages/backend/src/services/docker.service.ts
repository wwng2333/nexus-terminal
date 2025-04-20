import { exec } from 'child_process';
import { promisify } from 'util';
// import { Service } from 'typedi'; // Removed typedi import
// import { logger } from '../utils/logger'; // Removed logger import

const execAsync = promisify(exec);

// --- Interfaces (与前端 DockerManager.vue 中的定义保持一致) ---
// 理想情况下，这些类型应该放在共享的 types 包中
interface PortInfo {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: 'tcp' | 'udp' | string;
}

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: 'created' | 'restarting' | 'running' | 'removing' | 'paused' | 'exited' | 'dead' | string;
  Status: string;
  Ports: PortInfo[];
  Labels: Record<string, string>;
  // 根据 `docker ps --format '{{json .}}'` 的输出添加其他需要的字段
}

// 定义命令类型
export type DockerCommand = 'start' | 'stop' | 'restart' | 'remove'; // 使用实际的 docker 命令

// @Service() // Removed typedi decorator
export class DockerService {
  private isDockerAvailableCache: boolean | null = null;
  private readonly commandTimeout = 15000; // 15 秒超时

  /**
   * 检查 Docker CLI 是否可用。包含缓存以避免重复检查。
   */
  async checkDockerAvailability(): Promise<boolean> {
    if (this.isDockerAvailableCache !== null) {
      return this.isDockerAvailableCache;
    }

    try {
      // 尝试执行一个简单的 docker 命令，如 docker version
      await execAsync('docker version', { timeout: 5000 }); // 5秒超时
      console.log('[DockerService] Docker is available.'); // Use console.log
      this.isDockerAvailableCache = true;
      return true;
    } catch (error: any) {
      console.warn('[DockerService] Docker check failed. Docker might not be installed or running.', { error: error.message }); // Use console.warn
      this.isDockerAvailableCache = false;
      return false;
    }
  }

  /**
   * 获取所有 Docker 容器的状态 (包括已停止的)。
   */
  async getContainerStatus(): Promise<{ available: boolean; containers: DockerContainer[] }> {
    const available = await this.checkDockerAvailability();
    if (!available) {
      return { available: false, containers: [] };
    }

    try {
      // 使用 --format '{{json .}}' 获取每个容器的 JSON 输出
      // 使用 --no-trunc 避免 ID 被截断
      const { stdout } = await execAsync("docker ps -a --no-trunc --format '{{json .}}'", { timeout: this.commandTimeout });

      // stdout 包含多行 JSON，每行一个容器
      const lines = stdout.trim().split('\n');
      const containers: DockerContainer[] = lines
        .map(line => {
          try {
            // Docker 的 JSON 输出有时可能不是严格的 JSON (例如 Names 字段)，需要处理
            // 尝试更健壮的解析或预处理
            const data = JSON.parse(line);
            // 手动解析 Names 字段 (docker ps format 的 Names 是逗号分隔的)
            if (typeof data.Names === 'string') {
                data.Names = data.Names.split(',');
            }
            // 解析 Ports 字段 (可能需要更复杂的逻辑来匹配前端接口)
            // docker ps format 的 Ports 字段格式比较复杂，直接用 JSON 可能不包含所有信息
            // 这里暂时依赖 JSON 输出，如果需要更详细的端口信息，可能需要 `docker inspect`
            // 假设 JSON 输出的 Ports 字段是符合我们接口的数组 (这可能需要调整命令或后端处理)
             if (!Array.isArray(data.Ports)) {
                 data.Ports = []; // 如果 Ports 不是数组，置为空数组
             }

            return data as DockerContainer;
          } catch (parseError) {
            console.error(`[DockerService] Failed to parse container JSON line: ${line}`, { error: parseError }); // Use console.error
            return null;
          }
        })
        .filter((container): container is DockerContainer => container !== null); // 过滤掉解析失败的行

      return { available: true, containers };
    } catch (error: any) {
      console.error('[DockerService] Failed to execute "docker ps"', { error: error.message, stderr: error.stderr }); // Use console.error
      // 如果执行 docker ps 失败，可能意味着 Docker 服务出问题了
      this.isDockerAvailableCache = false; // 重置可用性缓存
      return { available: false, containers: [] };
    }
  }

  /**
   * 对指定的容器执行命令。
   * @param containerId 容器 ID
   * @param command 命令 ('start', 'stop', 'restart', 'remove')
   */
  async executeContainerCommand(containerId: string, command: DockerCommand): Promise<void> {
    const available = await this.checkDockerAvailability();
    if (!available) {
      throw new Error('Docker is not available.');
    }

    // 参数校验和清理，防止命令注入
    const cleanContainerId = containerId.replace(/[^a-zA-Z0-9_-]/g, '');
     if (!cleanContainerId) {
         throw new Error('Invalid container ID format.');
     }

    let dockerCliCommand: string;
    switch (command) {
      case 'start':
        dockerCliCommand = `docker start ${cleanContainerId}`;
        break;
      case 'stop':
        dockerCliCommand = `docker stop ${cleanContainerId}`;
        break;
      case 'restart':
        dockerCliCommand = `docker restart ${cleanContainerId}`;
        break;
      case 'remove':
        // 使用 -f 强制删除正在运行的容器，对应前端的 'down' 意图
        dockerCliCommand = `docker rm -f ${cleanContainerId}`;
        break;
      default:
        // 防止未知的命令类型
        console.error(`[DockerService] Received unknown command type: ${command}`); // Use console.error
        throw new Error(`Unsupported Docker command: ${command}`);
    }

    console.log(`[DockerService] Executing command: ${dockerCliCommand}`); // Use console.log
    try {
      const { stdout, stderr } = await execAsync(dockerCliCommand, { timeout: this.commandTimeout });
      if (stderr) {
        // Docker 命令有时会将正常信息输出到 stderr (例如 rm 返回容器 ID)
        // 但也可能包含错误信息
        console.warn(`[DockerService] Command "${dockerCliCommand}" produced stderr:`, { stderr }); // Use console.warn
        // 可以根据 stderr 内容判断是否真的是错误
        if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
             throw new Error(`Docker command failed: ${stderr}`);
        }
      }
      console.log(`[DockerService] Command "${dockerCliCommand}" executed successfully.`, { stdout }); // Use console.log
    } catch (error: any) {
      console.error(`[DockerService] Failed to execute command "${dockerCliCommand}"`, { error: error.message, stderr: error.stderr }); // Use console.error
      // 抛出错误，让 Controller 层处理并返回给前端
      throw new Error(`Failed to execute Docker command "${command}": ${error.stderr || error.message}`);
    }
  }
}