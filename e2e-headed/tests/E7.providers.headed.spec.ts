import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

/**
 * E7 · 真实应用 · 多 provider 配置面板
 *
 * 两个本地 mock OpenAI 兼容服务 A / B；不设任何 provider 环境变量：
 * - 面板：预设「自定义」→ 填 A 的 base URL / key / header → 测试 → 保存并设为当前；
 * - 对话请求打到 A（带正确的 Authorization 与自定义 header、模型）；
 * - 再添加 B，从工具栏一键切换到 B → 下一条请求打到 B（无需重启）；
 * - 渲染进程拿到的状态里没有明文 key；userData 文件里也没有明文 key。
 */
interface Seen {
  server: 'A' | 'B';
  path: string;
  auth?: string;
  org?: string;
  model: string;
  ping: boolean;
}

const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const aiChatBuild = resolve(repoRoot(), 'packages', 'ai-chat', 'dist', 'index.html');
const shotDir =
  process.env.E2E_SCREENSHOT_DIR ?? resolve(repoRoot(), 'test-results', 'screenshots');

const KEY_A = 'sk-alpha-0123456789abcd';
const KEY_B = 'sk-bravo-9876543210wxyz';

function mockServer(name: 'A' | 'B', seen: Seen[]): Server {
  return createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as {
        model: string;
        stream?: boolean;
        messages: Array<{ content: string }>;
      };
      const h: IncomingHttpHeaders = req.headers;
      const ping = body.messages?.at(-1)?.content === 'ping';
      seen.push({
        server: name,
        path: req.url ?? '',
        auth: h.authorization,
        org: h['x-org'] as string | undefined,
        model: body.model,
        ping,
      });
      const text = `reply-from-${name}`;
      const usage = { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 };
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: text }, finish_reason: 'stop' }],
            usage,
          }),
        );
      }
    });
  });
}

test.describe('E7 · real app · multi-provider panel', () => {
  let app: ElectronApplication | null = null;
  const servers: Server[] = [];
  let userData = '';
  const seen: Seen[] = [];

  test.beforeAll(async () => {
    if (existsSync(aiChatBuild)) {
      execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')], {
        stdio: 'inherit',
      });
    }
    for (const name of ['A', 'B'] as const) {
      const s = mockServer(name, seen);
      await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
      servers.push(s);
    }
    userData = mkdtempSync(join(tmpdir(), 'e7-userdata-'));
    mkdirSync(shotDir, { recursive: true });
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
    for (const s of servers) await new Promise((r) => s.close(r));
    rmSync(userData, { recursive: true, force: true });
  });

  test('configure via panel, chat hits A, one-click switch to B', async () => {
    test.skip(!existsSync(mainJs) || !existsSync(aiChatBuild), '需要先 pnpm build');
    const [portA, portB] = servers.map((s) => (s.address() as AddressInfo).port);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      IG_DSH_CORE: 'off',
    };
    delete env.NODE_ENV;
    for (const k of Object.keys(env)) {
      if (
        /^(DEEPSEEK|OPENAI|ANTHROPIC|CLAUDE|GOOGLE_GENERATIVE_AI|GEMINI)_/.test(k) ||
        k === 'COMPANION_PROVIDER'
      ) {
        delete env[k];
      }
    }

    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [electronPkgDir, `--user-data-dir=${userData}`],
      cwd: electronPkgDir,
      env,
      timeout: 30_000,
    });
    const diag: string[] = [];
    app.process().stdout?.on('data', (d: Buffer) => diag.push(`[stdout] ${String(d).trim()}`));
    app.process().stderr?.on('data', (d: Buffer) => diag.push(`[stderr] ${String(d).trim()}`));

    try {
      const main = await app.firstWindow({ timeout: 20_000 });
      await main.waitForFunction(
        () => typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined',
        undefined,
        { timeout: 20_000 },
      );
      const chatWindow = app.waitForEvent('window', { timeout: 20_000 });
      await main.evaluate(() =>
        (
          window as unknown as { electronAPI: { openAiChat(): Promise<unknown> } }
        ).electronAPI.openAiChat(),
      );
      const chat: Page = await chatWindow;
      await chat.setViewportSize({ width: 1000, height: 800 }).catch(() => undefined);
      await chat.waitForSelector('[data-testid="open-provider-panel"]', { timeout: 20_000 });

      // ---- 面板：自定义预设 → A
      await chat.click('[data-testid="open-provider-panel"]');
      const panel = chat.locator('[data-testid="provider-panel"]');
      await expect(panel).toBeVisible();
      await expect(chat.locator('[data-testid="local-only-notice"]')).toContainText(
        '此 Token 仅保存在本地设备，不会上传或同步',
      );
      await chat.selectOption('[data-testid="preset-select"]', 'custom');
      await chat.fill('[data-testid="draft-name"]', 'Mock Alpha');
      await chat.fill('[data-testid="draft-baseurl"]', `http://127.0.0.1:${portA}/v1`);
      await chat.fill('[data-testid="draft-model"]', 'model-a');
      await chat.fill('[data-testid="draft-key"]', KEY_A);
      await chat.fill('[data-testid="draft-headers"]', 'X-Org: alpha');
      await chat.click('[data-testid="draft-test"]');
      await expect(chat.locator('[data-testid="test-ok"]').first()).toBeVisible({
        timeout: 15_000,
      });
      await chat.screenshot({ path: join(shotDir, 'provider-panel-add.png') });
      await chat.click('[data-testid="draft-save-activate"]');
      await expect(chat.locator('[data-testid^="provider-card-"]')).toHaveCount(1);
      await expect(chat.locator('[data-testid="masked-key"]').first()).toHaveText('sk-…abcd');
      await expect(chat.locator('[data-testid="draft-key"]')).toHaveValue('');

      // 渲染进程可见的数据中没有明文 key
      const stateJson = await chat.evaluate(async () =>
        JSON.stringify(
          await (
            window as unknown as { aiIPC: { invoke(c: string): Promise<unknown> } }
          ).aiIPC.invoke('ai:providers:state'),
        ),
      );
      expect(stateJson).not.toContain(KEY_A);
      expect(await chat.content()).not.toContain(KEY_A);

      // ---- 对话 → A
      await chat.click('[aria-label="关闭"]');
      const send = async (text: string, answer: string) => {
        await chat.fill('textarea', text);
        await chat.press('textarea', 'Enter');
        await chat.waitForFunction((a) => document.body.innerText.includes(a), answer, {
          timeout: 15_000,
        });
      };
      await send('你好 A', 'reply-from-A');
      const chatA = seen.filter((s) => !s.ping);
      expect(chatA).toHaveLength(1);
      expect(chatA[0]).toMatchObject({
        server: 'A',
        path: '/v1/chat/completions',
        auth: `Bearer ${KEY_A}`,
        org: 'alpha',
        model: 'model-a',
      });

      // ---- 再加 B（只保存），工具栏一键切换
      await chat.click('[data-testid="open-provider-panel"]');
      await chat.selectOption('[data-testid="preset-select"]', 'custom');
      await chat.fill('[data-testid="draft-name"]', 'Mock Bravo');
      await chat.fill('[data-testid="draft-baseurl"]', `http://127.0.0.1:${portB}/v1`);
      await chat.fill('[data-testid="draft-model"]', 'model-b');
      await chat.fill('[data-testid="draft-key"]', KEY_B);
      await chat.click('[data-testid="draft-save"]');
      await expect(chat.locator('[data-testid^="provider-card-"]')).toHaveCount(2);
      await expect(chat.locator('[data-testid^="usage-"]').first()).toContainText('1 次请求');
      await chat.screenshot({ path: join(shotDir, 'provider-panel-list.png'), fullPage: true });
      await panel.locator('[data-testid="routes-table"]').scrollIntoViewIfNeeded();
      await chat.screenshot({ path: join(shotDir, 'provider-panel-routes.png') });
      await chat.click('[aria-label="关闭"]');

      const bravoId = await chat.evaluate(async () => {
        const s = (await (
          window as unknown as { aiIPC: { invoke(c: string): Promise<unknown> } }
        ).aiIPC.invoke('ai:providers:state')) as { providers: Array<{ id: string; name: string }> };
        return s.providers.find((p) => p.name === 'Mock Bravo')!.id;
      });
      await chat.selectOption('[data-testid="provider-switch"]', bravoId);
      await expect(chat.locator('[data-testid="provider-switch"]')).toHaveValue(bravoId);
      await chat.screenshot({ path: join(shotDir, 'provider-toolbar-switch.png') });
      await send('你好 B', 'reply-from-B');
      const last = seen.filter((s) => !s.ping).at(-1)!;
      expect(last).toMatchObject({ server: 'B', auth: `Bearer ${KEY_B}`, model: 'model-b' });

      // 磁盘上没有明文 key
      const file = readFileSync(join(userData, 'ai-providers.json'), 'utf8');
      expect(file).not.toContain(KEY_A);
      expect(file).not.toContain(KEY_B);
    } catch (e) {
      console.warn(`[E7] failed\n${diag.slice(-80).join('\n')}`);
      throw e;
    }
  });
});
