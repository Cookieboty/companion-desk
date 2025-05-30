import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

// 添加全局键盘监听依赖
let globalKeyboardListener: any = null;
try {
  // 尝试导入 node-global-key-listener
  const { GlobalKeyboardListener } = require('node-global-key-listener');
  globalKeyboardListener = GlobalKeyboardListener;
} catch (error) {
  console.error('主进程: node-global-key-listener加载失败:', error);
  console.warn('主进程: 全局键盘监听功能将不可用');
}

// 配置文件路径
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');


// 默认配置
interface AppConfig {
  windowPosition: { x: number; y: number };
  modelName: string;
  voiceSettings: VoiceSettings;
}

interface VoiceSettings {
  enabled: boolean;
  volume: number;
  keyboardListening: boolean;
  timeAnnouncement: boolean;
  voicePackPath: string;
}

const defaultConfig: AppConfig = {
  windowPosition: { x: 0, y: 0 },
  modelName: '',
  voiceSettings: {
    enabled: true,
    volume: 0.8,
    keyboardListening: true,
    timeAnnouncement: true,
    voicePackPath: 'packages/renderer/public/assets/voice'
  }
};

// 加载配置
function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (err) {
    console.error('读取配置文件失败:', err);
  }
  return { ...defaultConfig };
}

// 保存配置
function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('保存配置文件失败:', err);
  }
}

// 开发模式下启用热重载
const isDev = process.env.NODE_ENV === 'development';
if (isDev) {
  try {
    // 尝试加载electron-reload，如果没有安装则会抛出错误
    // 这样可以避免在生产环境中出现问题
    require('electron-reload')(__dirname, {
      electron: require('electron'),
      hardResetMethod: 'exit',
      // 监视这些文件的变化
      watched: [
        path.join(__dirname, '..', 'dist', '**'),
        path.join(__dirname, '..', 'src', '**'),
        path.join(__dirname, '..', '..', 'renderer', 'dist', '**')
      ]
    });
  } catch (err) {
    console.error('无法启用热重载，请确保已安装electron-reload:', err);
  }
}

// 保持一个对窗口对象的全局引用，如果不这样做，当 JavaScript 对象被
// 垃圾回收，窗口会自动关闭
let mainWindow: BrowserWindow | null = null;

// 全局键盘监听器实例
let keyboardListener: any = null;
let isKeyboardListening = false;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // 加载保存的配置
  const config = loadConfig();

  // 检查位置是否有效，如果无效或是首次运行则使用默认位置
  let x = config.windowPosition.x;
  let y = config.windowPosition.y;

  // 如果位置超出屏幕范围，使用默认位置
  if (x <= 0 || x >= width || y <= 0 || y >= height) {
    x = width - 300;
    y = height - 400;
  }

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 380,
    height: 450,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // 关闭阴影
    x: x,
    y: y,
    backgroundColor: '#00000000',
    // Windows特定优化
    ...(process.platform === 'win32' && {
      thickFrame: false,
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true  // 确保开发者工具可用
    }
  });

  // 添加窗口鼠标事件监听
  let mouseInWindow = false;

  // 定期检查鼠标位置
  const checkMousePosition = () => {
    if (!mainWindow) return;

    try {
      const cursorPos = screen.getCursorScreenPoint();
      const windowBounds = mainWindow.getBounds();

      const isInWindow = cursorPos.x >= windowBounds.x &&
        cursorPos.x <= windowBounds.x + windowBounds.width &&
        cursorPos.y >= windowBounds.y &&
        cursorPos.y <= windowBounds.y + windowBounds.height;

      if (isInWindow !== mouseInWindow) {
        mouseInWindow = isInWindow;

        if (mainWindow.webContents) {
          const eventName = isInWindow ? 'window-mouse-enter' : 'window-mouse-leave';
          mainWindow.webContents.send(eventName);
        }
      }
    } catch (error) {
      console.error('检查鼠标位置时出错:', error);
    }
  };

  // 每100ms检查一次鼠标位置
  const mouseCheckInterval = setInterval(checkMousePosition, 100);

  // 窗口关闭时清理定时器
  mainWindow.on('closed', () => {
    clearInterval(mouseCheckInterval);
  });

  // 加载应用
  const isDev = process.env.NODE_ENV === 'development';

  // 检查是否是调试模式
  // 1. 开发模式
  // 2. 命令行参数包含--debug-mode
  // 3. 环境变量DEBUG=true
  // 4. package.json中的debug标志为true
  const isDebugMode = isDev ||
    process.argv.includes('--debug-mode') ||
    process.env.DEBUG === 'true' ||
    !!require('../package.json').debug;

  let startUrl: string = 'about:blank'; // 默认值，确保startUrl一定有值
  if (isDev) {
    startUrl = 'http://localhost:3000';
  }

  // 在开发模式或调试模式下打开开发者工具
  if (isDebugMode) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (!isDev) {
    // 生产环境下不打开开发者工具
    // 在生产环境中，从本地构建目录或extraResources中加载渲染器
    let rendererPath: string | undefined;


    // 构建各种可能的路径

    // macOS特定路径 - 包在Resources下
    const macOSResourcesPath = path.join(
      path.dirname(path.dirname(app.getPath('exe'))), // /path/to/App.app/Contents/MacOS -> /path/to/App.app/Contents
      'Resources',
      'renderer',
      'index.html'
    );

    // macOS特定路径 - app目录下
    const macOSAppPath = path.join(
      path.dirname(__dirname), // dist目录
      'renderer',
      'index.html'
    );

    // 常规resources目录
    const resourceRendererPath = path.join(
      app.isPackaged
        ? path.dirname(app.getPath('exe'))
        : app.getAppPath(),
      'resources',
      'renderer',
      'index.html'
    );

    // 本地dist/renderer目录
    const localRendererPath = path.join(__dirname, 'renderer', 'index.html');

    // 尝试按顺序使用各种路径
    if (process.platform === 'darwin' && fs.existsSync(macOSResourcesPath)) {
      rendererPath = macOSResourcesPath;
    } else if (process.platform === 'darwin' && fs.existsSync(macOSAppPath)) {
      rendererPath = macOSAppPath;
    } else if (fs.existsSync(resourceRendererPath)) {
    } else if (fs.existsSync(localRendererPath)) {
      rendererPath = localRendererPath;
    } else {
      // 尝试列出目录内容以辅助调试
      try {
        // 列出应用程序目录
        const appDir = app.getAppPath();

        // 如果在macOS上，列出Resources目录
        if (process.platform === 'darwin') {
          const macResourcesDir = path.join(
            path.dirname(path.dirname(app.getPath('exe'))),
            'Resources'
          );
        }
      } catch (err) {
        console.error('列出目录内容失败:', err);
      }

      console.error('渲染器路径不存在:', resourceRendererPath);
      console.error('备用渲染器路径也不存在:', localRendererPath);
      // 加载一个错误页面或使用一个内置的HTML
      rendererPath = path.join(__dirname, 'error.html');
      // 如果错误页面不存在，创建一个
      if (!fs.existsSync(rendererPath)) {
        const errorHTML = `
          <html>
            <head><title>错误</title></head>
            <body>
              <h1>加载失败</h1>
              <p>无法找到渲染器文件。请确保已正确构建应用。</p>
              <pre>
                app.getAppPath(): ${app.getAppPath()}
                app.getPath('exe'): ${app.getPath('exe')}
                __dirname: ${__dirname}
                resourceRendererPath: ${resourceRendererPath}
                localRendererPath: ${localRendererPath}
              </pre>
            </body>
          </html>
        `;
        fs.writeFileSync(rendererPath, errorHTML);
      }
    }

    // 确保rendererPath有值
    if (!rendererPath) {
      console.error('未能找到有效的渲染器路径，使用错误页面');
      // 创建一个临时错误页面
      const errorHtmlPath = path.join(app.getPath('temp'), 'error.html');
      const errorHTML = `
        <html>
          <head><title>错误</title></head>
          <body>
            <h1>加载失败</h1>
            <p>无法找到渲染器文件。请确保已正确构建应用。</p>
          </body>
        </html>
      `;
      fs.writeFileSync(errorHtmlPath, errorHTML);
      rendererPath = errorHtmlPath;
    }

    startUrl = url.format({
      pathname: rendererPath,
      protocol: 'file:',
      slashes: true
    });
  }

  mainWindow.loadURL(startUrl);

  // 当窗口关闭时取消引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 窗口加载完成后检查键盘监听器状态
  mainWindow.webContents.once('did-finish-load', () => {
    if (!globalKeyboardListener) {
      console.error('主进程: 键盘监听功能不可用，请检查node-global-key-listener依赖');
      // 向渲染进程发送错误信息
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('keyboard-listener-error', 'node-global-key-listener依赖不可用');
      }
    }
  });

  // 监听窗口移动事件，保存位置
  mainWindow.on('moved', () => {
    if (mainWindow) {
      const position = mainWindow.getPosition();
      const config = loadConfig();
      config.windowPosition = { x: position[0], y: position[1] };
      saveConfig(config);
    }
  });
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  if (!globalKeyboardListener) {
    console.error('主进程: 警告 - 键盘监听功能不可用！');
  }
  createWindow();
});

// 在所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  // 在 macOS 上，用户通常希望点击 Dock 图标时重新打开应用
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前保存位置
app.on('before-quit', () => {
  if (mainWindow) {
    const position = mainWindow.getPosition();
    const config = loadConfig();
    config.windowPosition = { x: position[0], y: position[1] };
    saveConfig(config);
  }

  // 清理键盘监听器
  if (keyboardListener && isKeyboardListening) {
    try {
      keyboardListener.kill();
      keyboardListener = null;
      isKeyboardListening = false;
    } catch (error) {
      console.error('清理键盘监听器失败:', error);
    }
  }
});

app.on('activate', () => {
  // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口。
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC 通信处理
ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('set-always-on-top', (_, flag: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag);
  }
});

// Windows DPI问题修复 - 记住窗口的原始尺寸
const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 450;

// 位置更新状态管理器 - 修复Windows DPI缩放问题的关键
const positionUpdate = () => {
  let w: number | null = null;
  let h: number | null = null;
  let rectSetted = false;

  const updateRect = (width: number, height: number) => {
    if (rectSetted) return;
    w = width;
    h = height;
    rectSetted = true;
  };

  const setShouldUpdateRect = () => {
    rectSetted = false;
  };

  const setPosition = (x: number, y: number) => {
    if (!mainWindow) return;

    try {
      // 使用记录的原始尺寸或默认尺寸
      const bounds = {
        width: w ?? WINDOW_WIDTH,
        height: h ?? WINDOW_HEIGHT,
        x: Math.round(x),
        y: Math.round(y)
      };

      mainWindow.setBounds(bounds);
    } catch (err) {
      console.error('设置窗口位置错误:', err);
    }
  };

  return {
    updateRect,
    setShouldUpdateRect,
    setPosition
  };
};

// 全局唯一的位置更新管理器
const { updateRect, setShouldUpdateRect, setPosition } = positionUpdate();

ipcMain.on('move-window', (_, deltaX: number, deltaY: number) => {
  if (mainWindow) {
    try {
      // 确保参数为整数
      const intDeltaX = Math.round(Number(deltaX) || 0);
      const intDeltaY = Math.round(Number(deltaY) || 0);

      // 如果移动距离为0则不处理
      if (intDeltaX === 0 && intDeltaY === 0) return;

      // 获取当前窗口bounds并更新原始尺寸记录
      const bounds = mainWindow.getBounds();
      updateRect(bounds.width, bounds.height);

      // 计算新位置
      const newX = bounds.x + intDeltaX;
      const newY = bounds.y + intDeltaY;

      // 使用修复后的setPosition方法
      setPosition(newX, newY);
    } catch (err) {
      console.error('移动窗口错误:', err, 'deltaX=', deltaX, 'deltaY=', deltaY);
    }
  }
});

// 获取窗口位置
ipcMain.handle('get-position', () => {
  if (mainWindow) {
    return mainWindow.getPosition();
  }
  return [0, 0];
});

// 获取鼠标位置
ipcMain.handle('get-cursor-position', () => {
  try {
    const cursorPos = screen.getCursorScreenPoint();
    return { x: cursorPos.x, y: cursorPos.y };
  } catch (error) {
    console.error('获取鼠标位置失败:', error);
    return { x: 0, y: 0 };
  }
});

// 设置窗口位置
ipcMain.on('set-position', (_, x: number, y: number) => {
  if (mainWindow) {
    try {
      // 验证参数类型，确保是数字并转换为整数
      const intX = Math.round(Number(x) || 0);
      const intY = Math.round(Number(y) || 0);

      // 获取当前窗口bounds并更新原始尺寸记录
      const bounds = mainWindow.getBounds();
      updateRect(bounds.width, bounds.height);

      // 使用修复后的setPosition方法
      setPosition(intX, intY);
    } catch (err) {
      console.error('设置窗口位置错误:', err, 'x=', x, 'y=', y);
    }
  }
});

// 保存当前模型
ipcMain.on('save-model', (_, modelName: string) => {
  const config = loadConfig();
  config.modelName = modelName;
  saveConfig(config);
});

// 获取保存的模型
ipcMain.handle('get-saved-model', () => {
  const config = loadConfig();
  return config.modelName || '';
});

// 读取本地JSON文件
ipcMain.handle('read-local-json', async (_, filePath: string) => {
  try {
    // 处理路径，支持相对路径
    let resolvedPath = filePath;

    // 如果是相对路径，则相对于app的资源目录解析
    if (!path.isAbsolute(filePath)) {
      if (app.isPackaged) {
        // 检查各种可能的资源路径
        const resourcesPath = path.join(
          path.dirname(path.dirname(app.getPath('exe'))),
          'Resources'
        );
        resolvedPath = path.join(resourcesPath, filePath);

        // 如果不存在，尝试在app.asar中查找
        if (!fs.existsSync(resolvedPath)) {
          const appPath = app.getAppPath();
          resolvedPath = path.join(appPath, filePath);
        }
      } else {
        // 开发模式下，相对于app根目录解析
        resolvedPath = path.join(app.getAppPath(), filePath);
      }
    }

    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
      console.error(`文件不存在: ${resolvedPath}`);
      return null;
    }

    // 读取并解析JSON文件
    const data = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取本地JSON文件失败:', error);
    return null;
  }
});

// 获取应用资源路径
ipcMain.handle('get-resources-path', () => {
  if (app.isPackaged) {
    return path.join(path.dirname(path.dirname(app.getPath('exe'))), 'Resources');
  } else {
    return app.getAppPath();
  }
});

// 检查文件是否存在
ipcMain.handle('file-exists', (_, filePath: string) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error('检查文件存在失败:', error);
    return false;
  }
});

// 在IPC事件处理程序部分添加读取本地文件功能
ipcMain.handle('read-local-file', async (event, filePath) => {
  try {
    // 构建绝对路径
    let absolutePath;

    // 如果是相对路径，将其转换为绝对路径
    if (!path.isAbsolute(filePath)) {
      if (app.isPackaged) {
        // 在打包环境中，使用应用程序资源目录
        if (process.platform === 'darwin') {
          // macOS应用包结构
          absolutePath = path.join(
            path.dirname(path.dirname(app.getPath('exe'))), // /path/to/App.app/Contents/MacOS -> /path/to/App.app/Contents
            'Resources',
            'app.asar.unpacked', // 解压的资源可能在这里
            filePath
          );

          // 如果不存在，尝试其他可能的位置
          if (!fs.existsSync(absolutePath)) {
            absolutePath = path.join(
              path.dirname(path.dirname(app.getPath('exe'))),
              'Resources',
              filePath
            );
          }

          // 如果还不存在，尝试在renderer目录下查找
          if (!fs.existsSync(absolutePath)) {
            absolutePath = path.join(
              path.dirname(path.dirname(app.getPath('exe'))),
              'Resources',
              'renderer',
              filePath.replace(/^\//, '')
            );
          }

          // 如果还不存在，尝试在assets目录下查找
          if (!fs.existsSync(absolutePath)) {
            absolutePath = path.join(
              path.dirname(path.dirname(app.getPath('exe'))),
              'Resources',
              'renderer',
              'assets',
              path.basename(filePath)
            );
          }
        } else {
          // Windows/Linux应用包结构
          absolutePath = path.join(
            path.dirname(app.getPath('exe')),
            'resources',
            filePath
          );

          // 如果不存在，尝试在renderer目录下查找
          if (!fs.existsSync(absolutePath)) {
            absolutePath = path.join(
              path.dirname(app.getPath('exe')),
              'resources',
              'renderer',
              filePath.replace(/^\//, '')
            );
          }

          // 如果还不存在，尝试在assets目录下查找
          if (!fs.existsSync(absolutePath)) {
            absolutePath = path.join(
              path.dirname(app.getPath('exe')),
              'resources',
              'renderer',
              'assets',
              path.basename(filePath)
            );
          }
        }
      } else {
        // 在开发环境中，使用项目根目录
        absolutePath = path.join(app.getAppPath(), filePath);

        // 如果不存在，尝试在renderer/public目录下查找
        if (!fs.existsSync(absolutePath)) {
          absolutePath = path.join(
            app.getAppPath(),
            'packages',
            'renderer',
            'public',
            filePath.replace(/^\//, '')
          );
        }

        // 如果还不存在，尝试在renderer/dist目录下查找
        if (!fs.existsSync(absolutePath)) {
          absolutePath = path.join(
            app.getAppPath(),
            'packages',
            'renderer',
            'dist',
            filePath.replace(/^\//, '')
          );
        }

        // 如果还不存在，尝试在assets目录下查找
        if (!fs.existsSync(absolutePath)) {
          absolutePath = path.join(
            app.getAppPath(),
            'packages',
            'renderer',
            'dist',
            'assets',
            path.basename(filePath)
          );
        }
      }
    } else {
      absolutePath = filePath;
    }

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      console.error('文件不存在:', absolutePath);
      return null;
    }

    // 读取文件内容
    const content = fs.readFileSync(absolutePath);

    // 根据文件类型返回不同的格式
    const extension = path.extname(absolutePath).toLowerCase();

    // 对于文本文件，返回字符串
    if (['.json', '.txt', '.html', '.css', '.js', '.xml'].includes(extension)) {
      return content.toString('utf8');
    }

    // 对于二进制文件，返回Buffer数据，renderer会将其转为Blob
    return content;
  } catch (error) {
    console.error('读取文件失败:', error);
    return null;
  }
});

// 获取语音设置
ipcMain.handle('get-voice-settings', async () => {
  const config = loadConfig();
  return config.voiceSettings;
});

// 保存语音设置
ipcMain.on('save-voice-settings', (_, settings: VoiceSettings) => {
  const config = loadConfig();
  config.voiceSettings = { ...config.voiceSettings, ...settings };
  saveConfig(config);
});

// 启动键盘监听
ipcMain.on('start-keyboard-listener', () => {
  if (!globalKeyboardListener) {
    console.error('主进程: globalKeyboardListener未初始化，键盘监听功能不可用');
    // 发送启动失败消息到渲染进程
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('keyboard-listener-error', 'globalKeyboardListener未初始化，可能是node-global-key-listener依赖未正确安装');
    }
    return;
  }

  if (isKeyboardListening) {
    // 发送已启动消息
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('keyboard-listener-started');
    }
    return;
  }

  try {
    keyboardListener = new globalKeyboardListener();

    keyboardListener.addListener((e: any, down: any) => {
      const keyEvent = {
        key: e.name,
        timestamp: Date.now(),
        type: e.state === 'DOWN' ? 'keydown' : 'keyup'
      };

      // 发送键盘事件到渲染进程
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('keyboard-event', keyEvent);
      }
    });

    isKeyboardListening = true;

    // 发送启动成功消息到渲染进程
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('keyboard-listener-started');
    }
  } catch (error) {
    console.error('主进程: 启动键盘监听失败:', error);

    // 发送启动失败消息到渲染进程
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('keyboard-listener-error', String(error));
    }
  }
});

// 停止键盘监听
ipcMain.on('stop-keyboard-listener', () => {
  if (keyboardListener && isKeyboardListening) {
    try {
      keyboardListener.kill();
      keyboardListener = null;
      isKeyboardListening = false;
    } catch (error) {
      console.error('停止键盘监听失败:', error);
    }
  }
}); 