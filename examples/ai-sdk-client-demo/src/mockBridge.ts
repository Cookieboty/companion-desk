/**
 * mockBridge —— 让 demo 在纯浏览器里也能跑：把 ClientAIClient 需要的
 * `window.aiIPC` 用一份 in-memory 实现挂上，模拟主进程 IPC 通道。
 *
 * 生产环境应改用 [`mkAiPreload`](../../packages/ai-sdk-client/src/preload/mkAiPreload.ts)
 * 在 Electron preload 里挂载 —— 此文件仅供 demo。
 */

import type { IPCBridge, IpcEventListener, IpcUnsubscribe } from '@ig-live/ai-sdk-client';

type Handler = (...args: unknown[]) => unknown | Promise<unknown>;

interface MockOptions {
  /** 模拟 stream chunk 的间隔，默认 60ms */
  streamIntervalMs?: number;
}

export function installMockBridge(opts: MockOptions = {}): IPCBridge {
  const streamIntervalMs = opts.streamIntervalMs ?? 60;
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Set<IpcEventListener>>();

  const emit = (channel: string, payload: unknown) => {
    const bucket = listeners.get(channel);
    if (!bucket) return;
    for (const fn of [...bucket]) fn(payload);
  };

  // ------- 通用 sync/return 通道 -------
  handlers.set('ai:sessions:list', () => [
    { id: 'demo-1', name: 'demo session', createdAt: Date.now() },
  ]);
  handlers.set('ai:tools:list', () => [{ name: 'time_now', description: 'get now (demo)' }]);
  handlers.set('ai:tools:confirm', () => ({ ok: true }));
  handlers.set('ai:tools:setEnabled', () => ({ ok: true }));
  handlers.set('ai:asr:list', () => []);
  handlers.set('ai:tts:list', () => ['mock-voice']);
  handlers.set('ai:tts:listVoices', () => ['mock-voice']);
  handlers.set('ai:facts:list', () => []);
  handlers.set('ai:summaries:get', () => ({ text: '' }));
  handlers.set('ai:live2d:isAvailable', () => true);

  // ------- userProfile 通道 -------
  const profile: Record<string, unknown> = {
    id: 'demo-user',
    nickname: 'nya',
    language: 'zh-CN',
  };
  handlers.set('ai:userProfile:get', () => profile);
  handlers.set('ai:userProfile:set', (patch) => {
    Object.assign(profile, patch as object);
    // 广播 changed 事件
    setTimeout(
      () => emit('ai:event', { evt: 'userProfile:changed', data: { profile: { ...profile } } }),
      0,
    );
    return { ...profile };
  });
  handlers.set('ai:userProfile:reset', () => {
    for (const k of Object.keys(profile)) delete profile[k];
    Object.assign(profile, { id: 'demo-user', nickname: 'nya', language: 'zh-CN' });
    setTimeout(
      () => emit('ai:event', { evt: 'userProfile:changed', data: { profile: { ...profile } } }),
      0,
    );
    return { ...profile };
  });

  // ------- chat.stream 模拟 -------
  handlers.set('ai:chat:stream', async (opts) => {
    const o = opts as { reqId?: string; messages?: Array<{ content: string }> };
    const reqId = o?.reqId ?? `req_${Date.now().toString(36)}`;
    const text = o?.messages?.[o.messages.length - 1]?.content ?? '';
    const chunks = mockAssistantReply(text);
    let i = 0;
    const timer = window.setInterval(() => {
      if (i >= chunks.length) {
        window.clearInterval(timer);
        emit('ai:chat:stream:chunk', { reqId, done: true });
        // 演示 agent:step 事件
        emit('ai:event', {
          evt: 'agent:step',
          data: { sessionId: 'demo-1', step: 1, reason: 'llm-call' },
        });
        return;
      }
      emit('ai:chat:stream:chunk', {
        reqId,
        done: false,
        value: { deltaText: chunks[i] },
      });
      i += 1;
    }, streamIntervalMs);
    return { ok: true, reqId };
  });
  handlers.set('ai:chat:abort', () => undefined);

  // ------- tts.stream 模拟（发送 chunk 事件，附带 rms） -------
  handlers.set('ai:tts:stream', async (opts) => {
    const o = opts as { reqId?: string; text?: string };
    const reqId = o?.reqId ?? `req_${Date.now().toString(36)}`;
    const totalChunks = Math.max(4, Math.min(24, (o?.text ?? '').length));
    let i = 0;
    const timer = window.setInterval(() => {
      if (i >= totalChunks) {
        window.clearInterval(timer);
        emit('ai:tts:stream:chunk', { reqId, done: true });
        emit('ai:event', { evt: 'tts:end', data: { reqId } });
        return;
      }
      const rms = 0.35 + 0.5 * Math.abs(Math.sin(i * 0.6));
      emit('ai:tts:stream:chunk', { reqId, done: false, value: { rms } });
      emit('ai:event', { evt: 'tts:chunk', data: { reqId, rms } });
      i += 1;
    }, 80);
    return { ok: true, reqId };
  });
  handlers.set('ai:tts:stop', () => undefined);

  const bridge: IPCBridge = {
    invoke: async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`[mockBridge] no handler for ${channel}`);
      return (await fn(...args)) as T;
    },
    on: <T = unknown>(channel: string, fn: IpcEventListener<T>): IpcUnsubscribe => {
      let bucket = listeners.get(channel);
      if (!bucket) {
        bucket = new Set();
        listeners.set(channel, bucket);
      }
      bucket.add(fn as IpcEventListener);
      return () => bucket?.delete(fn as IpcEventListener);
    },
    off: <T = unknown>(channel: string, fn: IpcEventListener<T>): void => {
      listeners.get(channel)?.delete(fn as IpcEventListener);
    },
  };

  (globalThis as unknown as Record<string, unknown>).aiIPC = bridge;

  // 便于调试：允许业务侧手动触发一次 tool:confirm-required
  (globalThis as unknown as Record<string, unknown>).__demoEmitConfirm = () =>
    emit('ai:event', {
      evt: 'tool:confirm-required',
      data: {
        reqId: `c_${Date.now().toString(36)}`,
        toolName: 'fs.write',
        argumentsJson: '{"path":"./demo.txt"}',
        createdAt: Date.now(),
      },
    });

  return bridge;
}

function mockAssistantReply(userText: string): string[] {
  const base = userText.trim() ? `收到「${userText}」，` : '（空消息）';
  const tail = 'demo 使用 mockBridge 生成的流式内容。 ';
  return (base + tail).match(/.{1,2}/g) ?? [tail];
}
