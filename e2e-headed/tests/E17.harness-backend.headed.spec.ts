/**
 * E17 · 编程助手接入 P0（真实 dist 应用）
 *
 * - NOMI_USE_MOCK_CLI=1：不依赖 cloud API Key
 * - 通过 window.aiIPC 验证 harness / cli-update 通道
 * - 切换到 Claude 后 toolsDisabled，Mock 转发返回文本
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const rendererIndex = resolve(electronPkgDir, 'dist', 'renderer', 'index.html');
const rendererBuild = resolve(repoRoot(), 'packages', 'renderer', 'dist', 'index.html');

type AiIpc = { invoke: (c: string, ...a: unknown[]) => Promise<unknown> };

test.describe('E17 · harness backend · mock CLI', () => {
  let app: ElectronApplication | null = null;

  test.beforeAll(() => {
    if (existsSync(rendererBuild)) {
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

  test('aiIPC harness: setBackend claude → toolsDisabled + mock send', async () => {
    test.skip(
      !existsSync(mainJs) || !existsSync(rendererIndex),
      `需要先构建：${mainJs} / ${rendererIndex}`,
    );

    const userData = mkdtempSync(join(tmpdir(), 'e17-harness-'));
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      NOMI_USE_MOCK_CLI: '1',
    };
    delete env.NODE_ENV;

    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [electronPkgDir, `--user-data-dir=${userData}`, '--enable-unsafe-swiftshader'],
      cwd: electronPkgDir,
      env,
      timeout: 60_000,
    });

    const page: Page = await app.firstWindow({ timeout: 30_000 });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { aiIPC?: { invoke: unknown } }).aiIPC?.invoke === 'function',
      null,
      { timeout: 30_000 },
    );

    // 保证干净起点（避免同机残留 harness session）
    await page.evaluate(async () => {
      const ipc = (window as unknown as { aiIPC: AiIpc }).aiIPC;
      await ipc.invoke('ai:harness:set-backend', 'nomi');
    });

    const state0 = await page.evaluate(async () => {
      const ipc = (window as unknown as { aiIPC: AiIpc }).aiIPC;
      return (await ipc.invoke('ai:harness:state')) as {
        backend: string;
        toolsDisabled: boolean;
        bins: Record<string, string | null>;
      };
    });
    expect(state0.backend).toBe('nomi');
    expect(state0.toolsDisabled).toBe(false);
    expect(state0.bins.claude).toBeTruthy();
    expect(state0.bins.codex).toBeTruthy();

    const state1 = await page.evaluate(async () => {
      const ipc = (window as unknown as { aiIPC: AiIpc }).aiIPC;
      return (await ipc.invoke('ai:harness:set-backend', 'claude')) as {
        backend: string;
        toolsDisabled: boolean;
      };
    });
    expect(state1.backend).toBe('claude');
    expect(state1.toolsDisabled).toBe(true);

    const send = await page.evaluate(async () => {
      const ipc = (window as unknown as { aiIPC: AiIpc }).aiIPC;
      return (await ipc.invoke('ai:harness:send', 'ping from E17')) as {
        text: string;
        sessionId: string | null;
        __error?: { message: string };
      };
    });
    expect(send.__error).toBeUndefined();
    expect(send.text).toMatch(/Mock Claude/);

    const inspect = await page.evaluate(async () => {
      const ipc = (window as unknown as { aiIPC: AiIpc }).aiIPC;
      return await ipc.invoke('ai:cli-update:inspect', false);
    });
    expect(inspect && typeof inspect === 'object' && !('__error' in (inspect as object))).toBe(
      true,
    );
    expect(Array.isArray(inspect)).toBe(true);
    const kinds = (inspect as Array<{ kind: string }>).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(['claude', 'codex', 'cursor']));
  });
});
