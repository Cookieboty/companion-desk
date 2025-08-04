/**
 * 日志服务 - 提供分级日志功能
 * 支持控制台输出和文件输出
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: any;
  context?: string;
}

export interface ILoggerService {
  error(message: string, meta?: any, context?: string): void;
  warn(message: string, meta?: any, context?: string): void;
  info(message: string, meta?: any, context?: string): void;
  debug(message: string, meta?: any, context?: string): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

export class LoggerService implements ILoggerService {
  private level: LogLevel = LogLevel.INFO;
  private logDir: string;
  private logFile: string;
  private maxLogSize = 10 * 1024 * 1024; // 10MB
  private maxLogFiles = 5;

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.logFile = path.join(this.logDir, 'app.log');
    this.ensureLogDirectory();
  }

  /**
   * 记录错误日志
   */
  error(message: string, meta?: any, context?: string): void {
    this.log(LogLevel.ERROR, message, meta, context);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, meta?: any, context?: string): void {
    this.log(LogLevel.WARN, message, meta, context);
  }

  /**
   * 记录信息日志
   */
  info(message: string, meta?: any, context?: string): void {
    this.log(LogLevel.INFO, message, meta, context);
  }

  /**
   * 记录调试日志
   */
  debug(message: string, meta?: any, context?: string): void {
    this.log(LogLevel.DEBUG, message, meta, context);
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * 内部日志记录方法
   */
  private log(level: LogLevel, message: string, meta?: any, context?: string): void {
    if (level > this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      context
    };

    // 控制台输出
    this.logToConsole(entry);

    // 文件输出
    this.logToFile(entry);
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context ? `[${entry.context}] ` : '';
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';

    const message = `${entry.timestamp} ${levelName} ${contextStr}${entry.message}${metaStr}`;

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
    }
  }

  /**
   * 输出到文件
   */
  private logToFile(entry: LogEntry): void {
    try {
      const logLine = JSON.stringify(entry) + '\n';

      // 检查文件大小，如果超过限制则轮转
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          this.rotateLogFile();
        }
      }

      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  /**
   * 日志文件轮转
   */
  private rotateLogFile(): void {
    try {
      // 删除最老的日志文件
      const oldestLog = path.join(this.logDir, `app.${this.maxLogFiles - 1}.log`);
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }

      // 重命名现有日志文件
      for (let i = this.maxLogFiles - 2; i >= 0; i--) {
        const currentFile = i === 0 ? this.logFile : path.join(this.logDir, `app.${i}.log`);
        const newFile = path.join(this.logDir, `app.${i + 1}.log`);

        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, newFile);
        }
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * 获取日志文件路径
   */
  getLogFilePath(): string {
    return this.logFile;
  }

  /**
   * 清理旧日志文件
   */
  cleanOldLogs(daysToKeep: number = 7): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          this.info(`Cleaned old log file: ${file}`);
        }
      });
    } catch (error) {
      this.error('Failed to clean old logs', { error: error.message });
    }
  }
}