/**
 * 应用程序主类 - 应用的核心控制器
 * 负责应用初始化、服务注册和生命周期管理
 */

import { app, ipcMain } from 'electron';
import { ServiceContainer, IServiceContainer } from './ServiceContainer';
import { LoggerService, LogLevel } from '../services/LoggerService';
import { ConfigService } from '../services/ConfigService';
import { CacheService } from '../services/CacheService';
import { WindowManager } from './WindowManager';
import { GlobalErrorHandler } from '../utils/ErrorHandler';
import { IpcRegistry } from '../handlers/ipc/IpcRegistry';
import { BootstrapManager } from './BootstrapManager';
import { eventBus } from './EventBus';
import { startAIRuntime, type AIRuntimeBootHandle } from '../ai/AIRuntimeBoot';
import { SafeKeyProvider } from '../ai/SafeKeyProvider';
import { ClipboardGateway } from '../ai/ClipboardGateway';
import { ScreenCapture } from '../ai/ScreenCapture';

export interface IApplication {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getServiceContainer(): IServiceContainer;
}

export class Application implements IApplication {
  private container: IServiceContainer;
  private logger!: LoggerService;
  private configService!: ConfigService;
  private cacheService!: CacheService;
  private windowManager!: WindowManager;
  private errorHandler!: GlobalErrorHandler;
  private ipcRegistry!: IpcRegistry;
  private bootstrapManager!: BootstrapManager;
  private aiRuntime?: AIRuntimeBootHandle;
  private clipboardGateway?: ClipboardGateway;
  private isInitialized = false;

  constructor() {
    this.container = new ServiceContainer();
    this.setupServices();
  }

  /**
   * 初始化应用
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 设置开发环境日志级别
      if (process.env.NODE_ENV === 'development') {
        this.logger.setLevel(LogLevel.DEBUG);
      }

      this.logger.info('开始初始化应用...');

      // 设置启动任务
      this.setupBootstrapTasks();

      // 执行启动任务
      const metrics = await this.bootstrapManager.start();
      this.logger.info('启动任务执行完成', {
        duration: metrics.totalDuration,
        taskCount: metrics.taskMetrics.length
      });

      this.isInitialized = true;
      this.logger.info('应用初始化完成');

      eventBus.emit('app:initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('应用初始化失败', { error: errorMessage });
      throw error;
    }
  }

  /**
   * 启动应用
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.logger.info('启动应用...');

      // 等待Electron app ready事件
      await app.whenReady();
      this.logger.info('Electron应用准备就绪');

      // 启动 AI runtime（在窗口创建之前，preload 到 renderer 时 IPC 通道已就绪）
      await this.startAIRuntime();

      // 创建主窗口
      await this.windowManager.createMainWindow();

      this.logger.info('应用启动完成');
      eventBus.emit('app:started');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('应用启动失败', { error: errorMessage });
      throw error;
    }
  }

  /**
   * 启动 AI runtime（dsh + IPC 通道 + seams）
   *
   * 幂等：重复调用会直接返回。失败时记录日志但不抛出——AI 功能对应用启动
   * 不是强依赖；后续可以通过 `getAIRuntime()` 判断可用性。
   */
  async startAIRuntime(): Promise<void> {
    if (this.aiRuntime) {
      this.logger.debug('AI runtime already started');
      return;
    }
    try {
      const keyStore = new SafeKeyProvider();
      this.clipboardGateway = new ClipboardGateway();
      const screen = new ScreenCapture();
      this.aiRuntime = await startAIRuntime(this.logger, {
        seams: {
          keyStore,
          clipboard: this.clipboardGateway,
          screen,
        },
      });
      this.logger.info('AI runtime 启动完成', {
        profile: this.aiRuntime.profile,
        channelCount: this.aiRuntime.channels.business.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('AI runtime 启动失败', { error: errorMessage });
    }
  }

  /**
   * 停止 AI runtime；幂等。
   */
  async stopAIRuntime(): Promise<void> {
    if (!this.aiRuntime) return;
    const handle = this.aiRuntime;
    this.aiRuntime = undefined;
    try {
      await handle.dispose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('AI runtime 停止时出现异常', { error: errorMessage });
    }
    try {
      this.clipboardGateway?.dispose();
    } catch {
      /* ignore */
    }
    this.clipboardGateway = undefined;
  }

  /**
   * 停止应用
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('停止应用...');

      // 停止 AI runtime（务必先于 IPC 清理，避免通道注册器空指针）
      await this.stopAIRuntime();

      // 保存配置
      await this.configService.save();

      // 清理IPC处理器
      this.ipcRegistry.cleanup();

      // 关闭所有窗口
      this.windowManager.closeAllWindows();

      // 清理资源
      this.cleanup();

      this.logger.info('应用已停止');
      eventBus.emit('app:stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('应用停止失败', { error: errorMessage });
      throw error;
    }
  }

  /**
   * 获取服务容器
   */
  getServiceContainer(): IServiceContainer {
    return this.container;
  }

  /**
   * 设置服务
   */
  private setupServices(): void {
    // 注册日志服务（单例）
    this.container.registerSingleton('logger', () => {
      return new LoggerService();
    });
    this.logger = this.container.get<LoggerService>('logger');

    // 注册配置服务（单例）
    this.container.registerSingleton('config', () => {
      return new ConfigService(this.logger);
    });
    this.configService = this.container.get<ConfigService>('config');

    // 注册缓存服务（单例）
    this.container.registerSingleton('cache', () => {
      return new CacheService({ maxSize: 500, defaultTtl: 10 * 60 * 1000 }, this.logger);
    });
    this.cacheService = this.container.get<CacheService>('cache');

    // 注册错误处理器（单例）
    this.container.registerSingleton('errorHandler', () => {
      return new GlobalErrorHandler(this.logger);
    });
    this.errorHandler = this.container.get<GlobalErrorHandler>('errorHandler');

    // 注册窗口管理器（单例）
    this.container.registerSingleton('windowManager', () => {
      return new WindowManager(this.logger, this.configService);
    });
    this.windowManager = this.container.get<WindowManager>('windowManager');

    // 注册IPC注册器（单例）
    this.container.registerSingleton('ipcRegistry', () => {
      return new IpcRegistry({
        logger: this.logger,
        configService: this.configService,
        cacheService: this.cacheService,
        windowManager: this.windowManager
      });
    });
    this.ipcRegistry = this.container.get<IpcRegistry>('ipcRegistry');

    // 注册启动管理器（单例）
    this.container.registerSingleton('bootstrapManager', () => {
      return new BootstrapManager(this.logger);
    });
    this.bootstrapManager = this.container.get<BootstrapManager>('bootstrapManager');
  }

  /**
   * 设置启动任务
   */
  private setupBootstrapTasks(): void {
    // 关键任务：配置加载
    this.bootstrapManager.addTask({
      name: 'load-config',
      priority: 'critical',
      execute: async () => {
        await this.configService.load();
      }
    });

    // 关键任务：应用事件设置
    this.bootstrapManager.addTask({
      name: 'setup-app-events',
      priority: 'critical',
      execute: async () => {
        this.setupAppEvents();
      },
      dependencies: ['load-config']
    });

    // 关键任务：IPC处理器初始化
    this.bootstrapManager.addTask({
      name: 'initialize-ipc',
      priority: 'critical',
      execute: async () => {
        this.ipcRegistry.initialize();
      },
      dependencies: ['load-config']
    });

    // 高优先级任务：进程信号处理
    this.bootstrapManager.addTask({
      name: 'setup-process-handlers',
      priority: 'high',
      execute: async () => {
        this.setupProcessHandlers();
      }
    });

    // 中优先级任务：缓存预热
    this.bootstrapManager.addTask({
      name: 'cache-warmup',
      priority: 'medium',
      delay: 100,
      execute: async () => {
        // 预热常用配置缓存
        const config = this.configService.getConfig();
        this.cacheService.set('app:config', config, 30 * 60 * 1000); // 30分钟缓存

        // 预热应用信息缓存
        const appInfo = {
          version: app.getVersion(),
          name: app.getName(),
          isPackaged: app.isPackaged
        };
        this.cacheService.set('app:info', appInfo, 60 * 60 * 1000); // 1小时缓存
      }
    });

    // 低优先级任务：日志清理
    this.bootstrapManager.addTask({
      name: 'cleanup-old-logs',
      priority: 'low',
      delay: 1000,
      execute: async () => {
        try {
          this.logger.cleanOldLogs(7); // 清理7天前的日志
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn('清理旧日志失败', { error: errorMessage });
        }
      }
    });

    // 低优先级任务：系统信息收集
    this.bootstrapManager.addTask({
      name: 'collect-system-info',
      priority: 'low',
      delay: 2000,
      execute: async () => {
        const systemInfo = {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          electronVersion: process.versions.electron,
          memory: process.memoryUsage()
        };
        this.logger.info('系统信息', systemInfo);
      }
    });
  }

  /**
   * 设置应用事件
   */
  private setupAppEvents(): void {
    // 应用准备就绪
    app.whenReady().then(() => {
      this.logger.info('Electron应用准备就绪');
      eventBus.emit('electron:ready');
    });

    // 所有窗口关闭
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // 应用激活
    app.on('activate', async () => {
      if (this.windowManager.getMainWindow() === null) {
        await this.windowManager.createMainWindow();
      }
    });

    // 应用退出前
    app.on('before-quit', async () => {
      await this.stop();
    });

    // 事件总线事件
    eventBus.on('app:quit', () => {
      app.quit();
    });
  }



  /**
   * 设置进程信号处理
   */
  private setupProcessHandlers(): void {
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      this.logger.error('未捕获的异常', { error: error.message, stack: error.stack });
      // 在生产环境中，可能需要重启应用
      if (process.env.NODE_ENV === 'production') {
        app.quit();
      }
    });

    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('未处理的Promise拒绝', { reason, promise });
    });

    // 优雅关闭
    process.on('SIGTERM', () => {
      this.logger.info('收到SIGTERM信号，开始优雅关闭...');
      this.stop().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      this.logger.info('收到SIGINT信号，开始优雅关闭...');
      this.stop().then(() => {
        process.exit(0);
      });
    });
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    try {
      // 清理事件监听器
      eventBus.clear();

      // 清理服务容器
      this.container.clear();

      this.logger.info('资源清理完成');
    } catch (error) {
      console.error('资源清理失败:', error);
    }
  }

  /**
   * 获取应用状态
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      mainWindow: !!this.windowManager.getMainWindow(),
      aiChatWindow: !!this.windowManager.getAiChatWindow(),
      config: this.configService.getConfig(),
      ipc: this.ipcRegistry.getStats(),
      cache: this.cacheService.getStats(),
      bootstrap: {
        taskStatus: this.bootstrapManager.getTaskStatus(),
        performanceReport: this.bootstrapManager.getPerformanceReport()
      }
    };
  }
}