import { useEffect } from 'react';

/**
 * 抽屉 / 模态打开时处理原生窗口按钮，避免用户把它们当成「关闭抽屉」而误关整个窗口。
 *
 * 原生窗口按钮画在 DOM 之上，半透明遮罩盖不住、仍然可点。桌面端通过 preload 的
 * `electronAPI.chrome` 与主进程协作（平台分支都在主进程 core/titleBar.ts，这里不判断平台）：
 * - macOS：`setButtonsHidden(true)` → 隐藏红绿灯；
 * - Windows / Linux：`setButtonsHidden(true)` → 原生按钮 overlay 调暗，并拦截此时的窗口关闭
 *   （点 ✕ / Alt+F4），主进程改发 `onCloseBlocked`，这里模拟 Esc 关闭最上层抽屉。
 * 没有该桥（浏览器 / 看板娘窗口 / 旧主进程）时是空操作。多层叠加的对话框用计数，最后一个关闭才恢复。
 */
interface ChromeBridge {
  platform?: string;
  chrome?: {
    setButtonsHidden?: (hidden: boolean) => void;
    onCloseBlocked?: (cb: () => void) => () => void;
  };
}

let holders = 0;
let unsubscribeCloseBlocked: (() => void) | null = null;

function bridge(): ChromeBridge | undefined {
  return (globalThis as { window?: { electronAPI?: ChromeBridge } }).window?.electronAPI;
}

function send(hidden: boolean): void {
  try {
    bridge()?.chrome?.setButtonsHidden?.(hidden);
  } catch {
    /* 窗口按钮只是防误触增强，失败不影响抽屉本身 */
  }
}

/** 窗口关闭被拦截：等同按 Esc，只关闭最上层抽屉 / 模态（useFocusTrap 在 document 捕获阶段处理） */
function closeTopmost(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}

function subscribe(): void {
  try {
    unsubscribeCloseBlocked = bridge()?.chrome?.onCloseBlocked?.(closeTopmost) ?? null;
  } catch {
    unsubscribeCloseBlocked = null;
  }
}

function unsubscribe(): void {
  try {
    unsubscribeCloseBlocked?.();
  } catch {
    /* ignore */
  }
  unsubscribeCloseBlocked = null;
}

/** 申请隐藏窗口按钮；返回释放函数（幂等）。 */
export function hideWindowButtons(): () => void {
  holders += 1;
  if (holders === 1) {
    subscribe();
    send(true);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) {
      unsubscribe();
      send(false);
    }
  };
}

/** active 期间隐藏窗口按钮（卸载 / 关闭时恢复）。 */
export function useWindowButtonsHidden(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return hideWindowButtons();
  }, [active]);
}

/** 仅测试用：重置计数 */
export function __resetWindowButtonHolders(): void {
  holders = 0;
  unsubscribe();
}
