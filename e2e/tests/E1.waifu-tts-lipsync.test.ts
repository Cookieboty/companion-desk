/**
 * E1 · waifu profile · headless smoke
 *
 * 语义对齐：
 * - 主进程侧真实构造 `AIClient` + `IPCTransportServer` + `EventBroadcaster`（无 Electron，
 *   IPC 走 FakeIpcAdapter；LLM/Tool/UserProfile seams 由 e2e/helpers/fakeSeams 提供）；
 * - 一个"waifu 主渲染窗口"通过 `ClientAIClient` 订阅 AI 事件；
 * - 触发 dsh `tts/chunk` → 渲染窗口收到 `tts:chunk`，其 `rms>0` 可驱动 `live2d.driveLipSync`；
 * - 触发 dsh `agent/turn-end`（等价于 P8-3 里的"turn 完成/消息完成"信号）→ 广播到全部窗口。
 *
 * 由于当前无法在 Electron 环境跑 Playwright，且 P8-8 计划里的 `message:complete` 事件
 * 未在 AIClient.bindDshBridges 中显式桥接（P9 会补上），此处用 `agent:turn-end` 作为
 * 语义等价的完成信号；详见 [P8-consumer-migration.md#P8-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile)。
 */

import { EVENT_BROADCAST_CHANNEL } from '@ig-live/ai-runtime';
import { ClientAIClient } from '@ig-live/ai-sdk-client';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { createE2eRuntime, type E2eRuntimeHandle } from '../helpers/e2eRuntime';
import { createFakeLive2dService } from '../helpers/fakeSeams';

describe('E1 · waifu · tts chunk → lip sync + turn 完成广播', () => {
  let handle: E2eRuntimeHandle;

  beforeEach(() => {
    handle = createE2eRuntime();
  });

  afterEach(() => {
    handle.dispose();
  });

  it('tts:chunk 广播到所有渲染窗口，rms > 0 可驱动 live2d.driveLipSync', async () => {
    const waifuMain = handle.createRendererClient({ id: 501 });
    const waifuOverlay = handle.createRendererClient({ id: 502 });
    const clientA = new ClientAIClient({ bridge: waifuMain.bridge });
    const clientB = new ClientAIClient({ bridge: waifuOverlay.bridge });

    const live2d = createFakeLive2dService();
    const chunkAtA: Array<{ rms: number }> = [];
    const chunkAtB: Array<{ rms: number }> = [];

    const offA = clientA.on('tts:chunk', (p) => {
      const payload = p as { rms?: number };
      if (typeof payload.rms === 'number') {
        live2d.driveLipSync(payload.rms);
        chunkAtA.push({ rms: payload.rms });
      }
    });
    const offB = clientB.on('tts:chunk', (p) => {
      const payload = p as { rms?: number };
      if (typeof payload.rms === 'number') chunkAtB.push({ rms: payload.rms });
    });

    await handle.ctx.triggerEvent('tts/chunk', {
      reqId: 'r-tts-1',
      seq: 0,
      mime: 'audio/mp3',
      data: new Uint8Array([0, 1]),
      rms: 0.65,
    });
    await handle.ctx.triggerEvent('tts/chunk', {
      reqId: 'r-tts-1',
      seq: 1,
      mime: 'audio/mp3',
      data: new Uint8Array([0, 1]),
      rms: 0.42,
      isFinal: true,
    });

    expect(chunkAtA).toEqual([{ rms: 0.65 }, { rms: 0.42 }]);
    expect(chunkAtB).toEqual([{ rms: 0.65 }, { rms: 0.42 }]);
    expect(live2d.driveLipSyncCalls).toEqual([0.65, 0.42]);
    expect(live2d.driveLipSyncCalls.every((v) => v > 0)).toBe(true);

    offA();
    offB();
    await clientA.dispose();
    await clientB.dispose();
  });

  it('agent/turn-end（等价 message-complete）被广播到所有 web contents', async () => {
    const waifuMain = handle.createRendererClient({ id: 511 });
    const waifuOverlay = handle.createRendererClient({ id: 512 });
    const client = new ClientAIClient({ bridge: waifuMain.bridge });
    const events: Array<unknown> = [];
    client.on('agent:turn-end', (p) => events.push(p));

    await handle.ctx.triggerEvent('agent/turn-end', {
      sessionId: 's-e1',
      turnId: 't-1',
      ok: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sessionId: 's-e1', turnId: 't-1', ok: true });

    for (const wc of [waifuMain.webContents, waifuOverlay.webContents]) {
      const broadcast = wc.sent.filter((m) => m.channel === EVENT_BROADCAST_CHANNEL);
      const turnEnd = broadcast.find(
        (m) => (m.payload as { evt: string }).evt === 'agent:turn-end',
      );
      expect(turnEnd, `wc#${wc.id} 缺少 agent:turn-end 广播`).toBeTruthy();
    }

    await client.dispose();
  });
});
