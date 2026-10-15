/**
 * 程序合成短音效（Web Audio）。无外部素材，许可随本仓库 MIT。
 * 不保证各平台音色完全一致；仅作轻反馈。
 */

export type SynthFn = (ctx: AudioContext, when: number, gain: number) => void;

function tone(
  ctx: AudioContext,
  when: number,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  attack = 0.005,
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function noiseBurst(ctx: AudioContext, when: number, dur: number, gain: number, hp = 800): void {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start(when);
  src.stop(when + dur + 0.02);
}

export const SYNTH: Record<string, SynthFn> = {
  pop: (ctx, when, gain) => {
    tone(ctx, when, 520, 0.08, gain * 0.45, 'sine');
    tone(ctx, when + 0.02, 780, 0.06, gain * 0.25, 'triangle');
  },
  ding: (ctx, when, gain) => {
    tone(ctx, when, 880, 0.18, gain * 0.35, 'sine');
    tone(ctx, when + 0.06, 1320, 0.22, gain * 0.28, 'sine');
  },
  swoosh: (ctx, when, gain) => noiseBurst(ctx, when, 0.14, gain * 0.22, 600),
  hum: (ctx, when, gain) => {
    tone(ctx, when, 220, 0.2, gain * 0.2, 'triangle');
    tone(ctx, when + 0.05, 330, 0.15, gain * 0.12, 'sine');
  },
  click: (ctx, when, gain) => tone(ctx, when, 1400, 0.03, gain * 0.3, 'square', 0.001),
  success: (ctx, when, gain) => {
    tone(ctx, when, 523, 0.1, gain * 0.28, 'sine');
    tone(ctx, when + 0.08, 659, 0.1, gain * 0.28, 'sine');
    tone(ctx, when + 0.16, 784, 0.16, gain * 0.32, 'sine');
  },
  fail: (ctx, when, gain) => {
    tone(ctx, when, 320, 0.12, gain * 0.3, 'triangle');
    tone(ctx, when + 0.1, 220, 0.18, gain * 0.28, 'sine');
  },
  think: (ctx, when, gain) => {
    tone(ctx, when, 440, 0.05, gain * 0.15, 'sine');
    tone(ctx, when + 0.1, 440, 0.05, gain * 0.12, 'sine');
  },
  wave: (ctx, when, gain) => {
    tone(ctx, when, 600, 0.07, gain * 0.22, 'sine');
    tone(ctx, when + 0.05, 720, 0.08, gain * 0.2, 'sine');
    tone(ctx, when + 0.1, 840, 0.1, gain * 0.18, 'sine');
  },
  land: (ctx, when, gain) => {
    tone(ctx, when, 180, 0.1, gain * 0.35, 'triangle');
    noiseBurst(ctx, when, 0.06, gain * 0.15, 200);
  },
};
