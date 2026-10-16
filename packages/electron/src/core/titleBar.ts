/**
 * 对话窗口的一体化标题栏：
 * - macOS：titleBarStyle 'hiddenInset'，红绿灯嵌进深色头部（页面顶部 38px 是可拖动区域）
 * - Windows / Linux：无边框 + 原生 Window Controls Overlay（最小化 / 最大化 / 关闭由系统绘制，
 *   颜色跟随主题），页面顶部 36px 可拖动
 *
 * 抽屉 / 模态打开时的窗口按钮处理（原生按钮画在 DOM 之上，遮罩盖不住、点得到）：
 * - macOS：setWindowButtonVisibility(false) 直接隐藏红绿灯
 * - Windows / Linux：overlay 无法隐藏 / 禁用，只能 ① 把按钮符号调暗（看起来是失效态）；
 *   ② 拦截此时的窗口关闭（点 ✕ / Alt+F4），改成通知渲染层关闭最上层抽屉（等同 Esc），
 *   应用退出 / 安装更新 / 渲染进程崩溃或无响应时放行
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

/** 与 THEME_CHROME 同源的颜色线性混合：把 a 往 b 方向混 t（0..1），仅支持 #rrggbb */
export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const m = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${m(ar!, br!)}${m(ag!, bg!)}${m(ab!, bb!)}`;
}

/** Windows / Linux 原生按钮 overlay 配色：dimmed 时符号对比度降到约 28%，与抽屉遮罩的「失效」观感一致 */
export function overlayColors(theme: ChromeTheme, dimmed: boolean) {
  const c = THEME_CHROME[theme] ?? THEME_CHROME.ink;
  return {
    color: c.bg,
    symbolColor: dimmed ? mixHex(c.bg, c.fg, 0.28) : c.fg,
    height: TITLEBAR_HEIGHT.other,
  };
}

/** 抽屉 / 模态打开中的窗口（Windows / Linux：按钮已调暗，且关闭会被拦截改为关抽屉） */
const dimmedWindows = new WeakSet<BrowserWindow>();
const guardedWindows = new WeakSet<BrowserWindow>();
const watchedContents = new WeakSet<object>();
/** 应用正在退出 / 安装更新：不再拦截窗口关闭，避免阻止退出 */
let closeAllowed = false;

/** 渲染层：窗口关闭被拦截（抽屉 / 模态打开中），应关闭最上层抽屉 */
export const WINDOW_CLOSE_BLOCKED_CHANNEL = 'window-chrome:close-blocked';

/** 应用即将退出（before-quit / session-end / quitAndInstall）：之后窗口关闭一律放行 */
export function allowWindowClose(): void {
  closeAllowed = true;
}

/** 仅测试用 */
export function __resetWindowCloseGuard(): void {
  closeAllowed = false;
}

/** 主题切换时更新窗口底色与 Windows / Linux 的原生按钮配色（抽屉打开中保持调暗） */
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
      win.setTitleBarOverlay(overlayColors(theme, dimmedWindows.has(win)));
    } catch {
      /* 窗口不是用 titleBarOverlay 创建的 */
    }
  }
}

/** 渲染层在抽屉 / 模态打开时请求隐藏 / 调暗原生窗口按钮所用的 IPC 通道 */
export const WINDOW_BUTTONS_CHANNEL = 'window-chrome:set-buttons-hidden';

/**
 * macOS：抽屉 / 模态打开时临时隐藏红绿灯。原生按钮画在 DOM 之上，遮罩盖不住，
 * 半透明遮罩下它们仍清晰可点，用户会把「关闭」当成关抽屉而误关整个窗口。
 * 其他平台返回 false（见 setWindowControlsDimmed）。
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

/** 抽屉打开期间拦截该窗口的关闭，改为通知渲染层关闭最上层抽屉；每个窗口只装一次 */
function installCloseGuard(win: BrowserWindow): void {
  if (guardedWindows.has(win)) return;
  guardedWindows.add(win);
  // Windows 关机 / 注销：窗口关闭不能被抽屉拦截
  win.on('session-end', allowWindowClose);
  win.on('close', (event) => {
    if (!dimmedWindows.has(win) || closeAllowed) return;
    const wc = win.webContents;
    // 渲染进程已不可用：抽屉永远关不掉，必须放行，否则窗口关不掉
    if (!wc || wc.isDestroyed() || wc.isCrashed()) return;
    event.preventDefault();
    wc.send(WINDOW_CLOSE_BLOCKED_CHANNEL);
  });
}

/**
 * Windows / Linux：抽屉 / 模态打开时把原生按钮 overlay 调暗并拦截窗口关闭；关闭抽屉时恢复。
 * overlay 由系统绘制，既盖不住也无法禁用，所以这里不隐藏按钮、也不动最小化 / 最大化。
 * macOS 返回 false（走 setWindowButtonsHidden）。返回是否生效。
 */
export function setWindowControlsDimmed(
  win: BrowserWindow,
  dimmed: boolean,
  theme: ChromeTheme,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === 'darwin') return false;
  if (win.isDestroyed()) return false;
  if (dimmed) {
    dimmedWindows.add(win);
    installCloseGuard(win);
  } else {
    dimmedWindows.delete(win);
  }
  if (typeof win.setTitleBarOverlay !== 'function') return true;
  try {
    win.setTitleBarOverlay(overlayColors(theme, dimmed));
  } catch {
    /* 窗口不是用 titleBarOverlay 创建的：仍保留关闭拦截 */
  }
  return true;
}

/**
 * 注册抽屉 / 模态期间窗口按钮的 IPC（所有平台，按平台分支）。渲染进程重新加载 / 崩溃 / 无响应时
 * 自动恢复，避免按钮永久变暗或窗口永远关不掉。
 */
export function registerWindowChromeIpc(
  platform: NodeJS.Platform = process.platform,
  getTheme: () => ChromeTheme = () => 'ink',
): void {
  ipcMain.on(WINDOW_BUTTONS_CHANNEL, (event, hidden: unknown) => {
    if (!isTrustedSenderUrl(event.senderFrame?.url ?? event.sender.getURL())) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const want = hidden === true;
    const apply = (on: boolean) =>
      platform === 'darwin'
        ? setWindowButtonsHidden(win, on, platform)
        : setWindowControlsDimmed(win, on, getTheme(), platform);
    apply(want);
    // 每个 webContents 只挂一次，避免反复开关抽屉累积监听
    if (want && !watchedContents.has(event.sender)) {
      watchedContents.add(event.sender);
      const restore = () => {
        apply(false);
      };
      event.sender.on('did-start-loading', restore);
      if (platform !== 'darwin') {
        event.sender.on('render-process-gone', restore);
        event.sender.on('unresponsive', restore);
      }
    }
  });
}
