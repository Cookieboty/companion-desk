/**
 * 主题切换：在 <html data-theme> 上设置主题 id（默认 Cool Mist 不设属性）。
 * 桌面端经主进程 `ai:theme:*` 持久化并广播，看板娘窗口与对话窗口同步；无 IPC 时退回 localStorage。
 */
export type ThemeId = 'mist' | 'graphite' | 'ink' | 'paper';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  desc: string;
  /** 预览色：背景 / 表面 / 文字 / 强调 */
  swatch: [string, string, string, string];
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'mist',
    name: 'Cool Mist（当前默认）',
    desc: '冷灰蓝底 + 青蓝强调',
    swatch: ['#0a0f1a', '#1e293b', '#e8eef7', '#3898c4'],
  },
  {
    id: 'graphite',
    name: 'A · Graphite 石墨',
    desc: '中性暗色 + 低饱和靛蓝',
    swatch: ['#0f0f11', '#1b1b1e', '#ededef', '#6872e5'],
  },
  {
    id: 'ink',
    name: 'B · Warm Ink 暖墨',
    desc: '暖中性暗色 + 陶土橙',
    swatch: ['#1a1917', '#272522', '#ece8e1', '#c4744f'],
  },
  {
    id: 'paper',
    name: 'C · Light Paper 纸白',
    desc: '干净浅色 + 克制系统蓝',
    swatch: ['#fafaf9', '#ffffff', '#1c1c1e', '#2563d6'],
  },
];

export const DEFAULT_THEME: ThemeId = 'mist';
const KEY = 'cd.theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

interface Bridge {
  invoke(ch: string, ...a: unknown[]): Promise<unknown>;
  on(ch: string, fn: (p: unknown) => void): () => void;
}
const bridge = (): Bridge | undefined => {
  const b = (globalThis as { aiIPC?: Bridge }).aiIPC;
  return b && typeof b.invoke === 'function' ? b : undefined;
};

export function applyTheme(id: ThemeId): void {
  const el = document.documentElement;
  if (id === DEFAULT_THEME) el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<ThemeId>('cd:theme-changed', { detail: id }));
}

export function currentTheme(): ThemeId {
  const a = document.documentElement.getAttribute('data-theme');
  return isTheme(a) ? a : DEFAULT_THEME;
}

/** 启动时调用一次：先用本地缓存避免闪烁，再以主进程为准并订阅变更 */
export function initTheme(): () => void {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  applyTheme(isTheme(cached) ? cached : DEFAULT_THEME);
  const b = bridge();
  if (!b) return () => undefined;
  void b
    .invoke('ai:theme:get')
    .then((v) => isTheme(v) && applyTheme(v))
    .catch(() => undefined);
  return b.on('ai:theme:changed', (v) => isTheme(v) && applyTheme(v));
}

/** 用户在设置里选择主题 */
export async function setTheme(id: ThemeId): Promise<void> {
  applyTheme(id);
  await bridge()
    ?.invoke('ai:theme:set', id)
    .catch(() => undefined);
}
