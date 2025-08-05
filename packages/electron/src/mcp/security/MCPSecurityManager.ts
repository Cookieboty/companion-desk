/**
 * MCP安全管理器
 * 提供MCP通信的安全验证、权限控制和审计功能
 */
export class MCPSecurityManager {
  private trustedCommands: Set<string>;
  private rateLimitMap: Map<string, RateLimitInfo>;
  private securityConfig: SecurityConfig;
  private auditLog: AuditLogEntry[];
  private isInitialized: boolean = false;

  constructor() {
    this.trustedCommands = new Set();
    this.rateLimitMap = new Map();
    this.auditLog = [];
    this.securityConfig = this.getDefaultSecurityConfig();
  }

  /**
   * 初始化安全管理器
   */
  async initialize(): Promise<void> {
    try {
      console.log('MCPSecurityManager: 开始初始化...');

      // 初始化信任命令列表
      this.initializeTrustedCommands();

      // 加载安全配置
      await this.loadSecurityConfig();

      // 启动清理任务
      this.startCleanupTasks();

      this.isInitialized = true;
      console.log('MCPSecurityManager: 初始化完成');

      // 记录初始化审计日志
      this.addAuditLog('SYSTEM', 'INIT', 'SecurityManager initialized', true);
    } catch (error) {
      console.error('MCPSecurityManager: 初始化失败:', error);
      this.addAuditLog('SYSTEM', 'INIT', `Initialization failed: ${error}`, false);
      throw error;
    }
  }

  /**
   * 验证工具调用
   */
  async validateToolCall(toolName: string, args: any, clientId?: string): Promise<boolean> {
    try {
      const requestId = Date.now().toString();
      console.log(`MCPSecurityManager: 验证工具调用 ${toolName} (${requestId})`);

      // 1. 检查工具是否在信任列表中
      if (!this.trustedCommands.has(toolName)) {
        console.warn(`不信任的工具调用: ${toolName}`);
        this.addAuditLog(clientId || 'unknown', 'TOOL_CALL', `Untrusted tool: ${toolName}`, false);
        return false;
      }

      // 2. 速率限制检查
      if (!this.checkRateLimit(clientId || 'default', toolName)) {
        console.warn(`速率限制超出: ${toolName} from ${clientId}`);
        this.addAuditLog(clientId || 'unknown', 'RATE_LIMIT', `Rate limit exceeded for ${toolName}`, false);
        return false;
      }

      // 3. 参数安全验证
      if (!this.validateArguments(toolName, args)) {
        console.warn(`参数验证失败: ${toolName}`);
        this.addAuditLog(clientId || 'unknown', 'ARG_VALIDATION', `Invalid arguments for ${toolName}`, false);
        return false;
      }

      // 4. 权限检查
      if (!this.checkPermissions(toolName, clientId)) {
        console.warn(`权限不足: ${toolName} for ${clientId}`);
        this.addAuditLog(clientId || 'unknown', 'PERMISSION', `Insufficient permissions for ${toolName}`, false);
        return false;
      }

      // 验证通过
      this.addAuditLog(clientId || 'unknown', 'TOOL_CALL', `Tool call validated: ${toolName}`, true);
      return true;
    } catch (error) {
      console.error('MCPSecurityManager: 验证失败:', error);
      this.addAuditLog(clientId || 'unknown', 'VALIDATION_ERROR', `Validation error: ${error}`, false);
      return false;
    }
  }

  /**
   * 初始化信任命令列表
   */
  private initializeTrustedCommands(): void {
    const trustedTools = [
      'explain_code',
      'show_animation',
      'voice_feedback',
      'gesture_guide'
    ];

    trustedTools.forEach(tool => this.trustedCommands.add(tool));
    console.log(`MCPSecurityManager: 已加载 ${this.trustedCommands.size} 个信任工具`);
  }

  /**
   * 速率限制检查
   */
  private checkRateLimit(clientId: string, toolName: string): boolean {
    const now = Date.now();
    const key = `${clientId}:${toolName}`;

    let rateLimitInfo = this.rateLimitMap.get(key);
    if (!rateLimitInfo) {
      rateLimitInfo = {
        count: 0,
        windowStart: now,
        lastRequest: now
      };
      this.rateLimitMap.set(key, rateLimitInfo);
    }

    // 检查时间窗口
    const windowDuration = this.securityConfig.rateLimits.windowMs;
    if (now - rateLimitInfo.windowStart > windowDuration) {
      // 重置窗口
      rateLimitInfo.count = 0;
      rateLimitInfo.windowStart = now;
    }

    // 检查请求频率
    const toolLimit = this.getToolRateLimit(toolName);
    if (rateLimitInfo.count >= toolLimit.maxRequests) {
      return false;
    }

    // 检查最小间隔
    if (now - rateLimitInfo.lastRequest < toolLimit.minInterval) {
      return false;
    }

    // 更新计数器
    rateLimitInfo.count++;
    rateLimitInfo.lastRequest = now;

    return true;
  }

  /**
   * 获取工具速率限制
   */
  private getToolRateLimit(toolName: string): ToolRateLimit {
    const defaultLimit = this.securityConfig.rateLimits.default;

    // 特殊工具的限制配置
    const toolLimits: Record<string, ToolRateLimit> = {
      'explain_code': { maxRequests: 20, minInterval: 1000 },
      'show_animation': { maxRequests: 30, minInterval: 500 },
      'voice_feedback': { maxRequests: 15, minInterval: 2000 },
      'gesture_guide': { maxRequests: 25, minInterval: 800 }
    };

    return toolLimits[toolName] || defaultLimit;
  }

  /**
   * 参数验证
   */
  private validateArguments(toolName: string, args: any): boolean {
    try {
      // 基础验证
      if (!args || typeof args !== 'object') {
        return false;
      }

      // 检查危险模式
      if (this.containsDangerousPatterns(args)) {
        return false;
      }

      // 工具特定验证
      return this.validateToolSpecificArgs(toolName, args);
    } catch (error) {
      console.error('参数验证异常:', error);
      return false;
    }
  }

  /**
   * 检查危险模式
   */
  private containsDangerousPatterns(args: any): boolean {
    const argString = JSON.stringify(args).toLowerCase();

    const dangerousPatterns = [
      'eval(',
      'function(',
      'script>',
      'javascript:',
      '__proto__',
      'constructor',
      'prototype',
      'require(',
      'import(',
      'process.',
      'fs.',
      'child_process'
    ];

    return dangerousPatterns.some(pattern => argString.includes(pattern));
  }

  /**
   * 工具特定参数验证
   */
  private validateToolSpecificArgs(toolName: string, args: any): boolean {
    switch (toolName) {
      case 'explain_code':
        return this.validateCodeExplanationArgs(args);
      case 'show_animation':
        return this.validateAnimationArgs(args);
      case 'voice_feedback':
        return this.validateVoiceArgs(args);
      case 'gesture_guide':
        return this.validateGestureArgs(args);
      default:
        return true;
    }
  }

  /**
   * 验证代码解释参数
   */
  private validateCodeExplanationArgs(args: any): boolean {
    if (!args.code || typeof args.code !== 'string') return false;
    if (args.code.length > 10000) return false; // 限制代码长度
    if (!args.language || typeof args.language !== 'string') return false;

    const allowedLanguages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust'];
    return allowedLanguages.includes(args.language.toLowerCase());
  }

  /**
   * 验证动画参数
   */
  private validateAnimationArgs(args: any): boolean {
    if (!args.animationType || typeof args.animationType !== 'string') return false;

    const allowedTypes = ['explaining', 'greeting', 'pointing', 'thinking', 'celebrating', 'confused', 'demonstrating', 'idle', 'custom'];
    if (!allowedTypes.includes(args.animationType)) return false;

    if (args.duration && (typeof args.duration !== 'number' || args.duration < 500 || args.duration > 30000)) {
      return false;
    }

    return true;
  }

  /**
   * 验证语音参数
   */
  private validateVoiceArgs(args: any): boolean {
    if (!args.text || typeof args.text !== 'string') return false;
    if (args.text.length > 5000) return false; // 限制文本长度

    if (args.language) {
      const allowedLanguages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      if (!allowedLanguages.includes(args.language)) return false;
    }

    return true;
  }

  /**
   * 验证手势参数
   */
  private validateGestureArgs(args: any): boolean {
    if (!args.gestureType || typeof args.gestureType !== 'string') return false;

    const allowedTypes = ['point', 'highlight', 'flow', 'contain', 'connect', 'separate', 'expand', 'compress', 'cycle', 'branch', 'warning', 'confirmation'];
    return allowedTypes.includes(args.gestureType);
  }

  /**
   * 权限检查
   */
  private checkPermissions(toolName: string, clientId?: string): boolean {
    // 目前所有信任的工具都有基础权限
    // 未来可以根据clientId实现更细粒度的权限控制
    return this.trustedCommands.has(toolName);
  }

  /**
   * 添加审计日志
   */
  private addAuditLog(clientId: string, action: string, details: string, success: boolean): void {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      clientId,
      action,
      details,
      success,
      ip: 'localhost', // Electron环境
      userAgent: 'electron'
    };

    this.auditLog.push(entry);

    // 限制日志大小
    if (this.auditLog.length > this.securityConfig.auditLog.maxEntries) {
      this.auditLog.splice(0, this.auditLog.length - this.securityConfig.auditLog.maxEntries);
    }

    // 记录到控制台（调试用）
    if (!success || this.securityConfig.auditLog.logLevel === 'debug') {
      console.log(`[AUDIT] ${clientId} ${action} ${success ? 'SUCCESS' : 'FAILED'}: ${details}`);
    }
  }

  /**
   * 获取默认安全配置
   */
  private getDefaultSecurityConfig(): SecurityConfig {
    return {
      rateLimits: {
        windowMs: 60000, // 1分钟窗口
        default: {
          maxRequests: 60,
          minInterval: 1000
        }
      },
      auditLog: {
        maxEntries: 1000,
        logLevel: 'info',
        retentionDays: 7
      },
      validation: {
        maxArgSize: 1024 * 1024, // 1MB
        maxTextLength: 10000,
        enablePatternCheck: true
      }
    };
  }

  /**
   * 加载安全配置
   */
  private async loadSecurityConfig(): Promise<void> {
    try {
      // 这里可以从配置文件加载
      // 目前使用默认配置
      console.log('MCPSecurityManager: 使用默认安全配置');
    } catch (error) {
      console.warn('加载安全配置失败，使用默认配置:', error);
    }
  }

  /**
   * 启动清理任务
   */
  private startCleanupTasks(): void {
    // 定期清理过期的速率限制数据
    setInterval(() => {
      this.cleanupRateLimitData();
    }, 5 * 60 * 1000); // 每5分钟清理一次

    // 定期清理审计日志
    setInterval(() => {
      this.cleanupAuditLog();
    }, 24 * 60 * 60 * 1000); // 每天清理一次
  }

  /**
   * 清理速率限制数据
   */
  private cleanupRateLimitData(): void {
    const now = Date.now();
    const cleanupThreshold = this.securityConfig.rateLimits.windowMs * 2;

    for (const [key, info] of this.rateLimitMap.entries()) {
      if (now - info.lastRequest > cleanupThreshold) {
        this.rateLimitMap.delete(key);
      }
    }
  }

  /**
   * 清理审计日志
   */
  private cleanupAuditLog(): void {
    const retentionMs = this.securityConfig.auditLog.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    this.auditLog = this.auditLog.filter(entry => entry.timestamp > cutoffTime);
  }

  /**
   * 获取安全状态
   */
  getStatus(): SecurityStatus {
    return {
      isInitialized: this.isInitialized,
      trustedCommandsCount: this.trustedCommands.size,
      rateLimitClientsCount: this.rateLimitMap.size,
      auditLogEntriesCount: this.auditLog.length,
      lastActivity: this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1].timestamp : null
    };
  }

  /**
   * 获取审计日志
   */
  getAuditLog(limit?: number): AuditLogEntry[] {
    const logs = [...this.auditLog].reverse(); // 最新的在前
    return limit ? logs.slice(0, limit) : logs;
  }

  /**
   * 获取速率限制统计
   */
  getRateLimitStats(): RateLimitStats {
    const stats: RateLimitStats = {
      totalClients: this.rateLimitMap.size,
      activeClients: 0,
      topTools: {}
    };

    const now = Date.now();
    const activeThreshold = 5 * 60 * 1000; // 5分钟内活跃

    for (const [key, info] of this.rateLimitMap.entries()) {
      if (now - info.lastRequest < activeThreshold) {
        stats.activeClients++;

        const [, toolName] = key.split(':');
        if (!stats.topTools[toolName]) {
          stats.topTools[toolName] = 0;
        }
        stats.topTools[toolName] += info.count;
      }
    }

    return stats;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      console.log('MCPSecurityManager: 清理资源...');

      this.trustedCommands.clear();
      this.rateLimitMap.clear();
      this.auditLog = [];
      this.isInitialized = false;

      console.log('MCPSecurityManager: 清理完成');
    } catch (error) {
      console.error('MCPSecurityManager: 清理失败:', error);
    }
  }
}

/**
 * 速率限制信息接口
 */
interface RateLimitInfo {
  count: number;
  windowStart: number;
  lastRequest: number;
}

/**
 * 工具速率限制接口
 */
interface ToolRateLimit {
  maxRequests: number;
  minInterval: number;
}

/**
 * 安全配置接口
 */
interface SecurityConfig {
  rateLimits: {
    windowMs: number;
    default: ToolRateLimit;
  };
  auditLog: {
    maxEntries: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    retentionDays: number;
  };
  validation: {
    maxArgSize: number;
    maxTextLength: number;
    enablePatternCheck: boolean;
  };
}

/**
 * 审计日志条目接口
 */
interface AuditLogEntry {
  timestamp: number;
  clientId: string;
  action: string;
  details: string;
  success: boolean;
  ip: string;
  userAgent: string;
}

/**
 * 安全状态接口
 */
interface SecurityStatus {
  isInitialized: boolean;
  trustedCommandsCount: number;
  rateLimitClientsCount: number;
  auditLogEntriesCount: number;
  lastActivity: number | null;
}

/**
 * 速率限制统计接口
 */
interface RateLimitStats {
  totalClients: number;
  activeClients: number;
  topTools: Record<string, number>;
}