/**
 * 惰性加载 electron。仅在主进程执行的运行期路径调用，避免测试环境或渲染进程直接 crash。
 */
import { createRequire } from 'node:module';

import type * as ElectronModuleT from 'electron';

type ElectronModule = typeof ElectronModuleT;

let cached: ElectronModule | undefined;

const requireFn = createRequire(import.meta.url);

export function loadElectron(): ElectronModule {
  if (cached) return cached;
  try {
    const mod = requireFn('electron') as ElectronModule;
    cached = mod;
    return mod;
  } catch (err) {
    throw new Error(
      `[@ig-live/bundle-ig-electron-caps] failed to require('electron'): ${(err as Error).message}`,
    );
  }
}

export function __setElectronMockForTest(mod: unknown): void {
  cached = mod as ElectronModule;
}

export function __resetElectronForTest(): void {
  cached = undefined;
}
