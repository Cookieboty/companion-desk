/**
 * ElectronLifecycle —— 把 Electron `app.on('before-quit', ...)` 适配成 `AppLifecycle`。
 *
 * 采用惰性 `require('electron')`：
 * - 生产环境（主进程）能拿到真实 `app`；
 * - Node 纯脚本环境下 require 会抛错，此时应传入 `NoopLifecycle`。
 */

import type { AppLifecycle } from './AIRuntimeService';

interface ElectronAppLike {
  on(evt: 'before-quit', fn: () => void): unknown;
  off?: (evt: 'before-quit', fn: () => void) => unknown;
  removeListener?: (evt: 'before-quit', fn: () => void) => unknown;
}

export const NoopLifecycle: AppLifecycle = {
  onBeforeQuit: () => () => {},
};

export function createElectronLifecycle(): AppLifecycle {
  let app: ElectronAppLike;
  try {
    const req = (0, eval)('require');
    const mod = req('electron') as { app: ElectronAppLike };
    app = mod.app;
  } catch (err) {
    throw new Error(
      '[ai-runtime] failed to require("electron"); ' +
        'if you are not inside Electron main, use NoopLifecycle instead. ' +
        `underlying error: ${(err as Error).message}`,
    );
  }
  return {
    onBeforeQuit(fn) {
      const wrapped = () => {
        Promise.resolve(fn()).catch((err) =>
          console.error('[ai-runtime] before-quit handler threw', err),
        );
      };
      app.on('before-quit', wrapped);
      return () => {
        (app.off ?? app.removeListener)?.('before-quit', wrapped);
      };
    },
  };
}
