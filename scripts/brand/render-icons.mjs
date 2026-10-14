/**
 * 用 Electron 自带的 Chromium 把 SVG 栅格化成 PNG（无额外依赖）。
 * 用法：electron scripts/brand/render-icons.mjs <jobs.json>
 *   jobs: [{ "svg": "a.svg", "out": "a.png", "size": 1024 }]
 */
import fs from 'node:fs';

import { app, BrowserWindow } from 'electron';

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const jobs = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
    const win = new BrowserWindow({
      show: true,
      width: 1024,
      height: 1024,
      transparent: true,
      frame: false,
      x: 0,
      y: 0,
      webPreferences: { backgroundThrottling: false },
    });
    for (const j of jobs) {
      const svg = fs.readFileSync(j.svg, 'utf8');
      const html = `<html><body style="margin:0;background:transparent">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"
        style="width:${j.size}px;height:${j.size}px;display:block"></body></html>`;
      win.setContentSize(j.size, j.size);
      await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
      await new Promise((r) => setTimeout(r, 120));
      const img = await win.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size });
      process.stdout.write(`rendered ${j.out}\n`);
      fs.writeFileSync(
        j.out,
        img.resize({ width: j.size, height: j.size, quality: 'best' }).toPNG(),
      );
    }
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
  app.quit();
});
