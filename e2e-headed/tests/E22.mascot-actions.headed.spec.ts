import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';
import { safeRm } from '../fixtures/fsutil';

/**
 * E22 · 诺米 2D 看板娘动作库（真实应用）
 *
 * - 切到 Nomi 精灵模型，能力列表里有全部命名动作（至少 30 个）
 * - 逐个触发 mascot:motion，探针 data-mascot-action 报出正在播放的动作
 * - 每个动作播放期间的绘制耗时探针 data-mascot-paint-ms 不超预算
 * - 设置 E22_SHOTS=<dir> 时，每个动作在中段截一张图
 */
const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const shots = process.env.E22_SHOTS;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('E22 · mascot action library', () => {
  let app: ElectronApplication | null = null;
  let userData = '';

  test.afterEach(async () => {
    if (app) {
      const proc = app.process();
      await Promise.race([app.close().catch(() => undefined), sleep(5_000)]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
      app = null;
    }
    if (userData) safeRm(userData);
  });

  test('every named action plays on the Nomi rig', async () => {
    test.setTimeout(600_000);
    test.skip(!existsSync(mainJs), `需要先构建：${mainJs}`);
    execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')]);
    userData = mkdtempSync(join(tmpdir(), 'e22-userdata-'));
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
      timeout: 30_000,
    });
    const page = await app.firstWindow({ timeout: 20_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.mascotBackend !== undefined,
      undefined,
      { timeout: 90_000 },
    );
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('mascot:select-model', { detail: { id: 'nomi' } })),
    );
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.mascotModel === 'nomi' &&
        document.documentElement.dataset.mascotBackend === 'sprite',
      undefined,
      { timeout: 60_000 },
    );

    const motions = (
      await page.evaluate(() => document.documentElement.dataset.mascotMotions ?? '')
    )
      .split(',')
      .filter(Boolean);
    // 三个旧的程序化手势（后跳 / 跺脚 / 耸肩）走旧通道，不在动作管理器里报名
    const legacy = new Set(['jump', 'stomp', 'shrug']);
    expect(motions.length).toBeGreaterThanOrEqual(30);
    for (const id of ['wave', 'heart', 'blow_kiss', 'thumbs_up', 'sorry', 'think', 'goodnight']) {
      expect(motions).toContain(id);
    }

    if (shots) mkdirSync(shots, { recursive: true });
    const failed: string[] = [];
    let worstPaint = 0;
    for (const id of motions.filter((m) => !legacy.has(m))) {
      let started = false;
      for (let attempt = 0; attempt < 4 && !started; attempt++) {
        // 等上一个动作（含随机待机小动作）结束，再触发
        await page
          .waitForFunction(() => !document.documentElement.dataset.mascotAction, undefined, {
            timeout: 15_000,
          })
          .catch(() => undefined);
        await page.evaluate(
          (name) => window.dispatchEvent(new CustomEvent('mascot:motion', { detail: { name } })),
          id,
        );
        started = await page
          .waitForFunction((name) => document.documentElement.dataset.mascotAction === name, id, {
            timeout: 3_000,
          })
          .then(() => true)
          .catch(() => false);
      }
      if (!started) {
        failed.push(id);
        continue;
      }
      await sleep(900);
      const paint = Number(
        await page.evaluate(() => document.documentElement.dataset.mascotPaintMs ?? '0'),
      );
      worstPaint = Math.max(worstPaint, paint);
      if (shots) await page.screenshot({ path: join(shots, `${id}.png`) });
    }
    expect(failed, `actions that never reported as playing: ${failed.join(',')}`).toEqual([]);
    // CI 用软件渲染，预算放宽；真实机器上通常 < 2ms
    expect(worstPaint).toBeLessThan(40);
  });
});
