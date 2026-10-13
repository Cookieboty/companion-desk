// @vitest-environment happy-dom
import { DEFAULT_THEME, THEMES, applyTheme, currentTheme, initTheme } from '@ig-live/ui';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeSettings } from '../src/components/SettingsView/ThemeSettings';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  delete (window as { aiIPC?: unknown }).aiIPC;
});

describe('themes', () => {
  it('default stays Cool Mist (no data-theme)', () => {
    expect(DEFAULT_THEME).toBe('mist');
    initTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(THEMES.map((t) => t.id)).toEqual(['mist', 'graphite', 'ink', 'paper']);
  });
  it('picker applies theme and persists via IPC', async () => {
    const invoke = vi.fn().mockResolvedValue('mist');
    (window as { aiIPC?: unknown }).aiIPC = { invoke, on: () => () => undefined };
    const r = render(<ThemeSettings />);
    fireEvent.click(r.getByTestId('theme-paper'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
    expect(invoke).toHaveBeenCalledWith('ai:theme:set', 'paper');
    expect(r.getByTestId('theme-paper').getAttribute('aria-checked')).toBe('true');
    applyTheme('mist');
    expect(currentTheme()).toBe('mist');
  });
});
