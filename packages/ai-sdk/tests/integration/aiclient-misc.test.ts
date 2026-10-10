/**
 * P5-7 单测 · Session/Asr/Tts/Live2d Facade 的错误路径与基础 CRUD。
 */

import { describe, expect, it } from 'vitest';

import { AIClient } from '../../src/AIClient';
import { createFakeSdkCtx } from '../helpers/fakeSdkCtx';

describe('SessionFacade (in-memory)', () => {
  it('create → get → list → rename → fork → delete', () => {
    const client = new AIClient(createFakeSdkCtx());
    const s = client.sessions.create({ title: 'first', agentPreset: 'waifu' });
    expect(client.sessions.get(s.id)?.title).toBe('first');
    expect(client.sessions.list()).toHaveLength(1);
    const renamed = client.sessions.rename(s.id, 'second');
    expect(renamed.title).toBe('second');
    const forked = client.sessions.fork(s.id);
    expect(forked.id).not.toBe(s.id);
    expect(forked.title).toBe('second (copy)');
    expect(client.sessions.list()).toHaveLength(2);
    expect(client.sessions.delete(s.id)).toBe(true);
    expect(client.sessions.list()).toHaveLength(1);
  });

  it('rename/fork on unknown session throws', () => {
    const client = new AIClient(createFakeSdkCtx());
    expect(() => client.sessions.rename('nope', 'x')).toThrow();
    expect(() => client.sessions.fork('nope')).toThrow();
  });
});

describe('AsrFacade / TtsFacade — seam not injected', () => {
  it('asr methods throw SEAM_NOT_INJECTED', () => {
    const client = new AIClient(createFakeSdkCtx());
    expect(() => client.asr.list()).toThrow(/SEAM_NOT_INJECTED/);
  });
  it('tts methods throw SEAM_NOT_INJECTED', () => {
    const client = new AIClient(createFakeSdkCtx());
    expect(() => client.tts.list()).toThrow(/SEAM_NOT_INJECTED/);
  });
});

describe('Live2dFacade — availability & error', () => {
  it('isAvailable returns false when Live2dKey not injected', () => {
    const client = new AIClient(createFakeSdkCtx());
    expect(client.live2d.isAvailable()).toBe(false);
  });

  it('any call throws LIVE2D_NOT_AVAILABLE when not injected', async () => {
    const client = new AIClient(createFakeSdkCtx());
    expect(() => client.live2d.driveLipSync(0.5)).toThrow(/LIVE2D_NOT_AVAILABLE/);
    await expect(client.live2d.playMotion('g')).rejects.toThrow(/LIVE2D_NOT_AVAILABLE/);
  });
});
