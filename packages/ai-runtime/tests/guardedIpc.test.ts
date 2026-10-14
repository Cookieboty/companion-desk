/**
 * createGuardedIpcAdapter —— sender 白名单守卫的放行 / 拒绝 / off 注销语义。
 */

import { describe, it, expect, vi } from 'vitest';

import { createGuardedIpcAdapter } from '../src/IpcAdapter';

import { createFakeIpcAdapter } from './helpers/fakeIpc';

describe('createGuardedIpcAdapter', () => {
  it('放行白名单 sender 的 handle 调用', async () => {
    const inner = createFakeIpcAdapter();
    const guarded = createGuardedIpcAdapter(inner, (e) => e.senderId === 1);
    const fn = vi.fn(async (_e: unknown, x: unknown) => `ok:${x}`);
    guarded.handle('ai:test', fn);

    await expect(inner.invoke(1, 'ai:test', 'a')).resolves.toBe('ok:a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('拒绝非白名单 sender，且不触达内部 handler', async () => {
    const inner = createFakeIpcAdapter();
    const guarded = createGuardedIpcAdapter(inner, (e) => e.senderId === 1);
    const fn = vi.fn(async () => 'ok');
    guarded.handle('ai:test', fn);

    await expect(inner.invoke(2, 'ai:test')).rejects.toThrow(/not allowed for ai:test/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('on/off 经同一包装引用正确注销', () => {
    const inner = createFakeIpcAdapter();
    const guarded = createGuardedIpcAdapter(inner, (e) => e.senderId === 1);
    const listener = vi.fn();
    guarded.on('ai:event', listener);

    inner.emitTo(1, 'ai:event', 'x');
    inner.emitTo(2, 'ai:event', 'y');
    expect(listener).toHaveBeenCalledTimes(1);

    guarded.off('ai:event', listener);
    inner.emitTo(1, 'ai:event', 'z');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
