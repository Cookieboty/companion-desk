/**
 * 日志级别类型
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'trace';

/**
 * 日志类
 */
class Logger {
  private level: LogLevel = 'info';
  private prefix: string = '[Live2D]';

  /**
   * 设置日志级别
   * @param level 日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 设置日志前缀
   * @param prefix 日志前缀
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  /**
   * 获取当前日志级别的数值
   * @returns 日志级别数值
   */
  private getLevelValue(level: LogLevel): number {
    switch (level) {
      case 'error': return 0;
      case 'warn': return 1;
      case 'info': return 2;
      case 'trace': return 3;
      default: return 2;
    }
  }

  /**
   * 检查是否应该记录此级别的日志
   * @param level 日志级别
   * @returns 是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    return this.getLevelValue(level) <= this.getLevelValue(this.level);
  }

  /**
   * 格式化日志消息
   * @param message 消息内容
   * @returns 格式化后的消息
   */
  private formatMessage(message: string): string {
    return `${this.prefix} ${message}`;
  }

  /**
   * 记录错误日志
   * @param message 消息内容
   * @param optionalParams 可选参数
   */
  error(message: string, ...optionalParams: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage(message), ...optionalParams);
    }
  }

  /**
   * 记录警告日志
   * @param message 消息内容
   * @param optionalParams 可选参数
   */
  warn(message: string, ...optionalParams: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage(message), ...optionalParams);
    }
  }

  /**
   * 记录信息日志
   * @param message 消息内容
   * @param optionalParams 可选参数
   */
  info(message: string, ...optionalParams: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage(message), ...optionalParams);
    }
  }

  /**
   * 记录跟踪日志
   * @param message 消息内容
   * @param optionalParams 可选参数
   */
  trace(message: string, ...optionalParams: any[]): void {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage(message), ...optionalParams);
    }
  }
}

// 创建单例
const logger = new Logger();

export default logger;
