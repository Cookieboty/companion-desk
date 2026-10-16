jest.unmock('fs');
jest.unmock('path');
import fs from 'node:fs';
import path from 'node:path';

import {
  THEME_CHROME,
  WINDOW_BUTTONS_CHANNEL,
  applyTitleBarTheme,
  registerWindowChromeIpc,
  setWindowButtonsHidden,
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

  it('IPC is only registered on macOS', () => {
    const { ipcMain } = jest.requireMock('electron') as { ipcMain: { on: jest.Mock } };
    ipcMain.on.mockClear();
    registerWindowChromeIpc('win32');
    registerWindowChromeIpc('linux');
    expect(ipcMain.on).not.toHaveBeenCalled();
    registerWindowChromeIpc('darwin');
    expect(ipcMain.on).toHaveBeenCalledWith(WINDOW_BUTTONS_CHANNEL, expect.any(Function));
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
    const sender = { getURL: () => 'file:///app/chat.html', once: jest.fn() };

    handler({ sender, senderFrame: { url: 'file:///app/chat.html' } }, true);
    expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(false);
    // 渲染进程重新加载时自动恢复
    expect(sender.once).toHaveBeenCalledWith('did-start-loading', expect.any(Function));
    (sender.once.mock.calls[0][1] as () => void)();
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
