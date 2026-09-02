import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface HeadedLaunchOptions {
  profile?: 'waifu' | 'chat-only' | 'mcp-headless';
  noWindow?: boolean;
}

export interface HeadedFixture {
  app: ElectronApplication;
  page: Page | null;
  launchHeaded(opts?: HeadedLaunchOptions): Promise<{ app: ElectronApplication; page: Page | null }>;
}

/**
 * 定位仓库根目录（e2e-headed/fixtures → 上跳两级）。
 */
export function repoRoot(): string {
  return resolve(__dirname, '..', '..');
}

/**
 * 定位 electron 可执行文件的**绝对路径**。
 *
 * 背景：Playwright 的 `_electron.launch()` 默认按 CWD 找 `node_modules/electron`；
 * 本仓库根 `node_modules/electron` 是随 `@playwright/test` 后装的空壳（postinstall
 * 未成功下载 dist），而完整的 `electron@25.9.8` 二进制在 `packages/electron/node_modules/electron`。
 * 这里显式读 `path.txt` + 手工拼绝对路径，避免 Playwright 触发 electron 二进制下载。
 */
export function resolveElectronExecutable(): string {
  const pkgElectronDir = resolve(
    repoRoot(),
    'packages',
    'electron',
    'node_modules',
    'electron',
  );
  const pathTxt = resolve(pkgElectronDir, 'path.txt');
  if (!existsSync(pathTxt)) {
    throw new Error(
      `[e2e-headed] 找不到 packages/electron 的 electron 二进制描述: ${pathTxt}\n请先运行 pnpm install（该 workspace 声明 electron@25.9.8 为 devDependency）`,
    );
  }
  const relative = readFileSync(pathTxt, 'utf8').trim();
  const abs = resolve(pkgElectronDir, 'dist', relative);
  if (!existsSync(abs)) {
    throw new Error(
      `[e2e-headed] path.txt 指向的 electron 可执行文件不存在: ${abs}`,
    );
  }
  return abs;
}

/**
 * 启动 e2e-headed harness（测试专用主进程）。
 */
export async function launchHeadedApp(opts: HeadedLaunchOptions = {}): Promise<{
  app: ElectronApplication;
  page: Page | null;
}> {
  const mainPath = resolve(repoRoot(), 'e2e-headed', 'harness', 'main.cjs');
  const executablePath = resolveElectronExecutable();
  const args = [mainPath];
  if (opts.profile) args.push(`--profile=${opts.profile}`);
  if (opts.noWindow) args.push('--no-window');

  const app = await electron.launch({
    executablePath,
    args,
    cwd: repoRoot(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    timeout: 30_000,
  });

  let page: Page | null = null;
  if (!opts.noWindow) {
    page = await app.firstWindow({ timeout: 20_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof (globalThis as unknown as { aiIPC?: unknown }).aiIPC !== 'undefined',
      { timeout: 10_000 },
    );
  }

  return { app, page };
}

/**
 * Playwright fixture —— 每个 test 自己 launch，测试结束自动 close，
 * 避免 profile 间状态串联。
 */
export const test = base.extend<HeadedFixture>({
  app: async ({}, use) => {
    // 占位：真正使用时通过 launchHeaded 提供
    await use(null as unknown as ElectronApplication);
  },
  page: async ({}, use) => {
    await use(null as unknown as Page);
  },
  launchHeaded: async ({}, use, testInfo) => {
    let launched: { app: ElectronApplication; page: Page | null } | null = null;
    await use(async (opts) => {
      launched = await launchHeadedApp(opts);
      return launched;
    });
    if (launched) {
      try {
        await launched.app.close();
      } catch (err) {
        testInfo.attach('electron-close-error', {
          body: String((err as Error).message ?? err),
          contentType: 'text/plain',
        });
      }
    }
  },
});

export const expect = base.expect;
