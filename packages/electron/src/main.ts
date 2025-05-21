import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

// 配置文件路径
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

// 默认配置
interface AppConfig {
  windowPosition: { x: number; y: number };
  modelName: string;
}

const defaultConfig: AppConfig = {
  windowPosition: { x: 0, y: 0 },
  modelName: ''
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
    console.log('开发模式：热重载已启用');
  } catch (err) {
    console.error('无法启用热重载，请确保已安装electron-reload:', err);
  }
}

// 保持一个对窗口对象的全局引用，如果不这样做，当 JavaScript 对象被
// 垃圾回收，窗口会自动关闭
let mainWindow: BrowserWindow | null = null;

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
    x: x,
    y: y,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 加载应用
  const isDev = process.env.NODE_ENV === 'development';

  let startUrl;
  if (isDev) {
    startUrl = 'http://localhost:3000';
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 在生产环境中，从extraResources中加载渲染器
    const rendererPath = path.join(
      app.isPackaged
        ? path.dirname(app.getPath('exe'))
        : app.getAppPath(),
      'resources',
      'renderer',
      'index.html'
    );

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
app.whenReady().then(createWindow);

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

ipcMain.on('move-window', (_, deltaX: number, deltaY: number) => {
  if (mainWindow) {
    const position = mainWindow.getPosition();
    mainWindow.setPosition(position[0] + deltaX, position[1] + deltaY);
  }
});

// 获取窗口位置
ipcMain.handle('get-position', () => {
  if (mainWindow) {
    return mainWindow.getPosition();
  }
  return [0, 0];
});

// 设置窗口位置
ipcMain.on('set-position', (_, x: number, y: number) => {
  if (mainWindow) {
    try {
      // 验证参数类型，确保是数字并转换为整数
      const intX = Math.round(Number(x) || 0);
      const intY = Math.round(Number(y) || 0);

      // 设置位置时禁用动画（适用于一些平台）
      mainWindow.setPosition(intX, intY, false);
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