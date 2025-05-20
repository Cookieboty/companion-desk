import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as url from 'url';

// 保持一个对窗口对象的全局引用，如果不这样做，当 JavaScript 对象被
// 垃圾回收，窗口会自动关闭
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 280,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    x: width - 300,
    y: height - 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 加载应用
  const isDev = process.env.NODE_ENV === 'development';
  console.log('env=====>', isDev);

  let startUrl;
  if (isDev) {
    startUrl = 'http://localhost:3000';
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