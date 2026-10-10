import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { _electron as electron, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';
import { safeRm } from '../fixtures/fsutil';

/**
 * 动画巡检截图（非断言型）：只有设置 ANIM_SHOTS_DIR 才运行。
 * 每个动作按时长取 4 帧，正面 + 侧面；另拍「被拎起」姿态。ANIM_VRM 可指定额外导入的模型。
 *   ANIM_SHOTS_DIR=/workspace/screenshots/anim-fix/after xvfb-run -a pnpm test:e2e:headed -g "ANIM"
 */
const dir = process.env.ANIM_SHOTS_DIR;
const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');

test('ANIM capture every clip', async () => {
  test.skip(!dir || !existsSync(resolve(electronPkgDir, 'dist', 'main.js')), 'set ANIM_SHOTS_DIR');
  test.setTimeout(Number(process.env.ANIM_TIMEOUT_MS ?? 1_800_000));
  mkdirSync(dir!, { recursive: true });
  execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')]);
  const userData = mkdtempSync(join(tmpdir(), 'anim-'));
  const env = { ...(process.env as Record<string, string>), IG_DSH_CORE: 'off' };
  delete env.NODE_ENV;
  const app = await electron.launch({
    executablePath: resolveElectronExecutable(),
    args: [electronPkgDir, `--user-data-dir=${userData}`, '--enable-unsafe-swiftshader'],
    cwd: electronPkgDir,
    env,
  });
  try {
    const main = await app.firstWindow();
    const ready = () =>
      main.waitForFunction(
        () => (document.documentElement.dataset.mascotMotions ?? '').includes('wave'),
        undefined,
        { timeout: 60_000 },
      );
    await ready();
    // ANIM_VRMS=a.vrm,b.vrm（兼容旧的 ANIM_VRM）：逐个导入并真正切换为当前模型
    const extras = (process.env.ANIM_VRMS ?? process.env.ANIM_VRM ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && existsSync(f));
    const models: Array<{ tag: string; file?: string }> = [{ tag: 'default' }];
    for (const f of extras)
      models.push({
        tag:
          basename(dirname(f)) === 'models' || basename(f) !== 'model.vrm'
            ? basename(f, '.vrm')
            : basename(dirname(f)),
        file: f,
      });
    for (const { tag: model, file } of models) {
      if (file) {
        const id = await main.evaluate(async (f) => {
          const r = (await (
            window as unknown as {
              electronAPI: {
                models: { importVrm(p: string): Promise<{ model?: { id: string } }> };
              };
            }
          ).electronAPI.models.importVrm(f)) as { model?: { id: string } };
          return r?.model?.id ?? '';
        }, file);
        if (!id) throw new Error(`import failed: ${file}`);
        await main.waitForTimeout(800);
        await main.evaluate(
          (m) =>
            window.dispatchEvent(new CustomEvent('mascot:select-model', { detail: { id: m } })),
          id,
        );
        await main.waitForFunction((m) => document.documentElement.dataset.mascotModel === m, id, {
          timeout: 30_000,
        });
        await main.waitForTimeout(1000);
        await ready();
      }
      const loaded = await main.evaluate(() => document.documentElement.dataset.mascotModel ?? '');
      writeFileSync(join(dir!, `${model}-MODEL.txt`), loaded);
      await main.waitForTimeout(1500);
      const clips = (
        await main.evaluate(() => document.documentElement.dataset.mascotMotions ?? '')
      )
        .split(',')
        .filter((n) => n && n !== 'walk');
      const shot = async (p: Page, name: string) => {
        const box = (await p.evaluate(() => document.documentElement.dataset.mascotBox ?? ''))
          .split(',')
          .map(Number);
        const clip =
          box.length === 4 && box.every(Number.isFinite)
            ? {
                x: Math.max(0, box[0] - 60),
                y: Math.max(0, box[2] - 40),
                width: box[1] - box[0] + 120,
                height: box[3] - box[2] + 60,
              }
            : undefined;
        await p.screenshot({ path: join(dir!, `${model}-${name}.png`), clip });
      };
      for (const view of [0, Math.PI / 2]) {
        const v = view ? 'side' : 'front';
        await main.evaluate(
          (y) => ((window as unknown as { __mascotDebugYaw: number }).__mascotDebugYaw = y),
          view,
        );
        for (const name of clips) {
          await main.evaluate(
            (n) => window.dispatchEvent(new CustomEvent('mascot:motion', { detail: { name: n } })),
            name,
          );
          for (let k = 0; k < 4; k += 1) {
            await main.waitForTimeout(500);
            await shot(main, `${v}-${name}-${k}`);
          }
          await main.waitForTimeout(900);
        }
        // 被拎起（真实拖拽状态）
        await main.evaluate(() => {
          const api = (
            window as unknown as {
              electronAPI: { mascotWindow: { dragStart(x: number, y: number): void } };
            }
          ).electronAPI.mascotWindow;
          api.dragStart(window.screenX + 200, window.screenY + 300);
        });
        for (let k = 0; k < 3; k += 1) {
          await main.waitForTimeout(500);
          await shot(main, `${v}-held-${k}`);
        }
        await main.evaluate(() =>
          (
            window as unknown as { electronAPI: { mascotWindow: { dragEnd(): void } } }
          ).electronAPI.mascotWindow.dragEnd(),
        );
        await main.waitForTimeout(2500);
      }
    }
  } finally {
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    safeRm(userData);
  }
});
