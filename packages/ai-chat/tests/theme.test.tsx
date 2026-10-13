// @vitest-environment happy-dom
import {
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  currentTheme,
  initTheme,
  resolveTheme,
} from '@nomi-ai/ui';
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
  it('new users default to Warm Ink; saved choice respected', () => {
    expect(DEFAULT_THEME).toBe('ink');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('ink');
    localStorage.setItem('cd.theme', 'mist');
    initTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(THEMES.map((t) => t.id).sort()).toEqual(['graphite', 'ink', 'mist', 'paper', 'system']);
  });
  it('follow system resolves dark → graphite, light → paper', () => {
    expect(resolveTheme('system', true)).toBe('graphite');
    expect(resolveTheme('system', false)).toBe('paper');
  });
  it('picker applies theme and persists via IPC', async () => {
    const invoke = vi.fn().mockResolvedValue({ pref: 'paper', resolved: 'paper' });
    (window as { aiIPC?: unknown }).aiIPC = { invoke, on: () => () => undefined };
    const r = render(<ThemeSettings />);
    fireEvent.click(r.getByTestId('theme-paper'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
    expect(invoke).toHaveBeenCalledWith('ai:theme:set', 'paper');
    expect(r.getByTestId('theme-paper').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(r.getByTestId('theme-system'));
    expect(invoke).toHaveBeenCalledWith('ai:theme:set', 'system');
    applyTheme('mist');
    expect(currentTheme().resolved).toBe('mist');
  });
});
