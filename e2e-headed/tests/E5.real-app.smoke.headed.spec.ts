import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

/**
 * E5 · 真实应用冒烟（非 harness）
 *
 * 直接启动 packages/electron/dist/main.js（与 `electron .` 的生产模式一致，从
 * dist/renderer/index.html 以 file:// 加载 renderer），断言：
 * - 主窗口 preload 成功：window.electronAPI 与 window.aiIPC 均已注入
 *   （回归：preload 依赖 workspace 包时，在默认 sandbox 下会 "module not found"）
 * - Live2D Cubism2 核心库已加载（window.Live2D），且没有 preload / Cubism 加载错误
 *
 * 前置：`pnpm build`（会生成 packages/electron/dist 与 packages/renderer/dist）。
 */
const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const rendererIndex = resolve(electronPkgDir, 'dist', 'renderer', 'index.html');
const rendererBuild = resolve(repoRoot(), 'packages', 'renderer', 'dist', 'index.html');

test.describe('E5 · real app · dist/main.js 生产模式冒烟', () => {
  let app: ElectronApplication | null = null;

  test.beforeAll(() => {
    if (existsSync(rendererBuild)) {
      // 每次都同步最新的 renderer 构建产物，避免 dist/renderer 过期；
      // 与 `pnpm --filter @ig-live/electron copy-renderer` 等价
      execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')], {
        stdio: 'inherit',
      });
    }
  });

  test.afterEach(async () => {
    if (app) {
      const proc = app.process();
      await Promise.race([
        app.close().catch(() => undefined),
        new Promise((r) => setTimeout(r, 5_000)),
      ]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
      app = null;
    }
  });

  test('主窗口 preload 注入 electronAPI / aiIPC，Live2D 核心库加载成功', async () => {
    test.skip(
      !existsSync(mainJs) || !existsSync(rendererIndex),
      `需要先构建：${mainJs} / ${rendererIndex}`,
    );

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    };
    delete env.NODE_ENV; // 非 development → 走 file:// 生产加载路径

    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [electronPkgDir],
      cwd: electronPkgDir,
      env,
      timeout: 30_000,
    });

    const page = await app.firstWindow({ timeout: 20_000 });
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    expect(page.url()).toMatch(/^file:\/\/.*\/dist\/renderer\/index\.html$/);

    await page.waitForFunction(
      () => {
        const w = window as unknown as Record<string, unknown>;
        return typeof w.electronAPI !== 'undefined' && typeof w.aiIPC !== 'undefined';
      },
      undefined,
      { timeout: 15_000 },
    );

    await page.waitForFunction(
      () => typeof (window as unknown as { Live2D?: unknown }).Live2D !== 'undefined',
      undefined,
      { timeout: 20_000 },
    );

    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        electronAPI: typeof w.electronAPI,
        aiIPC: typeof w.aiIPC,
        live2d: typeof w.Live2D,
        hasCanvas: !!document.querySelector('canvas#live2d'),
      };
    });
    expect(state).toEqual({
      electronAPI: 'object',
      aiIPC: 'object',
      live2d: 'function',
      hasCanvas: true,
    });

    expect(consoleErrors.filter((e) => /preload|Cubism库失败/.test(e))).toEqual([]);
  });
});
