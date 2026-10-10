import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { repoRoot, resolveElectronExecutable } from '../fixtures/electronApp';
import { safeRm } from '../fixtures/fsutil';
import { startMockLlm, type MockLlm, type MockProtocol } from '../fixtures/mockLlm';

/**
 * E7 · 真实应用 · 供应商（cc-switch 语义，三种通用协议）
 *
 * 三个本地 mock：OpenAI Chat Completions / OpenAI Responses / Anthropic Messages。
 * - userData 预置 v1 格式的 ai-providers.json（backend + chat 路由）→ 启动后迁移为 v2；
 * - 面板：添加供应商（搜索 + 分类）→ 自定义配置 → 选协议 → 获取模型 → 选默认 → 测速 → 保存；
 * - 工具栏一键切换供应商 / 模型 → 下一条请求的 path / model / 鉴权头都对（无需重启）；
 * - 渲染进程状态与磁盘文件里没有明文 key。
 */
const electronPkgDir = resolve(repoRoot(), 'packages', 'electron');
const mainJs = resolve(electronPkgDir, 'dist', 'main.js');
const aiChatBuild = resolve(repoRoot(), 'packages', 'ai-chat', 'dist', 'index.html');
const shotDir =
  process.env.PROVIDERS_SHOT_DIR ??
  process.env.E2E_SCREENSHOT_DIR ??
  resolve(repoRoot(), 'test-results', 'screenshots');

interface Spec {
  protocol: MockProtocol;
  name: string;
  key: string;
  models: string[];
  /** 表单里填的 API 请求地址（Anthropic 习惯不带 /v1） */
  base: (port: number) => string;
  endpoint: string;
}

const SPECS: Spec[] = [
  {
    protocol: 'openai-chat',
    name: 'Mock Chat',
    key: 'sk-chat-0123456789abcd',
    models: ['chat-small', 'chat-large'],
    base: (p) => `http://127.0.0.1:${p}/v1`,
    endpoint: '/v1/chat/completions',
  },
  {
    protocol: 'openai-responses',
    name: 'Mock Responses',
    key: 'sk-resp-0123456789wxyz',
    models: ['resp-mini', 'resp-pro'],
    base: (p) => `http://127.0.0.1:${p}/v1`,
    endpoint: '/v1/responses',
  },
  {
    protocol: 'anthropic',
    name: 'Mock Anthropic',
    key: 'sk-ant-0123456789qrst',
    models: ['claude-a', 'claude-b'],
    base: (p) => `http://127.0.0.1:${p}`,
    endpoint: '/v1/messages',
  },
];

test.describe('E7 · real app · providers (3 protocols)', () => {
  let app: ElectronApplication | null = null;
  const mocks: MockLlm[] = [];
  let legacy: MockLlm;
  let userData = '';

  test.beforeAll(async () => {
    if (existsSync(aiChatBuild)) {
      execFileSync(process.execPath, [resolve(electronPkgDir, 'scripts', 'copy-renderer.js')], {
        stdio: 'inherit',
      });
    }
    for (const s of SPECS) mocks.push(await startMockLlm(s.name, s.protocol, s.models));
    legacy = await startMockLlm('Legacy', 'openai-chat', ['legacy-1']);
    userData = mkdtempSync(join(tmpdir(), 'e7-userdata-'));
    mkdirSync(shotDir, { recursive: true });
    // v1 store：旧的 backend 字段 + chat 路由（迁移后应变成「当前 provider + 模型」）
    writeFileSync(
      join(userData, 'ai-providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'p-custom-legacy1',
            presetId: 'custom',
            name: 'Legacy v1',
            backend: 'openai-compatible',
            baseURL: `http://127.0.0.1:${legacy.port}/v1`,
            defaultModel: 'legacy-0',
            enabled: true,
            keys: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        routes: { chat: { providerId: 'p-custom-legacy1', model: 'legacy-1' } },
        usage: {},
      }),
    );
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
    for (const m of [...mocks, legacy]) await m?.close();
    safeRm(userData);
  });

  test('migrate v1, add 3 protocols via panel, fetch models, switch provider + model', async () => {
    test.setTimeout(240_000);
    test.skip(!existsSync(mainJs) || !existsSync(aiChatBuild), '需要先 pnpm build');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      IG_DSH_CORE: 'off',
    };
    delete env.NODE_ENV;
    for (const k of Object.keys(env)) {
      if (
        /^(DEEPSEEK|OPENAI|ANTHROPIC|CLAUDE|GOOGLE_GENERATIVE_AI|GEMINI|OLLAMA)_/.test(k) ||
        k === 'COMPANION_PROVIDER'
      )
        delete env[k];
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
      );
      const chatWindow = app.waitForEvent('window', { timeout: 20_000 });
      await main.evaluate(() =>
        (
          window as unknown as { electronAPI: { openAiChat(): Promise<unknown> } }
        ).electronAPI.openAiChat(),
      );
      const chat: Page = await chatWindow;
      await chat.setViewportSize({ width: 1100, height: 860 }).catch(() => undefined);
      await chat.waitForSelector('[data-testid="open-provider-panel"]', { timeout: 20_000 });

      type St = {
        providers: Array<{
          id: string;
          name: string;
          protocol: string;
          defaultModel: string;
          models: string[];
        }>;
        effectiveProviderId?: string;
        effectiveModel?: string;
        routes: Record<string, unknown>;
      };
      const state = () =>
        chat.evaluate(
          async () =>
            (await (
              window as unknown as { aiIPC: { invoke(c: string): Promise<unknown> } }
            ).aiIPC.invoke('ai:providers:state')) as St,
        );

      // ---- 迁移：v1 backend → v2 protocol；chat 路由 → 当前 provider + 模型
      const s0 = await state();
      expect(s0.providers[0]).toMatchObject({
        name: 'Legacy v1',
        protocol: 'openai-chat',
        defaultModel: 'legacy-1',
      });
      expect(s0.effectiveProviderId).toBe('p-custom-legacy1');
      expect(s0.routes.chat).toBeUndefined();
      expect(existsSync(join(userData, 'ai-providers.json.v1.bak'))).toBe(true);

      const send = async (text: string, answer: string) => {
        await chat.fill('textarea', text, { timeout: 60_000 });
        await chat.press('textarea', 'Enter');
        await chat.waitForFunction((a) => document.body.innerText.includes(a), answer, {
          timeout: 20_000,
        });
      };
      await send('hi legacy', 'reply-from-Legacy:legacy-1');

      // ---- 面板：添加三个供应商
      await chat.click('[data-testid="open-provider-panel"]');
      const panel = chat.locator('[data-testid="provider-panel"]');
      await expect(panel).toBeVisible();
      await chat.screenshot({ path: join(shotDir, '01-provider-list-migrated.png') });

      for (const [i, spec] of SPECS.entries()) {
        const mock = mocks[i]!;
        await chat.click('[data-testid="add-provider-btn"]');
        await expect(chat.locator('[data-testid="add-provider"]')).toBeVisible();
        if (i === 0) {
          await chat.screenshot({ path: join(shotDir, '02-add-provider.png') });
          await chat.fill('[data-testid="preset-search"]', '智谱');
          await expect(chat.locator('[data-testid="preset-zhipu"]')).toBeVisible();
          await expect(chat.locator('[data-testid="preset-openrouter"]')).toHaveCount(0);
          await chat.screenshot({ path: join(shotDir, '03-add-provider-search.png') });
          await chat.fill('[data-testid="preset-search"]', '');
        }
        await chat.click('[data-testid="preset-custom"]');
        await expect(chat.locator('[data-testid="provider-editor"]')).toBeVisible();
        await expect(chat.locator('[data-testid="local-only-notice"]')).toContainText(
          '此 Token 仅保存在本地设备',
        );
        await chat.fill('[data-testid="draft-name"]', spec.name);
        await chat.fill('[data-testid="draft-key"]', spec.key);
        await chat.fill('[data-testid="draft-baseurl"]', spec.base(mock.port));
        await chat.click('[data-testid="advanced-toggle"]');
        await chat.selectOption('[data-testid="draft-protocol"]', spec.protocol);
        await expect(chat.locator('[data-testid="endpoint-preview"]')).toContainText(
          `http://127.0.0.1:${mock.port}${spec.endpoint}`,
        );
        // 获取模型
        await chat.click('[data-testid="fetch-models"]');
        await expect(chat.locator('[data-testid="fetch-ok"]')).toContainText(
          `${spec.models.length} 个模型`,
        );
        const list = mock.seen.find((r) => r.method === 'GET');
        expect(list?.path).toBe('/v1/models');
        if (spec.protocol === 'anthropic') {
          expect(list).toMatchObject({ apiKey: spec.key, anthropicVersion: '2023-06-01' });
        } else {
          expect(list?.auth).toBe(`Bearer ${spec.key}`);
        }
        // 两个都启用，第一个设为默认
        for (const m of spec.models) {
          const box = chat.locator(`[data-testid="model-row-${m}"] input[type="checkbox"]`);
          if (!(await box.isChecked())) await box.check();
        }
        const setDefault = chat.locator(`[data-testid="model-default-${spec.models[0]}"]`);
        if (await setDefault.count()) await setDefault.click();
        await expect(chat.locator('[data-testid="draft-model"]')).toHaveValue(spec.models[0]!);
        // 测速
        await chat.click('[data-testid="draft-test"]');
        await expect(chat.locator('[data-testid="test-ok"]')).toBeVisible({ timeout: 15_000 });
        const ping = mock.seen.find((r) => r.ping);
        expect(ping).toMatchObject({ path: spec.endpoint, model: spec.models[0] });
        if (i === 0)
          await chat.screenshot({
            path: join(shotDir, '04-editor-fetched-models.png'),
            fullPage: true,
          });
        if (i === 2) {
          await chat.locator('[data-testid="model-map"]').scrollIntoViewIfNeeded();
          await chat.screenshot({ path: join(shotDir, '05-editor-advanced-anthropic.png') });
        }
        await chat.click(
          i === 0 ? '[data-testid="draft-save-activate"]' : '[data-testid="draft-save"]',
        );
        await expect(chat.locator('[data-testid="provider-editor"]')).toHaveCount(0);
      }
      await expect(chat.locator('[data-testid^="provider-card-"]')).toHaveCount(4);
      await expect(chat.locator('[data-testid="masked-key"]')).toHaveCount(0); // 列表只显示掩码摘要
      const s1 = await state();
      const ids = SPECS.map((sp) => s1.providers.find((p) => p.name === sp.name)!.id);
      expect(s1.effectiveProviderId).toBe(ids[0]);
      await chat.screenshot({ path: join(shotDir, '06-provider-list.png') });

      // 编辑正在使用的供应商：提示「保存后立即生效」
      await chat.click(`[data-testid="edit-${ids[0]}"]`);
      await expect(chat.locator('[data-testid="active-edit-notice"]')).toContainText(
        '保存后立即生效',
      );
      await chat.screenshot({ path: join(shotDir, '07-edit-active.png') });
      await chat.click('[data-testid="editor-back"]');

      // 渲染进程拿到的数据里没有明文 key
      const json = JSON.stringify(await state());
      for (const sp of SPECS) expect(json).not.toContain(sp.key);
      await chat.click('[aria-label="关闭"]');

      // ---- 工具栏：切换供应商 + 模型，下一条请求就用它（path / model / 鉴权都对）
      for (const [i, spec] of SPECS.entries()) {
        const mock = mocks[i]!;
        await chat.selectOption('[data-testid="provider-switch"]', ids[i]!);
        await expect(chat.locator('[data-testid="model-switch"]')).toHaveValue(spec.models[0]!);
        for (const model of [spec.models[0]!, spec.models[1]!]) {
          await chat.selectOption('[data-testid="model-switch"]', model);
          await expect(chat.locator('[data-testid="model-switch"]')).toHaveValue(model);
          await send(`hello ${spec.name} ${model}`, `reply-from-${spec.name}:${model}`);
          const last = mock.seen.filter((r) => r.method === 'POST' && !r.ping).at(-1)!;
          expect(last).toMatchObject({ path: spec.endpoint, model });
          if (spec.protocol === 'anthropic') expect(last.apiKey).toBe(spec.key);
          else expect(last.auth).toBe(`Bearer ${spec.key}`);
        }
        if (i === 1) await chat.screenshot({ path: join(shotDir, '08-toolbar-switch.png') });
        if (i === 1) {
          // 自绘下拉框：分组 + 品牌图标 + 选中勾选，键盘 Esc 关闭
          const combos = chat.locator('[data-testid="provider-switcher"] [role="combobox"]');
          await combos.nth(0).click();
          const listbox = chat.locator('[role="listbox"]');
          await expect(listbox).toBeVisible();
          await expect(listbox.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
          await expect(listbox.locator('.cd-dropdown__group').first()).toBeVisible();
          await chat.waitForTimeout(250);
          await chat.screenshot({ path: join(shotDir, '09-provider-dropdown.png') });
          await chat.keyboard.press('Escape');
          await expect(listbox).toHaveCount(0);
          await combos.nth(1).click();
          await expect(listbox).toBeVisible();
          await chat.waitForTimeout(250);
          await chat.screenshot({ path: join(shotDir, '10-model-dropdown.png') });
          await chat.keyboard.press('Escape');
        }
      }
      const s2 = await state();
      expect(s2.effectiveProviderId).toBe(ids[2]);
      expect(s2.effectiveModel).toBe(SPECS[2]!.models[1]);

      // 磁盘上没有明文 key
      const file = readFileSync(join(userData, 'ai-providers.json'), 'utf8');
      for (const sp of SPECS) expect(file).not.toContain(sp.key);
    } catch (e) {
      console.warn(`[E7] failed\n${diag.slice(-80).join('\n')}`);
      throw e;
    }
  });
});
