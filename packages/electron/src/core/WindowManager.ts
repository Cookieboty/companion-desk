/**
 * 窗口管理器 - 统一管理所有窗口的创建、销毁和状态
 */

import { BrowserWindow, screen, app } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { ILoggerService } from '../services/LoggerService';
import { IConfigService } from '../services/ConfigService';
import { eventBus } from './EventBus';

export interface WindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  frame?: boolean;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  resizable?: boolean;
  show?: boolean;
  title?: string;
  preloadScript?: string;
}

export interface IWindowManager {
  createMainWindow(): Promise<BrowserWindow>;
  createAiChatWindow(): Promise<BrowserWindow>;
  getMainWindow(): BrowserWindow | null;
  getAiChatWindow(): BrowserWindow | null;
  closeAllWindows(): void;
  setAlwaysOnTop(windowType: 'main' | 'aiChat', flag: boolean): void;
}

export class WindowManager implements IWindowManager {
  private mainWindow: BrowserWindow | null = null;
  private aiChatWindow: BrowserWindow | null = null;
  private logger: ILoggerService;
  private configService: IConfigService;

  constructor(logger: ILoggerService, configService: IConfigService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * 创建主窗口
   */
  async createMainWindow(): Promise<BrowserWindow> {
    if (this.mainWindow) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const config = this.configService.getConfig();

      // 检查位置是否有效
      let x = config.windowPosition.x;
      let y = config.windowPosition.y;

      if (x <= 0 || x >= width || y <= 0 || y >= height) {
        x = width - 420;
        y = height - 450;
      }

      const windowOptions: WindowOptions = {
        width: 420,
        height: 450,
        x,
        y,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        show: false,
        preloadScript: 'preload.js'
      };

      this.mainWindow = await this.createWindow(windowOptions, 'main');

      // 设置窗口事件监听
      this.setupMainWindowEvents(this.mainWindow);

      // 加载应用页面
      await this.loadMainWindowContent(this.mainWindow);

      this.logger.info('主窗口创建成功');
      eventBus.emit('window:main:created', this.mainWindow);

      return this.mainWindow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('主窗口创建失败', { error: errorMessage });
      throw error;
    }
  }

  /**
   * 创建AI对话窗口
   */
  async createAiChatWindow(): Promise<BrowserWindow> {
    if (this.aiChatWindow) {
      this.aiChatWindow.focus();
      this.aiChatWindow.show();
      return this.aiChatWindow;
    }

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

      const windowWidth = 1000;
      const windowHeight = 800;
      const x = Math.round((screenWidth - windowWidth) / 2);
      const y = Math.round((screenHeight - windowHeight) / 2);

      const windowOptions: WindowOptions = {
        width: windowWidth,
        height: windowHeight,
        x,
        y,
        frame: true,
        transparent: false,
        alwaysOnTop: false,
        resizable: true,
        show: false,
        title: '智能助手',
        preloadScript: 'ai-chat-preload.js'
      };

      this.aiChatWindow = await this.createWindow(windowOptions, 'aiChat');

      // 设置窗口事件监听
      this.setupAiChatWindowEvents(this.aiChatWindow);

      // 加载AI对话页面
      await this.loadAiChatWindowContent(this.aiChatWindow);

      this.logger.info('AI对话窗口创建成功');
      eventBus.emit('window:aiChat:created', this.aiChatWindow);

      return this.aiChatWindow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('AI对话窗口创建失败', { error: errorMessage });
      throw error;
    }
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * 获取AI对话窗口
   */
  getAiChatWindow(): BrowserWindow | null {
    return this.aiChatWindow;
  }

  /**
   * 关闭所有窗口
   */
  closeAllWindows(): void {
    if (this.aiChatWindow) {
      this.aiChatWindow.close();
    }
    if (this.mainWindow) {
      this.mainWindow.close();
    }
  }

  /**
   * 设置窗口置顶状态
   */
  setAlwaysOnTop(windowType: 'main' | 'aiChat', flag: boolean): void {
    const window = windowType === 'main' ? this.mainWindow : this.aiChatWindow;
    if (window) {
      window.setAlwaysOnTop(flag);
      this.logger.debug(`窗口置顶状态已更新`, { windowType, flag });
    }
  }

  /**
   * 通用窗口创建方法
   */
  private async createWindow(options: WindowOptions, type: string): Promise<BrowserWindow> {
    const window = new BrowserWindow({
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      frame: options.frame,
      transparent: options.transparent,
      resizable: options.resizable,
      alwaysOnTop: options.alwaysOnTop,
      show: options.show,
      title: options.title,
      skipTaskbar: type === 'main',
      hasShadow: false,
      backgroundColor: type === 'main' ? '#00000000' : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', options.preloadScript || 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false // 开发环境需要
      }
    });

    // 通用窗口事件
    window.once('ready-to-show', () => {
      window.show();
      eventBus.emit(`window:${type}:ready`, window);
    });

    window.on('closed', () => {
      if (type === 'main') {
        this.mainWindow = null;
      } else if (type === 'aiChat') {
        this.aiChatWindow = null;
      }
      eventBus.emit(`window:${type}:closed`);
    });

    return window;
  }

  /**
   * 设置主窗口事件监听
   */
  private setupMainWindowEvents(window: BrowserWindow): void {
    // 鼠标位置检查
    this.setupMousePositionTracking(window);

    // 窗口移动事件
    window.on('moved', () => {
      const position = window.getPosition();
      this.configService.set('windowPosition.x', position[0]);
      this.configService.set('windowPosition.y', position[1]);
      this.configService.save().catch(error => {
        this.logger.error('保存窗口位置失败', { error: error.message });
      });
    });

    // 窗口关闭事件
    window.on('close', () => {
      eventBus.emit('app:quit');
    });
  }

  /**
   * 设置AI对话窗口事件监听
   */
  private setupAiChatWindowEvents(window: BrowserWindow): void {
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      this.logger.error('AI对话窗口加载失败', { errorCode, errorDescription });
    });

    window.webContents.on('did-finish-load', () => {
      this.logger.info('AI对话窗口内容加载完成');
    });
  }

  /**
   * 设置鼠标位置追踪
   */
  private setupMousePositionTracking(window: BrowserWindow): void {
    let mouseInWindow = false;

    const checkMousePosition = () => {
      if (!window || window.isDestroyed()) return;

      try {
        const cursorPos = screen.getCursorScreenPoint();
        const windowBounds = window.getBounds();

        const isInWindow = cursorPos.x >= windowBounds.x &&
          cursorPos.x <= windowBounds.x + windowBounds.width &&
          cursorPos.y >= windowBounds.y &&
          cursorPos.y <= windowBounds.y + windowBounds.height;

        if (isInWindow !== mouseInWindow) {
          mouseInWindow = isInWindow;
          const eventName = isInWindow ? 'window-mouse-enter' : 'window-mouse-leave';
          window.webContents.send(eventName);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('检查鼠标位置时出错', { error: errorMessage });
      }
    };

    const mouseCheckInterval = setInterval(checkMousePosition, 100);

    window.on('closed', () => {
      clearInterval(mouseCheckInterval);
    });
  }

  /**
   * 加载主窗口内容
   */
  private async loadMainWindowContent(window: BrowserWindow): Promise<void> {
    const isDev = process.env.NODE_ENV === 'development';
    let startUrl: string;

    if (isDev) {
      startUrl = 'http://localhost:3000';
    } else {
      // 生产环境路径处理
      const rendererPath = this.getRendererPath();
      startUrl = url.format({
        pathname: rendererPath,
        protocol: 'file:',
        slashes: true
      });
    }

    await window.loadURL(startUrl);
  }

  /**
   * 加载AI对话窗口内容
   */
  private async loadAiChatWindowContent(window: BrowserWindow): Promise<void> {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      const devUrl = 'http://localhost:5175';
      await window.loadURL(devUrl);
    } else {
      const aiChatPath = path.join(__dirname, '..', 'ai-chat', 'dist', 'index.html');
      await window.loadFile(aiChatPath);
    }
  }

  /**
   * 获取渲染器路径
   */
  private getRendererPath(): string {
    // macOS特定路径
    if (process.platform === 'darwin') {
      const macOSResourcesPath = path.join(
        path.dirname(path.dirname(app.getPath('exe'))),
        'Resources',
        'renderer',
        'index.html'
      );
      if (require('fs').existsSync(macOSResourcesPath)) {
        return macOSResourcesPath;
      }
    }

    // 常规resources目录
    const resourceRendererPath = path.join(
      app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath(),
      'resources',
      'renderer',
      'index.html'
    );

    return resourceRendererPath;
  }
}