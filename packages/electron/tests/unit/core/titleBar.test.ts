jest.unmock('fs');
jest.unmock('path');
import fs from 'node:fs';
import path from 'node:path';

import {
  THEME_CHROME,
  WINDOW_BUTTONS_CHANNEL,
  WINDOW_CLOSE_BLOCKED_CHANNEL,
  __resetWindowCloseGuard,
  allowWindowClose,
  applyTitleBarTheme,
  mixHex,
  overlayColors,
  registerWindowChromeIpc,
  setWindowButtonsHidden,
  setWindowControlsDimmed,
  titleBarOptions,
} from '../../../src/core/titleBar';

describe('integrated title bar', () => {
  it('macOS uses hiddenInset traffic lights over the theme background', () => {
    const o = titleBarOptions('darwin', 'ink');
    expect(o.titleBarStyle).toBe('hiddenInset');
    expect(o.trafficLightPosition).toEqual({ x: 14, y: 12 });
    expect(o.backgroundColor).toBe(THEME_CHROME.ink.bg);
    expect(o.titleBarOverlay).toBeUndefined();
  });

  it.each(['win32', 'linux'] as const)('%s uses a themed native controls overlay', (p) => {
    for (const th of ['mist', 'graphite', 'ink', 'paper'] as const) {
      const o = titleBarOptions(p, th);
      expect(o.titleBarStyle).toBe('hidden');
      expect(o.titleBarOverlay).toEqual({
        color: THEME_CHROME[th].bg,
        symbolColor: THEME_CHROME[th].fg,
        height: 36,
      });
    }
  });

  it('theme change updates background + overlay (not on mac)', () => {
    const win = {
      isDestroyed: () => false,
      setBackgroundColor: jest.fn(),
      setTitleBarOverlay: jest.fn(),
    };
    applyTitleBarTheme(win as never, 'paper', 'win32');
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#fafaf9');
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#fafaf9',
      symbolColor: '#1c1c1e',
      height: 36,
    });
    win.setTitleBarOverlay.mockClear();
    applyTitleBarTheme(win as never, 'graphite', 'darwin');
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled();
  });

  it('chrome colours match the UI theme tokens', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../../ui/src/tokens.css'), 'utf8');
    const block = (sel: string) => {
      const i = css.indexOf(sel);
      return css.slice(i, css.indexOf('}', i));
    };
    const bgOf = (b: string) => /--cd-color-bg:\s*(#[0-9a-f]+)/i.exec(b)?.[1];
    expect(bgOf(block(':root'))).toBe(THEME_CHROME.mist.bg);
    for (const th of ['graphite', 'ink', 'paper'] as const)
      expect(bgOf(block(`[data-theme='${th}']`))).toBe(THEME_CHROME[th].bg);
  });
});

describe('hide native window buttons while a drawer is open', () => {
  const mkWin = (destroyed = false) => ({
    isDestroyed: () => destroyed,
    setWindowButtonVisibility: jest.fn(),
  });

  it('macOS: hidden=true hides the traffic lights, hidden=false restores them', () => {
    const win = mkWin();
    expect(setWindowButtonsHidden(win as never, true, 'darwin')).toBe(true);
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(false);
    expect(setWindowButtonsHidden(win as never, false, 'darwin')).toBe(true);
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);
  });

  it.each(['win32', 'linux'] as const)('%s: never touches the window buttons', (p) => {
    const win = mkWin();
    expect(setWindowButtonsHidden(win as never, true, p)).toBe(false);
    expect(win.setWindowButtonVisibility).not.toHaveBeenCalled();
  });

  it('destroyed window / missing API / throwing API are safe no-ops', () => {
    const gone = mkWin(true);
    expect(setWindowButtonsHidden(gone as never, true, 'darwin')).toBe(false);
    expect(gone.setWindowButtonVisibility).not.toHaveBeenCalled();
    expect(setWindowButtonsHidden({ isDestroyed: () => false } as never, true, 'darwin')).toBe(
      false,
    );
    const bad = {
      isDestroyed: () => false,
      setWindowButtonVisibility: jest.fn(() => {
        throw new Error('x');
      }),
    };
    expect(setWindowButtonsHidden(bad as never, true, 'darwin')).toBe(false);
  });

  it('IPC is registered on every platform (branching happens inside)', () => {
    const { ipcMain } = jest.requireMock('electron') as { ipcMain: { on: jest.Mock } };
    for (const p of ['darwin', 'win32', 'linux'] as const) {
      ipcMain.on.mockClear();
      registerWindowChromeIpc(p);
      expect(ipcMain.on).toHaveBeenCalledWith(WINDOW_BUTTONS_CHANNEL, expect.any(Function));
    }
  });

  it('IPC handler: trusted sender toggles the sender window; untrusted is ignored', () => {
    const { ipcMain, BrowserWindow } = jest.requireMock('electron') as {
      ipcMain: { on: jest.Mock };
      BrowserWindow: { fromWebContents?: jest.Mock };
    };
    BrowserWindow.fromWebContents = jest.fn();
    ipcMain.on.mockClear();
    registerWindowChromeIpc('darwin');
    const handler = ipcMain.on.mock.calls[0][1] as (e: unknown, hidden: unknown) => void;
    const win = mkWin();
    (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(win);
    const sender = { getURL: () => 'file:///app/chat.html', on: jest.fn() };

    handler({ sender, senderFrame: { url: 'file:///app/chat.html' } }, true);
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(false);
    // 渲染进程重新加载时自动恢复
    expect(sender.on).toHaveBeenCalledWith('did-start-loading', expect.any(Function));
    (sender.on.mock.calls[0][1] as () => void)();
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);

    handler({ sender, senderFrame: { url: 'file:///app/chat.html' } }, false);
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);

    win.setWindowButtonVisibility.mockClear();
    handler({ sender, senderFrame: { url: 'https://evil.example/' } }, true);
    expect(win.setWindowButtonVisibility).not.toHaveBeenCalled();
    // 非 boolean 一律当作「恢复」
    handler({ sender, senderFrame: { url: 'file:///app/chat.html' } }, 'yes');
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);
  });
});

describe('Windows / Linux: dim native controls + guard window close while a drawer is open', () => {
  type Listener = (e: { preventDefault: () => void }) => void;
  const mkWin = () => {
    const listeners: Listener[] = [];
    const wc = { isDestroyed: () => false, isCrashed: () => false, send: jest.fn() };
    const win = {
      isDestroyed: () => false,
      setTitleBarOverlay: jest.fn(),
      setWindowButtonVisibility: jest.fn(),
      webContents: wc,
      on: jest.fn((ev: string, fn: Listener) => {
        if (ev === 'close') listeners.push(fn);
      }),
    };
    const tryClose = () => {
      const e = { preventDefault: jest.fn() };
      listeners.forEach((l) => l(e));
      return e.preventDefault.mock.calls.length > 0 ? 'blocked' : 'closed';
    };
    return { win, wc, tryClose };
  };

  beforeEach(() => __resetWindowCloseGuard());

  it('mixHex / overlayColors: dimmed lowers symbol contrast, background unchanged', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    for (const th of ['mist', 'graphite', 'ink', 'paper'] as const) {
      const n = overlayColors(th, false);
      const d = overlayColors(th, true);
      expect(n).toEqual({
        ...(THEME_CHROME[th] && { color: THEME_CHROME[th].bg, symbolColor: THEME_CHROME[th].fg }),
        height: 36,
      });
      expect(d.color).toBe(n.color);
      expect(d.symbolColor).not.toBe(n.symbolColor);
      expect(d.symbolColor).toBe(mixHex(THEME_CHROME[th].bg, THEME_CHROME[th].fg, 0.28));
    }
  });

  it.each(['win32', 'linux'] as const)('%s: dims the overlay and restores it', (p) => {
    const { win } = mkWin();
    expect(setWindowControlsDimmed(win as never, true, 'ink', p)).toBe(true);
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('ink', true));
    expect(setWindowControlsDimmed(win as never, false, 'ink', p)).toBe(true);
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('ink', false));
    // 不碰 mac 的按钮可见性
    expect(win.setWindowButtonVisibility).not.toHaveBeenCalled();
  });

  it('macOS is untouched by the dim path', () => {
    const { win } = mkWin();
    expect(setWindowControlsDimmed(win as never, true, 'ink', 'darwin')).toBe(false);
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled();
    expect(win.on).not.toHaveBeenCalled();
  });

  it('close is blocked only while dimmed, and tells the renderer to close the drawer', () => {
    const { win, wc, tryClose } = mkWin();
    expect(tryClose()).toBe('closed'); // 未安装守卫
    setWindowControlsDimmed(win as never, true, 'ink', 'win32');
    setWindowControlsDimmed(win as never, true, 'ink', 'win32');
    expect(win.on).toHaveBeenCalledWith('session-end', allowWindowClose); // 关机放行
    expect(win.on).toHaveBeenCalledTimes(2); // close + session-end，只装一次
    expect(tryClose()).toBe('blocked');
    expect(wc.send).toHaveBeenCalledWith(WINDOW_CLOSE_BLOCKED_CHANNEL);
    setWindowControlsDimmed(win as never, false, 'ink', 'win32');
    expect(tryClose()).toBe('closed');
  });

  it('close is allowed when quitting / installing an update, or the renderer is dead', () => {
    const a = mkWin();
    setWindowControlsDimmed(a.win as never, true, 'ink', 'linux');
    a.wc.isCrashed = () => true;
    expect(a.tryClose()).toBe('closed');
    const b = mkWin();
    setWindowControlsDimmed(b.win as never, true, 'ink', 'linux');
    expect(b.tryClose()).toBe('blocked');
    allowWindowClose();
    expect(b.tryClose()).toBe('closed');
  });

  it('theme change while a drawer is open keeps the dimmed symbol colour', () => {
    const { win } = mkWin();
    const w = { ...win, setBackgroundColor: jest.fn() };
    setWindowControlsDimmed(w as never, true, 'ink', 'win32');
    applyTitleBarTheme(w as never, 'paper', 'win32');
    expect(w.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('paper', true));
    setWindowControlsDimmed(w as never, false, 'paper', 'win32');
    applyTitleBarTheme(w as never, 'paper', 'win32');
    expect(w.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('paper', false));
  });

  it('IPC handler on win32: dims, restores on reload / crash, ignores untrusted senders', () => {
    const { ipcMain, BrowserWindow } = jest.requireMock('electron') as {
      ipcMain: { on: jest.Mock };
      BrowserWindow: { fromWebContents?: jest.Mock };
    };
    BrowserWindow.fromWebContents = jest.fn();
    ipcMain.on.mockClear();
    registerWindowChromeIpc('win32', () => 'paper');
    const handler = ipcMain.on.mock.calls[0][1] as (e: unknown, hidden: unknown) => void;
    const { win } = mkWin();
    (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(win);
    const sender = { getURL: () => 'file:///app/chat.html', on: jest.fn() };
    const ev = { sender, senderFrame: { url: 'file:///app/chat.html' } };

    handler(ev, true);
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('paper', true));
    const events = sender.on.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['did-start-loading', 'render-process-gone', 'unresponsive']);
    handler(ev, true); // 不重复挂监听
    expect(sender.on).toHaveBeenCalledTimes(3);
    (sender.on.mock.calls[1][1] as () => void)();
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith(overlayColors('paper', false));

    win.setTitleBarOverlay.mockClear();
    handler({ sender, senderFrame: { url: 'https://evil.example/' } }, true);
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled();
    expect(win.setWindowButtonVisibility).not.toHaveBeenCalled();
  });
});
