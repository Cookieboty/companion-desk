/** 界面主题：持久化到 userData/theme.json，并广播给所有窗口（对话窗口 + 看板娘）。 */
import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, ipcMain } from 'electron';

export const THEME_IDS = ['mist', 'graphite', 'ink', 'paper'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const isThemeId = (v: unknown): v is ThemeId => THEME_IDS.includes(v as ThemeId);

export class ThemeService {
  private theme: ThemeId = 'mist';
  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { theme?: unknown };
      if (isThemeId(raw.theme)) this.theme = raw.theme;
    } catch {
      /* 首次运行 */
    }
  }

  get(): ThemeId {
    return this.theme;
  }

  set(id: unknown): ThemeId {
    if (!isThemeId(id)) throw new Error(`unknown theme: ${String(id)}`);
    this.theme = id;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ theme: id }, null, 2), 'utf8');
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('ai:theme:changed', id);
    }
    return id;
  }

  registerIpc(): void {
    ipcMain.removeHandler('ai:theme:get');
    ipcMain.removeHandler('ai:theme:set');
    ipcMain.handle('ai:theme:get', () => this.get());
    ipcMain.handle('ai:theme:set', (_e, id: unknown) => this.set(id));
  }
}
