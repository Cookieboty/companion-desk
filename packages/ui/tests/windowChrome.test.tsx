import fs from 'node:fs';
import path from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Modal, ModalHostContext } from '../src';
import { __resetWindowButtonHolders, hideWindowButtons } from '../src/windowChrome';

type W = { electronAPI?: unknown };
const setHidden = vi.fn();
const setBridge = (platform?: string) => {
  (window as unknown as W).electronAPI = { platform, chrome: { setButtonsHidden: setHidden } };
};

beforeEach(() => {
  setHidden.mockClear();
  __resetWindowButtonHolders();
  setBridge('darwin');
});
afterEach(() => {
  cleanup();
  delete (window as unknown as W).electronAPI;
});

const Drawer: React.FC<{ onClose: () => void; open?: boolean }> = ({ onClose, open = true }) => (
  <ModalHostContext.Provider value={{ mode: 'drawer' }}>
    <Modal open={open} onClose={onClose} title="添加供应商" data-testid="drawer">
      <input aria-label="name" />
    </Modal>
  </ModalHostContext.Provider>
);

describe('drawer vs. native window buttons (macOS traffic lights)', () => {
  it('hides the window buttons while a drawer is open and restores them on close', () => {
    const { rerender } = render(<Drawer onClose={() => {}} />);
    expect(setHidden.mock.calls).toEqual([[true]]);
    rerender(<Drawer onClose={() => {}} open={false} />);
    expect(setHidden.mock.calls).toEqual([[true], [false]]);
  });

  it('restores the window buttons when the drawer unmounts', () => {
    const { unmount } = render(<Drawer onClose={() => {}} />);
    unmount();
    expect(setHidden).toHaveBeenLastCalledWith(false);
  });

  it('plain modals are handled the same way; inline panels are not', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="x">
        body
      </Modal>,
    );
    expect(setHidden).toHaveBeenCalledWith(true);
    unmount();
    setHidden.mockClear();
    render(
      <ModalHostContext.Provider value={{ mode: 'inline' }}>
        <Modal open onClose={() => {}} title="inline">
          body
        </Modal>
      </ModalHostContext.Provider>,
    );
    expect(setHidden).not.toHaveBeenCalled();
  });

  it('stacked dialogs: buttons come back only after the last one closes', () => {
    const a = hideWindowButtons();
    const b = hideWindowButtons();
    expect(setHidden.mock.calls).toEqual([[true]]);
    a();
    a(); // 幂等
    expect(setHidden.mock.calls).toEqual([[true]]);
    b();
    expect(setHidden.mock.calls).toEqual([[true], [false]]);
  });

  it('no IPC on Windows / Linux, and no crash without the bridge', () => {
    for (const p of ['win32', 'linux']) {
      setBridge(p);
      const release = hideWindowButtons();
      release();
    }
    expect(setHidden).not.toHaveBeenCalled();
    delete (window as unknown as W).electronAPI;
    expect(() => hideWindowButtons()()).not.toThrow();
    (window as unknown as W).electronAPI = { platform: 'darwin' }; // 旧 preload：没有 chrome
    expect(() => hideWindowButtons()()).not.toThrow();
  });

  it('close stays reachable: X button, Esc and overlay click all close the drawer', () => {
    const onClose = vi.fn();
    render(<Drawer onClose={onClose} />);
    const x = screen.getByRole('button', { name: '关闭' });
    fireEvent.click(x);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('drawer-overlay'));
    expect(onClose).toHaveBeenCalledTimes(3);
    // 点抽屉本体不关闭
    fireEvent.click(screen.getByTestId('drawer'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('drawer overlay styling', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles.css'), 'utf8');
  const rule = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    return css.slice(i, css.indexOf('}', i));
  };
  it('is more opaque + blurred than the plain overlay and is not a drag region', () => {
    const r = rule('.cd-modal-overlay--drawer');
    expect(r).toMatch(/background:\s*color-mix\(in srgb, var\(--cd-color-bg\) 68%/);
    expect(r).toMatch(/backdrop-filter:\s*blur\(14px\)/);
    expect(r).toMatch(/-webkit-app-region:\s*no-drag/);
  });
});
