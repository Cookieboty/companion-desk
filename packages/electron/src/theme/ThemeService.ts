/**
 * 界面主题：用户选择持久化到 userData/theme.json，广播给所有窗口（对话窗口 + 看板娘）。
 * 「跟随系统」用 nativeTheme 解析：深色 → Graphite，浅色 → Light Paper，系统切换时实时更新。
 * 新用户默认 Warm Ink；已保存的选择优先。
 */
import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, ipcMain, nativeTheme } from 'electron';

export const THEME_IDS = ['mist', 'graphite', 'ink', 'paper'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemePref = ThemeId | 'system';
export const DEFAULT_THEME: ThemePref = 'ink';
export const isThemePref = (v: unknown): v is ThemePref =>
  v === 'system' || THEME_IDS.includes(v as ThemeId);
export const resolveTheme = (pref: ThemePref, dark: boolean): ThemeId =>
  pref === 'system' ? (dark ? 'graphite' : 'paper') : pref;

export interface ThemeState {
  pref: ThemePref;
  resolved: ThemeId;
}

interface NativeThemeLike {
  shouldUseDarkColors: boolean;
  on(ev: 'updated', fn: () => void): unknown;
}

export class ThemeService {
  private pref: ThemePref = DEFAULT_THEME;
  constructor(
    private readonly file: string,
    private readonly native: NativeThemeLike = nativeTheme,
  ) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { theme?: unknown };
      if (isThemePref(raw.theme)) this.pref = raw.theme;
    } catch {
      /* 首次运行：用默认 */
    }
    this.native.on('updated', () => {
      if (this.pref === 'system') this.broadcast();
    });
  }

  get(): ThemeState {
    return { pref: this.pref, resolved: resolveTheme(this.pref, this.native.shouldUseDarkColors) };
  }

  set(id: unknown): ThemeState {
    if (!isThemePref(id)) throw new Error(`unknown theme: ${String(id)}`);
    this.pref = id;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ theme: id }, null, 2), 'utf8');
    this.broadcast();
    return this.get();
  }

  private broadcast(): void {
    const s = this.get();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('ai:theme:changed', s);
    }
  }

  registerIpc(): void {
    ipcMain.removeHandler('ai:theme:get');
    ipcMain.removeHandler('ai:theme:set');
    ipcMain.handle('ai:theme:get', () => this.get());
    ipcMain.handle('ai:theme:set', (_e, id: unknown) => this.set(id));
  }
}
