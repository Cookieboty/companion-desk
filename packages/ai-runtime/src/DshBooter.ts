/**
 * DshBooter —— 生产环境的 `Booter` 实现。
 *
 * 通过 `@deepseek-ai/dsh-app-boot` 的 `loadProfile + composeEntries` 装配 profile，
 * 再调用 `@deepseek-ai/dsh` 的 `boot()` 拿到 `PluginContext`。
 *
 * 之所以延迟到 `boot()` 调用时 `await import('@deepseek-ai/dsh')`：
 * - dsh 核心是 ESM，本包也是 ESM 但打包出 CJS；
 * - 测试环境不真的加载 dsh，通过 fake booter 即可跑 vitest；
 * - 只有 P6-verify 的集成测试（playwright-electron）才走真的 dsh。
 */

import { createRequire } from 'node:module';

import type { PluginContext } from '@ig-live/bundle-ig-base';

import type { Booter, StartOptions } from './AIRuntimeService';

export interface DshBooterOptions {
  /**
   * 用于 `require.resolve('@deepseek-ai/dsh/package.json')` 的锚点。
   * 默认使用当前包的 CJS import.meta 位置（由 tsup 注入）。
   */
  installAnchor?: string;
}

export function createDshBooter(opts: DshBooterOptions = {}): Booter {
  const req = createRequire(typeof __filename !== 'undefined' ? __filename : process.cwd());

  let disposer: (() => Promise<void> | void) | undefined;

  return {
    async boot(profile: string, startOpts: StartOptions): Promise<PluginContext> {
      const installAnchor = opts.installAnchor ?? req.resolve('@deepseek-ai/dsh/package.json');
      // 通过变量隐藏 module id，避开构建工具（vite/tsup）的静态分析——
      // `@deepseek-ai/dsh` 是可选 peer dep，仅在真实主进程可解析。
      const dshId = '@deepseek-ai/' + 'dsh';
      const boot = (await import(/* @vite-ignore */ dshId)) as unknown as {
        boot: (args: {
          profile: string;
          home: string;
          installAnchor: string;
        }) => Promise<{ ctx: PluginContext; dispose?: () => Promise<void> | void }>;
      };
      const { ctx, dispose } = await boot.boot({
        profile,
        home: startOpts.home,
        installAnchor,
      });
      disposer = dispose;
      return ctx;
    },
    async dispose() {
      await disposer?.();
      disposer = undefined;
    },
  };
}
