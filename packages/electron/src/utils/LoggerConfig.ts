/**
 * 日志配置管理器
 * 提供灵活的日志配置和格式化功能
 */

import { LogLevel } from '../services/LoggerService';

export interface LoggerConfigOptions {
  level: LogLevel;
  enableFileOutput: boolean;
  enableConsoleOutput: boolean;
  maxLogSize: number;
  maxLogFiles: number;
  logFormat: 'simple' | 'detailed' | 'json';
  enableColors: boolean;
  enableTimestamps: boolean;
  enableContext: boolean;
  filterPatterns?: string[];
  enablePerformanceLogging: boolean;
}

export interface LogFormatter {
  formatMessage(entry: LogEntry): string;
  formatError(error: Error, context?: string): string;
  formatPerformance(operation: string, duration: number, metadata?: any): string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: any;
  context?: string;
  performance?: {
    operation: string;
    duration: number;
  };
}

export class LoggerConfig {
  private options: LoggerConfigOptions;
  private formatter: LogFormatter;

  constructor(options: Partial<LoggerConfigOptions> = {}) {
    this.options = {
      level: LogLevel.INFO,
      enableFileOutput: true,
      enableConsoleOutput: true,
      maxLogSize: 10 * 1024 * 1024, // 10MB
      maxLogFiles: 5,
      logFormat: 'detailed',
      enableColors: true,
      enableTimestamps: true,
      enableContext: true,
      enablePerformanceLogging: false,
      ...options
    };

    this.formatter = this.createFormatter();
  }

  /**
   * 获取配置选项
   */
  getOptions(): LoggerConfigOptions {
    return { ...this.options };
  }

  /**
   * 更新配置选项
   */
  updateOptions(updates: Partial<LoggerConfigOptions>): void {
    this.options = { ...this.options, ...updates };
    this.formatter = this.createFormatter();
  }

  /**
   * 获取格式化器
   */
  getFormatter(): LogFormatter {
    return this.formatter;
  }

  /**
   * 检查日志级别是否启用
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level <= this.options.level;
  }

  /**
   * 检查消息是否应该被过滤
   */
  shouldFilterMessage(message: string): boolean {
    if (!this.options.filterPatterns || this.options.filterPatterns.length === 0) {
      return false;
    }

    return this.options.filterPatterns.some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(message);
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * 创建格式化器
   */
  private createFormatter(): LogFormatter {
    switch (this.options.logFormat) {
      case 'simple':
        return new SimpleFormatter(this.options);
      case 'json':
        return new JsonFormatter(this.options);
      case 'detailed':
      default:
        return new DetailedFormatter(this.options);
    }
  }

  /**
   * 验证配置
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.options.maxLogSize <= 0) {
      errors.push('maxLogSize must be greater than 0');
    }

    if (this.options.maxLogFiles <= 0) {
      errors.push('maxLogFiles must be greater than 0');
    }

    if (!Object.values(LogLevel).includes(this.options.level)) {
      errors.push('Invalid log level');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取环境特定的配置
   */
  static getEnvironmentConfig(env: 'development' | 'production' | 'test'): LoggerConfigOptions {
    const baseConfig: LoggerConfigOptions = {
      level: LogLevel.INFO,
      enableFileOutput: true,
      enableConsoleOutput: true,
      maxLogSize: 10 * 1024 * 1024,
      maxLogFiles: 5,
      logFormat: 'detailed',
      enableColors: true,
      enableTimestamps: true,
      enableContext: true,
      enablePerformanceLogging: false
    };

    switch (env) {
      case 'development':
        return {
          ...baseConfig,
          level: LogLevel.DEBUG,
          enableColors: true,
          enablePerformanceLogging: true,
          logFormat: 'detailed'
        };

      case 'production':
        return {
          ...baseConfig,
          level: LogLevel.INFO,
          enableColors: false,
          logFormat: 'json',
          maxLogFiles: 10,
          filterPatterns: ['debug', 'trace']
        };

      case 'test':
        return {
          ...baseConfig,
          level: LogLevel.ERROR,
          enableFileOutput: false,
          enableColors: false,
          logFormat: 'simple'
        };

      default:
        return baseConfig;
    }
  }
}

/**
 * 简单格式化器
 */
class SimpleFormatter implements LogFormatter {
  constructor(private options: LoggerConfigOptions) { }

  formatMessage(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = this.options.enableTimestamps ? `${entry.timestamp} ` : '';
    const context = this.options.enableContext && entry.context ? `[${entry.context}] ` : '';

    return `${timestamp}${levelName} ${context}${entry.message}`;
  }

  formatError(error: Error, context?: string): string {
    const contextStr = context ? `[${context}] ` : '';
    return `ERROR ${contextStr}${error.message}`;
  }

  formatPerformance(operation: string, duration: number, metadata?: any): string {
    return `PERF ${operation} completed in ${duration}ms`;
  }
}

/**
 * 详细格式化器
 */
class DetailedFormatter implements LogFormatter {
  constructor(private options: LoggerConfigOptions) { }

  formatMessage(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = this.options.enableTimestamps ? entry.timestamp : '';
    const context = this.options.enableContext && entry.context ? entry.context : '';
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    const perfStr = entry.performance ? ` (${entry.performance.operation}: ${entry.performance.duration}ms)` : '';

    let formatted = `${timestamp} ${levelName}`;

    if (context) {
      formatted += ` [${context}]`;
    }

    formatted += ` ${entry.message}${metaStr}${perfStr}`;

    if (this.options.enableColors) {
      formatted = this.colorize(formatted, entry.level);
    }

    return formatted;
  }

  formatError(error: Error, context?: string): string {
    const timestamp = this.options.enableTimestamps ? new Date().toISOString() : '';
    const contextStr = context ? `[${context}] ` : '';

    let formatted = `${timestamp} ERROR ${contextStr}${error.message}`;

    if (error.stack) {
      formatted += `\n${error.stack}`;
    }

    if (this.options.enableColors) {
      formatted = this.colorize(formatted, LogLevel.ERROR);
    }

    return formatted;
  }

  formatPerformance(operation: string, duration: number, metadata?: any): string {
    const timestamp = this.options.enableTimestamps ? new Date().toISOString() : '';
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';

    let formatted = `${timestamp} PERF [${operation}] completed in ${duration}ms${metaStr}`;

    if (this.options.enableColors) {
      formatted = this.colorize(formatted, LogLevel.INFO);
    }

    return formatted;
  }

  private colorize(message: string, level: LogLevel): string {
    if (!this.options.enableColors) {
      return message;
    }

    const colors = {
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.DEBUG]: '\x1b[37m'  // White
    };

    const reset = '\x1b[0m';
    const color = colors[level] || colors[LogLevel.INFO];

    return `${color}${message}${reset}`;
  }
}

/**
 * JSON格式化器
 */
class JsonFormatter implements LogFormatter {
  constructor(private options: LoggerConfigOptions) { }

  formatMessage(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp,
      level: LogLevel[entry.level],
      message: entry.message,
      ...(entry.context && { context: entry.context }),
      ...(entry.meta && { meta: entry.meta }),
      ...(entry.performance && { performance: entry.performance })
    };

    return JSON.stringify(logObject);
  }

  formatError(error: Error, context?: string): string {
    const errorObject = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: error.message,
      ...(context && { context }),
      ...(error.stack && { stack: error.stack }),
      name: error.name
    };

    return JSON.stringify(errorObject);
  }

  formatPerformance(operation: string, duration: number, metadata?: any): string {
    const perfObject = {
      timestamp: new Date().toISOString(),
      level: 'PERF',
      operation,
      duration,
      ...(metadata && { metadata })
    };

    return JSON.stringify(perfObject);
  }
}

/**
 * 性能日志装饰器
 */
export function PerformanceLog(operation?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (this: any, ...args: any[]) {
      const startTime = Date.now();

      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;

        // 如果实例有logger属性，记录性能日志
        if (this.logger && typeof this.logger.info === 'function') {
          this.logger.info(`性能日志: ${operationName}`, {
            operation: operationName,
            duration,
            args: args.length
          });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error(`性能日志(失败): ${operationName}`, {
            operation: operationName,
            duration,
            error: errorMessage
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}