import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { makeTinyVrm, solidPng } from '../../packages/electron/tests/fixtures/tinyVrm';
import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

/**
 * E8 · 模型商店 + 本地导入（真实应用，本地 mock 目录服务器）
 *
 * - 目录里有一个 CC0 模型和一个专有许可模型：只显示前者
 * - 下载（进度 + sha256）→ 出现在「我的角色」→ 切换后 VRM 加载成功（cdmodel:// 协议）
 * - 导入用户 VRM 1.0：读取 meta、显示责任提示；修改配置；删除
 * - 目录服务器下线后刷新：离线模式显示缓存目录
 */
const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const rendererBuild = resolve(repoRoot(), 'packages', 'renderer', 'dist', 'index.html');
const shotDir = process.env.E8_SCREENSHOT_DIR;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function shot(page: Page, name: string) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}.png`) });
}

test.describe('E8 · model store + local import', () => {
  let app: ElectronApplication | null = null;
  let server: http.Server | null = null;
  let userData = '';
  let work = '';

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
    server?.close();
    server = null;
    for (const d of [userData, work]) if (d) rmSync(d, { recursive: true, force: true });
  });

  test('browse → download → use; import user VRM; offline catalog', async () => {
    test.setTimeout(240_000);
    test.skip(!existsSync(mainJs), `需要先构建：${mainJs}`);

    userData = mkdtempSync(join(tmpdir(), 'e8-userdata-'));
    work = mkdtempSync(join(tmpdir(), 'e8-work-'));

    const vrm = makeTinyVrm({ title: 'Store Girl', padBytes: 3 * 1024 * 1024 });
    const thumb = solidPng(64, 64, [250, 170, 210]);
    const files = new Map<string, Buffer>([
      ['/m/store-girl.vrm', vrm],
      ['/m/store-girl.png', thumb],
    ]);
    server = http.createServer((req, res) => {
      const p = (req.url ?? '/').split('?')[0]!;
      const body = files.get(p);
      if (!body) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-length': body.length });
      // 分块慢慢发，让进度条可见
      let off = 0;
      const tick = () => {
        if (off >= body.length) return void res.end();
        res.write(body.subarray(off, off + 256 * 1024));
        off += 256 * 1024;
        setTimeout(tick, 40);
      };
      tick();
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const entry = (id: string, name: string, license: string) => ({
      id,
      name,
      author: 'E8 tests',
      license,
      source: 'https://example.com/e8',
      version: '1.0.0',
      vrmVersion: '0.x',
      tags: ['test'],
      credit: `${name} — E8 tests (${license})`,
      vrm: { urls: [`${base}/m/store-girl.vrm`], sha256: sha(vrm), size: vrm.length },
      thumbnail: { urls: [`${base}/m/store-girl.png`], sha256: sha(thumb), size: thumb.length },
    });
    files.set(
      '/catalog.json',
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          models: [
            entry('store-girl', 'Store Girl', 'CC0-1.0'),
            entry('sample-girl', 'Sample Girl', 'LicenseRef-VRoid-AvatarSample'),
            entry('closed-girl', 'Closed', 'LicenseRef-Proprietary'),
          ],
        }),
      ),
    );

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      COMPANION_MODEL_CATALOG_URL: `${base}/catalog.json`,
      IG_MODEL_STORE_ALLOW_LOOPBACK: '1',
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
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('dialog', (d) => void d.accept());
    await page.waitForFunction(
      () => document.documentElement.dataset.mascotBackend === 'vrm',
      undefined,
      {
        timeout: 90_000,
      },
    );

    // preloadGuard 可能在首次加载缺 preload 时 reload 一次：等 API 就绪
    await page.waitForFunction(() => !!window.electronAPI?.models, undefined, { timeout: 20_000 });
    // 只内置默认角色
    const bundled = await page.evaluate(() => window.electronAPI!.models!.list());
    expect(bundled.map((m) => m.id)).toEqual(['default-character']);

    // —— 商店 ——
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mascot:open-picker')));
    await page.getByRole('tab', { name: '模型商店' }).click();
    await expect(page.getByTestId('store-item-store-girl')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('store-item-closed-girl')).toHaveCount(0);
    await expect(page.getByTestId('store-item-store-girl').getByText('CC0-1.0')).toBeVisible();
    // 审核过的非 OSI 条款：徽章 + 条件
    await expect(page.getByTestId('store-item-sample-girl').getByText('VRoid 条款')).toBeVisible();
    await expect(page.getByTestId('store-terms-sample-girl')).toContainText('可商用 · 可再分发');
    await shot(page, 'store-browse');
    await page.getByTestId('store-install-store-girl').click();
    await expect(page.getByTestId('store-progress-store-girl')).toBeVisible({ timeout: 10_000 });
    await shot(page, 'store-downloading');
    await expect(page.getByTestId('store-use-store-girl')).toBeVisible({ timeout: 60_000 });
    await shot(page, 'store-installed');

    await page.getByRole('tab', { name: '我的角色' }).click();
    await page.getByTestId('model-option-store-girl').click();
    await page.waitForFunction(
      () => localStorage.getItem('companion.mascot.model') === 'store-girl',
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.mascotBackend === 'vrm',
      undefined,
      {
        timeout: 60_000,
      },
    );
    await page.waitForTimeout(1500);
    await shot(page, 'store-girl-active');

    // —— 本地导入（VRM 1.0）——
    const userVrm = join(work, 'My Own.vrm');
    writeFileSync(
      userVrm,
      makeTinyVrm({ version: '1.0', title: 'My Own', author: 'Me', allowRedistribution: false }),
    );
    const imported = await page.evaluate((p) => window.electronAPI!.models!.importVrm(p), userVrm);
    expect(imported.ok).toBe(true);
    const uid = imported.model!.id;
    expect(uid).toMatch(/^user-my-own-/);
    expect(imported.model).toMatchObject({
      origin: 'user',
      author: 'Me',
      meta: { version: '1.0', allowRedistribution: false },
    });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mascot:open-picker')));
    await page.getByRole('tab', { name: '导入 VRM' }).click();
    await expect(page.getByTestId('user-model-notice')).toContainText('不会上传');
    await shot(page, 'import-tab');
    await page.getByRole('tab', { name: '我的角色' }).click();
    await expect(page.getByTestId(`model-option-${uid}`)).toBeVisible();
    await page.getByTestId(`model-edit-${uid}`).click();
    await expect(page.getByTestId('user-model-meta')).toContainText('Me');
    await page.getByTestId('cfg-scale').fill('1.2');
    await page.getByTestId('cfg-save').click();
    await expect(page.getByText('已保存')).toBeVisible();
    await shot(page, 'user-model-editor');
    const after = await page.evaluate(() => window.electronAPI!.models!.list());
    expect(after.find((m) => m.id === uid)?.config).toMatchObject({ scale: 1.2 });
    await page.getByTestId('cfg-delete').click();
    await expect(page.getByTestId(`model-option-${uid}`)).toHaveCount(0, { timeout: 10_000 });

    // —— 离线 ——
    server.close();
    server.closeAllConnections?.();
    server = null;
    await page.getByRole('tab', { name: '模型商店' }).click();
    await page.getByTestId('store-refresh').click();
    await expect(page.getByText('离线：显示缓存的目录')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('store-use-store-girl')).toBeVisible();

    // 删除已下载模型
    await page.getByTestId('store-remove-store-girl').click();
    await expect(page.getByTestId('store-install-store-girl')).toBeVisible({ timeout: 10_000 });

    expect(errors.filter((e) => /VRM 加载失败|preload/.test(e))).toEqual([]);
  });
});
