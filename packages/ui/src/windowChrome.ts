import { useEffect } from 'react';

/**
 * 抽屉 / 模态打开时隐藏 macOS 原生红绿灯。
 *
 * 原生窗口按钮画在 DOM 之上，半透明遮罩盖不住：红绿灯仍清晰可点，用户会把它当成「关闭抽屉」
 * 而误关整个窗口。桌面端通过 preload 的 `electronAPI.chrome.setButtonsHidden` 请求主进程
 * `setWindowButtonVisibility(false)`（仅 macOS 生效，Windows / Linux 主进程忽略）；
 * 没有该桥（浏览器 / 看板娘窗口 / 旧主进程）时是空操作。多层叠加的对话框用计数，最后一个关闭才恢复。
 */
interface ChromeBridge {
  platform?: string;
  chrome?: { setButtonsHidden?: (hidden: boolean) => void };
}

let holders = 0;

function send(hidden: boolean): void {
  try {
    const api = (globalThis as { window?: { electronAPI?: ChromeBridge } }).window?.electronAPI;
    // 平台已知且不是 macOS：不发 IPC，Windows / Linux 零影响
    if (!api || (api.platform && api.platform !== 'darwin')) return;
    api.chrome?.setButtonsHidden?.(hidden);
  } catch {
    /* 窗口按钮只是防误触增强，失败不影响抽屉本身 */
  }
}

/** 申请隐藏窗口按钮；返回释放函数（幂等）。 */
export function hideWindowButtons(): () => void {
  holders += 1;
  if (holders === 1) send(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) send(false);
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
}
