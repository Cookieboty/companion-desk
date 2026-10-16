/**
 * 对话窗口的一体化标题栏：
 * - macOS：titleBarStyle 'hiddenInset'，红绿灯嵌进深色头部（页面顶部 38px 是可拖动区域）
 * - Windows / Linux：无边框 + 原生 Window Controls Overlay（最小化 / 最大化 / 关闭由系统绘制，
 *   颜色跟随主题），页面顶部 36px 可拖动
 */
import { BrowserWindow, ipcMain } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';

import { isTrustedSenderUrl } from '../security/ipcSenderGuard';

export type ChromeTheme = 'mist' | 'graphite' | 'ink' | 'paper';

/** 与 packages/ui/src/tokens.css 中各主题的 --cd-color-bg / --cd-color-text 保持一致 */
export const THEME_CHROME: Record<ChromeTheme, { bg: string; fg: string }> = {
  mist: { bg: '#0a0f1a', fg: '#e8eef7' },
  graphite: { bg: '#0f0f11', fg: '#ededef' },
  ink: { bg: '#1a1917', fg: '#ece8e1' },
  paper: { bg: '#fafaf9', fg: '#1c1c1e' },
};

export const TITLEBAR_HEIGHT = { mac: 38, other: 36 } as const;

export function titleBarOptions(
  platform: NodeJS.Platform,
  theme: ChromeTheme,
): Partial<BrowserWindowConstructorOptions> {
  const c = THEME_CHROME[theme] ?? THEME_CHROME.ink;
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 12 },
      backgroundColor: c.bg,
    };
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: c.bg, symbolColor: c.fg, height: TITLEBAR_HEIGHT.other },
    backgroundColor: c.bg,
  };
}

/** 主题切换时更新窗口底色与 Windows / Linux 的原生按钮配色 */
export function applyTitleBarTheme(
  win: BrowserWindow,
  theme: ChromeTheme,
  platform: NodeJS.Platform = process.platform,
): void {
  const c = THEME_CHROME[theme] ?? THEME_CHROME.ink;
  if (win.isDestroyed()) return;
  win.setBackgroundColor(c.bg);
  if (platform !== 'darwin' && typeof win.setTitleBarOverlay === 'function') {
    try {
      win.setTitleBarOverlay({ color: c.bg, symbolColor: c.fg, height: TITLEBAR_HEIGHT.other });
    } catch {
      /* 窗口不是用 titleBarOverlay 创建的 */
    }
  }
}

/** 渲染层在抽屉 / 模态打开时请求隐藏原生红绿灯（仅 macOS）所用的 IPC 通道 */
export const WINDOW_BUTTONS_CHANNEL = 'window-chrome:set-buttons-hidden';

/**
 * 抽屉 / 模态打开时临时隐藏 macOS 红绿灯：原生按钮画在 DOM 之上，遮罩盖不住，
 * 半透明遮罩下它们仍清晰可点，用户会把「关闭」当成关抽屉而误关整个窗口。
 * 仅 macOS 生效；Windows / Linux 的窗口按钮（titleBarOverlay）不动，因而无副作用。
 * 返回是否真正调用了 setWindowButtonVisibility。
 */
export function setWindowButtonsHidden(
  win: Pick<BrowserWindow, 'isDestroyed'> &
    Partial<Pick<BrowserWindow, 'setWindowButtonVisibility'>>,
  hidden: boolean,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'darwin') return false;
  if (win.isDestroyed() || typeof win.setWindowButtonVisibility !== 'function') return false;
  try {
    win.setWindowButtonVisibility(!hidden);
    return true;
  } catch {
    return false;
  }
}

/** 注册隐藏 / 恢复窗口按钮的 IPC；渲染进程重新加载时自动恢复，避免按钮永久消失 */
export function registerWindowChromeIpc(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'darwin') return;
  ipcMain.on(WINDOW_BUTTONS_CHANNEL, (event, hidden: unknown) => {
    if (!isTrustedSenderUrl(event.senderFrame?.url ?? event.sender.getURL())) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const want = hidden === true;
    setWindowButtonsHidden(win, want, platform);
    if (want) {
      event.sender.once('did-start-loading', () => setWindowButtonsHidden(win, false, platform));
    }
  });
}
