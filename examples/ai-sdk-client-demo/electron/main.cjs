/**
 * P7-5 · 最小可运行的 Electron main（CommonJS）
 *
 * 生产项目通常会用打包器构建；这里保留最原始的 CJS，便于直接 `electron .`。
 *
 * 使用方式：
 *   1. 先 `pnpm --filter @ig-live/ai-sdk-client-demo dev:renderer` 起 vite dev server
 *   2. 另开一个 shell：`VITE_DEV_URL=http://127.0.0.1:5178 electron examples/ai-sdk-client-demo`
 *
 * 或者：
 *   1. `pnpm --filter @ig-live/ai-sdk-client-demo build`
 *   2. `electron examples/ai-sdk-client-demo`（走本地 dist/index.html）
 */

const path = require('node:path');

const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const devUrl = process.env.VITE_DEV_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
