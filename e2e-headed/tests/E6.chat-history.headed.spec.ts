import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';

/**
 * E6 · 真实应用 · AI 对话多轮上下文
 *
 * 启动 dist/main.js，DeepSeek provider 指向本地 mock OpenAI 兼容服务，
 * 在 AI 对话窗口里连续发送两条消息，断言：
 * - 第二次请求携带 system prompt + 第一轮 user/assistant；
 * - 「新对话」后的请求不再携带旧会话内容；
 * - 快捷按钮（非流式 sendMessage）之后的追问同样带上下文。
 */
interface MockBody {
  model: string;
  stream: boolean;
  messages: Array<{ role: string; content: string }>;
}

const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const aiChatBuild = resolve(repoRoot(), 'packages', 'ai-chat', 'dist', 'index.html');

test.describe('E6 · real app · AI chat history', () => {
  let app: ElectronApplication | null = null;
  let server: Server | null = null;
  let userData = '';
  const requests: MockBody[] = [];

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
        const body = JSON.parse(raw || '{}') as MockBody;
        requests.push(body);
        const text = `answer${requests.length}`;
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
          );
          res.end('data: [DONE]\n\n');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }),
          );
        }
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    userData = mkdtempSync(join(tmpdir(), 'e6-userdata-'));
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

  test('second request carries prior turns; new conversation starts fresh', async () => {
    test.skip(!existsSync(mainJs) || !existsSync(aiChatBuild), '需要先 pnpm build');

    const port = (server!.address() as AddressInfo).port;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      DEEPSEEK_API_KEY: 'sk-mock',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}/v1`,
      DEEPSEEK_MODEL: 'mock-model',
      IG_DSH_CORE: 'off', // 只测 ig 宿主 + provider 链路，加快启动
    };
    delete env.NODE_ENV;

    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [electronPkgDir, `--user-data-dir=${userData}`],
      cwd: electronPkgDir,
      env,
      timeout: 30_000,
    });
    // 收集主进程输出与页面 console，失败时打印，便于定位 CI 环境差异
    const diag: string[] = [];
    app.process().stdout?.on('data', (d: Buffer) => diag.push(`[stdout] ${String(d).trim()}`));
    app.process().stderr?.on('data', (d: Buffer) => diag.push(`[stderr] ${String(d).trim()}`));
    app.on('window', (w) => {
      diag.push(`[window] ${w.url()}`);
      w.on('console', (m) => diag.push(`[console:${m.type()}] ${m.text()}`));
      w.on('pageerror', (e) => diag.push(`[pageerror] ${e.message}`));
    });
    const main = await app.firstWindow({ timeout: 20_000 });
    try {
      await main.waitForFunction(
        () => typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined',
        undefined,
        { timeout: 30_000 },
      );
    } catch (err) {
      const urls = app.windows().map((w) => w.url());
      console.error(
        `[E6] electronAPI missing; windows=${JSON.stringify(urls)}\n${diag.join('\n')}`,
      );
      throw err;
    }

    const chatWindow = app.waitForEvent('window', { timeout: 20_000 });
    await main.evaluate(() =>
      (
        window as unknown as { electronAPI: { openAiChat(): Promise<unknown> } }
      ).electronAPI.openAiChat(),
    );
    const chat: Page = await chatWindow;
    await chat.waitForSelector('textarea', { timeout: 20_000 });

    const send = async (text: string, answer: string) => {
      await chat.fill('textarea', text);
      await chat.press('textarea', 'Enter');
      await chat.waitForFunction((a) => document.body.innerText.includes(a), answer, {
        timeout: 15_000,
      });
    };

    await send('我叫小明，请记住', 'answer1');
    await send('我叫什么名字？', 'answer2');

    const second = requests[1]!;
    expect(second.model).toBe('mock-model');
    expect(second.stream).toBe(true);
    expect(second.messages[0]!.role).toBe('system');
    expect(second.messages.slice(1)).toEqual([
      { role: 'user', content: '我叫小明，请记住' },
      { role: 'assistant', content: 'answer1' },
      { role: 'user', content: '我叫什么名字？' },
    ]);

    // 新对话：不应再带上一会话内容；快捷按钮走非流式 sendMessage
    await chat.click('[title="开始新对话"]');
    await chat.click('text=打个招呼');
    await chat.waitForFunction(() => document.body.innerText.includes('answer3'));
    await send('继续', 'answer4');

    expect(requests[2]!.stream).toBe(false);
    expect(requests[2]!.messages.map((m) => m.content).join('|')).not.toContain('小明');
    expect(requests[3]!.messages.slice(1)).toEqual([
      { role: 'user', content: '你好，请介绍一下自己' },
      { role: 'assistant', content: 'answer3' },
      { role: 'user', content: '继续' },
    ]);
  });
});
