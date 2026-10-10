import { test, expect } from '../fixtures/electronApp';

/**
 * E3 · mcp-headless profile · headed 复刻
 *
 * 语义对齐 e2e/tests/E3.mcp-headless-profile.test.ts：headless profile 场景下
 * 不打开窗口，只启 AIRuntime，验证：
 * 1. 主进程 stdout 打印 `AI runtime ready`；
 * 2. 通过 electronApp.evaluate 拿到主进程 `getChatCalls().length === 0`（Fake LLM 未被主动调用）。
 *
 * 注意：本用例不涉及 doctor CLI 子进程调用 —— 那部分已在 headless E3
 * 覆盖，此处只验证 Electron 主进程可在 `--no-window` 模式下正常启动 AIRuntime。
 */
test.describe('E3 · mcp-headless · Electron 主进程无窗口启动 AIRuntime', () => {
  test('--no-window 模式下 AI runtime 正常启动，chatCalls 为空', async ({ launchHeaded }) => {
    const { app, page } = await launchHeaded({ profile: 'mcp-headless', noWindow: true });
    expect(page, 'mcp-headless 不应打开窗口').toBeNull();

    const chatCallCount = await app.evaluate(() => {
      const probe = (globalThis as any).__aiE2eProbe;
      return probe.getChatCalls().length;
    });
    expect(chatCallCount).toBe(0);

    const profile = await app.evaluate(() => (globalThis as any).__aiE2eProbe.getProfile());
    expect(profile).toBeTruthy();
    expect(typeof profile).toBe('object');
  });
});
