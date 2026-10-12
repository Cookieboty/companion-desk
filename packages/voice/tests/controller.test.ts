import { describe, expect, it, vi } from 'vitest';

import type { VoiceApi } from '../src/bridge';
import { VoiceController } from '../src/controller';
import { MicError } from '../src/mic';
import type { VadEngine } from '../src/vad';

function fakes(text = '你好') {
  let handlers: { onFrame(f: Float32Array): void; onLevel?(l: number): void } | null = null;
  let t = 0;
  const mic = {
    running: false,
    start: vi.fn(async (h: typeof handlers) => {
      handlers = h;
    }),
    stop: vi.fn(async () => {
      handlers = null;
    }),
  };
  const activity: string[] = [];
  const api = {
    activity: vi.fn(async (a: string) => {
      activity.push(a);
    }),
    transcribe: vi.fn(async () => ({ ok: true as const, text })),
    vadOpen: vi.fn(async () => ({ kind: 'energy' })),
  } as unknown as VoiceApi;
  const push = (n: number, v = 0.3) => {
    for (let i = 0; i < n; i++) {
      t += 32;
      handlers?.onFrame(new Float32Array(512).fill(v));
    }
  };
  return { mic, api, activity, push, now: () => t, advance: (ms: number) => (t += ms) };
}

describe('VoiceController push-to-talk', () => {
  it('records, transcribes and emits the text; reports activity', async () => {
    const f = fakes('打开笔记');
    const c = new VoiceController({ api: f.api, source: 'chat', mic: () => f.mic, now: f.now });
    const got: string[] = [];
    c.onTranscript((t) => got.push(t));
    await c.pttStart();
    expect(c.state.phase).toBe('recording');
    f.push(30);
    const text = await c.pttStop();
    expect(text).toBe('打开笔记');
    expect(got).toEqual(['打开笔记']);
    expect(c.state.phase).toBe('idle');
    expect(f.activity).toEqual(['listening', 'transcribing', 'idle']);
  });

  it('too short press shows a friendly hint and does not call ASR', async () => {
    const f = fakes();
    const c = new VoiceController({ api: f.api, source: 'chat', mic: () => f.mic, now: f.now });
    await c.pttStart();
    f.push(2);
    expect(await c.pttStop()).toBe('');
    expect(c.state.error?.code).toBe('too_short');
    expect(f.api.transcribe).not.toHaveBeenCalled();
  });

  it('cancel discards audio', async () => {
    const f = fakes();
    const c = new VoiceController({ api: f.api, source: 'chat', mic: () => f.mic, now: f.now });
    await c.pttStart();
    f.push(30);
    expect(await c.pttStop(true)).toBe('');
    expect(f.api.transcribe).not.toHaveBeenCalled();
  });

  it('mic permission denied surfaces a Chinese error', async () => {
    const f = fakes();
    f.mic.start.mockRejectedValueOnce(new MicError('mic_denied', '麦克风权限被拒绝'));
    const c = new VoiceController({ api: f.api, source: 'chat', mic: () => f.mic, now: f.now });
    await c.pttStart();
    expect(c.state).toMatchObject({ phase: 'idle', error: { code: 'mic_denied' } });
  });
});

const scriptedVad = (probs: number[]): VadEngine => {
  let i = 0;
  return { kind: 'silero', prob: async () => probs[i++] ?? 0, reset() {}, dispose() {} };
};

describe('VoiceController continuous', () => {
  it('hands-free: speech → hearing → transcribe → emit, keeps listening', async () => {
    const f = fakes('现在几点');
    const probs = [...Array(3).fill(0), ...Array(15).fill(0.9), ...Array(30).fill(0)];
    const c = new VoiceController({
      api: f.api,
      source: 'mascot',
      mic: () => f.mic,
      now: f.now,
      createVad: async () => scriptedVad(probs),
    });
    const got: string[] = [];
    c.onTranscript((t, via) => got.push(`${via}:${t}`));
    await c.startContinuous('handsfree');
    expect(c.state.phase).toBe('listening');
    f.push(48);
    await vi.waitFor(() => expect(got).toEqual(['handsfree:现在几点']));
    expect(f.activity).toContain('hearing');
    expect(c.state.phase).toBe('listening');
    await c.stopContinuous();
    expect(c.state.mode).toBe('off');
  });

  it('wake word: ignores non-matching speech, then wakes and takes next utterance', async () => {
    const f = fakes();
    const utter = [...Array(12).fill(0.9), ...Array(25).fill(0)];
    const c = new VoiceController({
      api: f.api,
      source: 'mascot',
      mic: () => f.mic,
      now: f.now,
      createVad: async () => scriptedVad([...utter, ...utter, ...utter]),
    });
    const transcribe = f.api.transcribe as ReturnType<typeof vi.fn>;
    transcribe
      .mockResolvedValueOnce({ ok: true, text: '今天好累' })
      .mockResolvedValueOnce({ ok: true, text: '你好小桌' })
      .mockResolvedValueOnce({ ok: true, text: '讲个笑话' });
    const got: string[] = [];
    c.onTranscript((t) => got.push(t));
    await c.startContinuous('wake', { wakePhrase: '你好小桌', wakeWindowSec: 10 });
    expect(c.state.phase).toBe('wake-armed');
    f.push(37);
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(c.state.phase).toBe('wake-armed');
    f.push(37);
    await vi.waitFor(() => expect(c.state.phase).toBe('awake'));
    expect(transcribe.mock.calls[1]![2]).toBe('wake');
    f.push(37);
    await vi.waitFor(() => expect(got).toEqual(['讲个笑话']));
    expect(transcribe.mock.calls[2]![2]).toBe('command');
    expect(c.state.phase).toBe('wake-armed');
  });

  it('picks up a changed wake phrase without restarting the mic', async () => {
    const f = fakes();
    const utter = [...Array(12).fill(0.9), ...Array(25).fill(0)];
    const c = new VoiceController({
      api: f.api,
      source: 'mascot',
      mic: () => f.mic,
      now: f.now,
      createVad: async () => scriptedVad([...utter, ...utter]),
    });
    const transcribe = f.api.transcribe as ReturnType<typeof vi.fn>;
    transcribe.mockResolvedValue({ ok: true, text: '小桌小桌' });
    await c.startContinuous('wake', { wakePhrase: '你好小桌', wakeWindowSec: 10 });
    f.push(37);
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(c.state.phase).toBe('wake-armed');
    c.updateSettings({ wakePhrase: '小桌小桌' });
    f.push(37);
    await vi.waitFor(() => expect(c.state.phase).toBe('awake'));
  });

  it('stopping while a VAD call is in flight does not throw', async () => {
    const f = fakes();
    let release: (v: number) => void = () => {};
    const c = new VoiceController({
      api: f.api,
      source: 'mascot',
      mic: () => f.mic,
      now: f.now,
      createVad: async () => ({
        kind: 'silero' as const,
        prob: () => new Promise<number>((r) => (release = r)),
        reset() {},
        dispose() {},
      }),
    });
    await c.startContinuous('handsfree');
    f.push(1);
    await c.stopContinuous();
    release(0.9);
    await new Promise((r) => setTimeout(r, 10));
    expect(c.state.error).toBeNull();
    expect(c.state.phase).toBe('idle');
  });
});
