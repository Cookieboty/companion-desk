import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

/**
 * E11 · 真实应用 · 气泡安全 + 工具栏
 * 1. 看板娘窗口带 CSP（script-src 'self'），内联脚本被拦截；
 * 2. AI 回复 / mascot:say 里的 HTML / 脚本在气泡里按字面显示，不执行、不生成元素；
 * 3. 工具栏：在角色旁的槽位、不与角色包围盒重叠、命中测试算它、更多菜单 / 收起 / 配色、
 *    窗口贴右侧屏幕边缘时翻到左侧、空闲自动隐藏。
 */
const XSS =
  '<img src=x onerror="window.__pwned=1">XSSMARK<script>window.__pwned=2</script><b>bold</b>';

const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const aiChatBuild = resolve(repoRoot(), 'packages', 'ai-chat', 'dist', 'index.html');
const shots = process.env.TOOLBAR_SHOTS;
const shot = (name: string) => (shots ? { path: join(shots, name) } : {});
const hasXdo = process.platform === 'linux' && spawnSync('xdotool', ['version']).status === 0;

type Rect = { left: number; right: number; top: number; bottom: number };

async function charBox(p: Page): Promise<Rect | null> {
  const k = await p.evaluate(() => document.documentElement.dataset.mascotBox ?? '');
  if (!k) return null;
  const [left, right, top, bottom] = k.split(',').map(Number) as [number, number, number, number];
  return { left, right, top, bottom };
}

test.describe('E11 · bubble security + toolbar', () => {
  let app: ElectronApplication | null = null;
  let server: Server | null = null;
  let userData = '';
  let dropFile = '';

  test.beforeAll(async () => {
    if (existsSync(aiChatBuild)) {
      execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')], {
        stdio: 'inherit',
      });
    }
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (d) => (raw += d));
      req.on('end', () => {
        const body = JSON.parse(raw || '{}') as { stream?: boolean };
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
          send({ choices: [{ index: 0, delta: { role: 'assistant', content: XSS } }] });
          send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
          res.end('data: [DONE]\n\n');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({ choices: [{ message: { content: XSS }, finish_reason: 'stop' }] }),
          );
        }
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    userData = mkdtempSync(join(tmpdir(), 'e11-userdata-'));
    dropFile = join(mkdtempSync(join(tmpdir(), 'e11-work-')), 'notes.md');
    writeFileSync(dropFile, '# notes\n\nhello\n');
    if (shots) mkdirSync(shots, { recursive: true });
  });

  test.afterAll(async () => {
    if (app) {
      const proc = app.process();
      await Promise.race([
        app.close().catch(() => undefined),
        new Promise((r) => setTimeout(r, 5_000)),
      ]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }
    await new Promise((r) => server?.close(r));
    rmSync(userData, { recursive: true, force: true });
  });

  test('CSP + escaped bubble + toolbar gutter / menu / flip / auto-hide', async () => {
    test.skip(!existsSync(mainJs) || !existsSync(aiChatBuild), '需要先 pnpm build');
    test.setTimeout(180_000);
    const port = (server!.address() as AddressInfo).port;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      DEEPSEEK_API_KEY: 'sk-mock',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}/v1`,
      DEEPSEEK_MODEL: 'mock-model',
      IG_DSH_CORE: 'off',
    };
    delete env.NODE_ENV;
    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [electronPkgDir, `--user-data-dir=${userData}`, '--enable-unsafe-swiftshader'],
      cwd: electronPkgDir,
      env,
      timeout: 30_000,
    });
    const main = await app.firstWindow({ timeout: 20_000 });
    await main.waitForFunction(() => 'electronAPI' in window, undefined, { timeout: 20_000 });
    await main
      .waitForFunction(() => document.documentElement.dataset.mascotBackend === 'vrm', undefined, {
        timeout: 60_000,
      })
      .catch(() => undefined);

    // ---- 1. CSP ----
    const csp = await main.evaluate(
      () =>
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? '',
    );
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).toContain("object-src 'none'");
    const inline = await main.evaluate(async () => {
      let violations = 0;
      document.addEventListener('securitypolicyviolation', () => (violations += 1));
      const s = document.createElement('script');
      s.textContent = 'window.__cspInline = 1';
      document.head.appendChild(s);
      await new Promise((r) => setTimeout(r, 200));
      return { ran: (window as unknown as { __cspInline?: number }).__cspInline, violations };
    });
    expect(inline.ran).toBeUndefined();
    expect(inline.violations).toBeGreaterThan(0);

    const pwned = (p: Page) =>
      p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned ?? null);
    const bubble = main.locator('[data-testid="mascot-bubble"]');

    // ---- 2a. 任意路由（mascot:say：提示 / 工具结果 / 摘要都走这里）----
    await main.evaluate(
      (t) => window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: t, ms: 8000 } })),
      XSS,
    );
    await expect(bubble).toContainText('XSSMARK');
    await expect(bubble).toContainText('<script>window.__pwned=2</script>');
    await expect(bubble).toContainText('<img src=x onerror=');
    expect(await bubble.locator('img, script, b').count()).toBe(0);
    await main.waitForTimeout(400);
    expect(await pwned(main)).toBeNull();
    await main.screenshot(shot('20-bubble-xss-as-text.png'));

    // ---- 2b. 真实 AI 回复（mock 模型返回 HTML）----
    const chatWindow = app.waitForEvent('window', { timeout: 20_000 });
    await main.evaluate(() =>
      (
        window as unknown as { electronAPI: { openAiChat(): Promise<unknown> } }
      ).electronAPI.openAiChat(),
    );
    const chat = await chatWindow;
    await chat.waitForSelector('textarea', { timeout: 20_000 });
    await main.evaluate(() =>
      window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: '·', ms: 50 } })),
    );
    await chat.fill('textarea', 'hello');
    await chat.press('textarea', 'Enter');
    await expect(chat.locator('body')).toContainText('XSSMARK', { timeout: 30_000 });
    expect(await pwned(chat)).toBeNull();
    // 对话窗口同样按文本渲染（不生成 onerror 图片）
    expect(await chat.locator('img[src="x"]').count()).toBe(0);
    await chat.close().catch(() => undefined);

    // ---- 2c. 模型输出 → 气泡的真实路由：把文件拖到看板娘身上，摘要（mock 返回 HTML）显示在气泡 ----
    await main.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'e11-file';
      input.style.display = 'none';
      document.body.appendChild(input);
    });
    await main.setInputFiles('#e11-file', dropFile);
    await main.evaluate(() => {
      const file = (document.getElementById('e11-file') as HTMLInputElement).files![0]!;
      const dt = new DataTransfer();
      dt.items.add(file);
      const stage = document.getElementById('mascot-canvas')!;
      const r = stage.getBoundingClientRect();
      stage.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }),
      );
    });
    await expect(bubble).toContainText('XSSMARK', { timeout: 20_000 });
    await expect(bubble).toContainText('<script>');
    expect(await bubble.locator('img, script, b').count()).toBe(0);
    await main.waitForTimeout(400);
    expect(await pwned(main)).toBeNull();
    await main.screenshot(shot('21-bubble-ai-summary-as-text.png'));

    // ---- 3. 工具栏 ----
    const reveal = () =>
      app!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('window-mouse-enter')),
      );
    await main.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('mascot:say', { detail: { text: '今天也要加油哦～', ms: 60000 } }),
      ),
    );
    await reveal();
    const bar = main.locator('[data-testid="mascot-toolbar"]');
    await expect(bar).toBeVisible();
    await main.waitForTimeout(800);
    for (const id of [
      'ai-chat',
      'switch-model',
      'motion',
      'voice-settings',
      'toggle-top',
      'more',
    ]) {
      await expect(main.locator(`[data-testid="tool-${id}"]`)).toBeVisible();
    }
    await main.screenshot(shot('01-toolbar-calm.png'));

    // 不与角色包围盒重叠
    const box = await charBox(main);
    const r = await bar.boundingBox();
    expect(r).not.toBeNull();
    if (box) {
      const overlapX = Math.min(r!.x + r!.width, box.right) - Math.max(r!.x, box.left);
      expect(overlapX).toBeLessThanOrEqual(0);
    }
    // 命中测试：每个按钮中心点的最上层元素就是按钮本身（不被画布 / 气泡盖住）
    const covered = await main.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="mascot-toolbar"] button')]
        .filter((b) => {
          const q = b.getBoundingClientRect();
          const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return !(el && b.contains(el));
        })
        .map((b) => b.dataset.testid),
    );
    expect(covered).toEqual([]);
    expect(await bar.getAttribute('data-mascot-ui')).toBe('');

    // tooltip（@ig-live/ui）+ 键盘焦点环
    await main.locator('[data-testid="tool-ai-chat"]').hover();
    await main.waitForTimeout(300);
    await expect(main.locator('[role="tooltip"]', { hasText: 'AI 对话' })).toBeVisible();
    await main.screenshot(shot('02-toolbar-tooltip.png'));
    await main.locator('[data-testid="tool-switch-model"]').focus();
    await main.keyboard.press('Tab');
    await main.waitForTimeout(200);
    await main.screenshot(shot('03-toolbar-focus-ring.png'));

    // 更多菜单 + 配色
    await main.click('[data-testid="tool-more"]');
    const menu = main.locator('[data-testid="toolbar-menu"]');
    await expect(menu).toBeVisible();
    for (const id of ['info', 'tts-config', 'voice-mode-toggle', 'cursor-mcp', 'quit']) {
      await expect(menu.locator(`[data-testid="tool-${id}"]`)).toBeVisible();
    }
    await main.screenshot(shot('04-toolbar-more-menu.png'));
    for (const p of ['light', 'warm']) {
      await main.click(`[data-testid="toolbar-palette-${p}"]`);
      await expect(bar).toHaveAttribute('data-palette', p);
      await main.waitForTimeout(250);
      await main.screenshot(shot(`05-toolbar-palette-${p}.png`));
    }
    await main.click('[data-testid="toolbar-palette-calm"]');

    // 收起为单个「更多」按钮
    await main.click('[data-testid="toolbar-compact"]');
    await main.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(bar.locator('[data-testid="tool-ai-chat"]')).toHaveCount(0);
    await expect(main.locator('[data-testid="tool-more"]')).toBeVisible();
    await main.waitForTimeout(250);
    await main.screenshot(shot('06-toolbar-compact.png'));
    await main.click('[data-testid="tool-more"]');
    await expect(menu.locator('[data-testid="tool-ai-chat"]')).toBeVisible();
    await main.click('[data-testid="toolbar-compact"]');
    await main.keyboard.press('Escape');
    await expect(bar.locator('[data-testid="tool-ai-chat"]')).toBeVisible();

    // 贴近右侧屏幕边缘 → 翻到左侧
    expect(await main.evaluate(() => document.documentElement.dataset.toolbarSide)).toBe('right');
    // 用拖拽把角色拖到屏幕最右（物理会把她卡在屏幕内，但窗口右侧槽位已在屏幕外）
    await main.evaluate(async () => {
      const api = (
        window as unknown as {
          electronAPI: {
            mascotWindow: {
              dragStart(x: number, y: number): void;
              dragMove(x: number, y: number): void;
              dragEnd(): void;
            };
          };
        }
      ).electronAPI.mascotWindow;
      const gx = window.screenX + window.innerWidth / 2;
      const gy = window.screenY + window.innerHeight / 2;
      api.dragStart(gx, gy);
      for (let k = 1; k <= 20; k++) {
        api.dragMove(gx + k * 60, gy);
        await new Promise((r) => setTimeout(r, 30));
      }
      await new Promise((r) => setTimeout(r, 300));
      api.dragEnd();
    });
    await expect
      .poll(() => main.evaluate(() => document.documentElement.dataset.toolbarSide), {
        timeout: 8_000,
      })
      .toBe('left');
    await reveal();
    await main.waitForTimeout(500);
    await main.screenshot(shot('07-toolbar-flipped-left.png'));
    const r2 = await bar.boundingBox();
    const box2 = await charBox(main);
    if (box2) expect(r2!.x + r2!.width).toBeLessThanOrEqual(box2.left + 1);

    // 空闲自动隐藏（需要能把真实光标移出窗口）
    if (hasXdo) {
      execFileSync('xdotool', ['mousemove', '0', '0']);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('window-mouse-leave')),
      );
      await expect
        .poll(() => main.evaluate(() => document.documentElement.dataset.toolbarVisible), {
          timeout: 6_000,
        })
        .toBe('0');
      expect(await bar.getAttribute('data-mascot-ui')).toBeNull();
    }
  });
});
