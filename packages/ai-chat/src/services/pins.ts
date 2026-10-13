/**
 * 左上角「常驻入口」：用户可自选、可排序，保存在本机 localStorage。
 * 执行时通过 window 事件 `cd:cmd` 交给输入框（它持有各功能的实际动作）；「新对话」由 App 处理。
 */
import { useCallback, useEffect, useState } from 'react';

export interface PinDef {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
}

export const PIN_POOL: PinDef[] = [
  { id: 'newchat', icon: '✏️', label: '新对话' },
  { id: 'snip', icon: '✂️', label: '截图提问', shortcut: '⌘/Ctrl+Shift+S' },
  { id: 'kb', icon: '📚', label: '知识库问答开关', shortcut: '⌘/Ctrl+Shift+K' },
  { id: 'handsfree', icon: '🎧', label: '免按键语音', shortcut: '⌘/Ctrl+Shift+H' },
  { id: 'voice', icon: '🎙', label: '语音设置', shortcut: 'F2 说话' },
  { id: 'model', icon: '🔑', label: '供应商与模型' },
  { id: 'kbm', icon: '🗂', label: '知识库管理', shortcut: '⌘/Ctrl+Shift+L' },
  { id: 'memory', icon: '🧠', label: '长期记忆', shortcut: '⌘/Ctrl+Shift+M' },
  { id: 'schedule', icon: '🗓', label: '日程 · 编程助手', shortcut: '⌘/Ctrl+Shift+D' },
  { id: 'screen', icon: '🖥', label: '屏幕记忆', shortcut: '⌘/Ctrl+Shift+O' },
  { id: 'ext', icon: '🧩', label: '扩展 / MCP', shortcut: '⌘/Ctrl+Shift+E' },
  { id: 'desktop', icon: '📁', label: '桌面权限' },
  { id: 'local', icon: '🏠', label: '本机管理', shortcut: '⌘/Ctrl+Shift+J' },
  { id: 'settings', icon: '⚙️', label: '设置', shortcut: '⌘/Ctrl+,' },
];

/**
 * 默认 4 个：每条消息都可能用到、且右上角没有的动作。
 * 新对话（最高频）、截图提问、知识库问答开关、免按键语音。模型切换已常驻在输入框里，不重复。
 */
export const DEFAULT_PINS = ['newchat', 'snip', 'kb', 'handsfree'];
export const MAX_PINS = 6;
const KEY = 'cd.chat.pins';
const EVT = 'cd:pins-changed';

export const pinDef = (id: string) => PIN_POOL.find((p) => p.id === id);

export function normalizePins(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULT_PINS];
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && pinDef(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX_PINS);
}

export function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? [...DEFAULT_PINS] : normalizePins(JSON.parse(raw));
  } catch {
    return [...DEFAULT_PINS];
  }
}

export function savePins(ids: string[]): string[] {
  const n = normalizePins(ids);
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
  return n;
}

export const togglePin = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= MAX_PINS ? ids : [...ids, id];

export function movePin(ids: string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

export function usePins() {
  const [pins, setPins] = useState<string[]>(loadPins);
  useEffect(() => {
    const sync = () => setPins(loadPins());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const update = useCallback((ids: string[]) => setPins(savePins(ids)), []);
  return { pins, update };
}

/** 执行一个入口（输入框监听并执行） */
export const runPinCommand = (id: string) =>
  window.dispatchEvent(new CustomEvent<string>('cd:cmd', { detail: id }));
