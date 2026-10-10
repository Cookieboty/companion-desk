/* eslint-disable @typescript-eslint/no-require-imports, no-console -- 独立 Electron 冒烟脚本（CJS） */
// Electron 冒烟：透明无边框窗口渲染 Inochi2D 模型（与看板娘窗口同配置），截图后退出。
//   xvfb-run -a electron experiments/inochi2d-spike/main.cjs --enable-unsafe-swiftshader
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { app, BrowserWindow, protocol, net } = require('electron');
const out = process.env.SPIKE_SHOT || path.join(__dirname, 'spike.png');
protocol.registerSchemesAsPrivileged([
  { scheme: 'spike', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.whenReady().then(async () => {
  protocol.handle('spike', (req) =>
    net.fetch(pathToFileURL(path.join(__dirname, new URL(req.url).pathname)).toString()),
  );
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    transparent: true,
    frame: false,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await win.loadURL('spike://app/index.html' + (process.env.SPIKE_QUERY || ''));
  const deadline = Date.now() + 20000;
  let st;
  while (Date.now() < deadline) {
    st = await win.webContents.executeJavaScript(
      '({ready: !!window.__ready, err: window.__error, frames: window.__frames, names: window.__inox && window.__inox.names, load: window.__inox && window.__inox.loadMs})',
    );
    if (st.err || (st.ready && st.frames > 60)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (process.env.SPIKE_MOUTH)
    await win.webContents.executeJavaScript(`window.__mouth=${process.env.SPIKE_MOUTH}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  const fps = await win.webContents.executeJavaScript(
    'new Promise(r=>{const f=window.__frames;setTimeout(()=>r((window.__frames-f)),1000)})',
  );
  console.log(JSON.stringify({ ...st, fps, out }));
  app.quit();
});
