/**
 * 麦克风采集：getUserMedia（开启回声消除 / 降噪 / 自动增益，减少把看板娘自己的 TTS 录进去）
 * → ScriptProcessor（不需要额外脚本文件，兼容严格 CSP）→ 16 kHz → 512 样本帧。
 */
import { t as tr } from '@ig-live/ui';

import { levelOf, resampleTo16k } from './audio';
import { FRAME } from './vad';

export class MicError extends Error {
  constructor(
    readonly code: 'mic_denied' | 'mic_missing' | 'mic_busy' | 'mic_failed',
    message: string,
  ) {
    super(message);
  }
}

export function micErrorFrom(e: unknown): MicError {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new MicError(
      'mic_denied',
      tr('麦克风权限被拒绝。请在系统设置 → 隐私 → 麦克风中允许 Companion Desk。'),
    );
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new MicError('mic_missing', tr('没有找到可用的麦克风。'));
  if (name === 'NotReadableError' || name === 'AbortError')
    return new MicError('mic_busy', tr('麦克风被其他程序占用了。'));
  return new MicError('mic_failed', tr('无法打开麦克风：{0}', (e as Error)?.message ?? String(e)));
}

export interface MicHandlers {
  onFrame(frame: Float32Array): void;
  onLevel?(level: number): void;
}

export class MicCapture {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: AudioNode;
  private src?: MediaStreamAudioSourceNode;
  private pending = new Float32Array(0);

  get running(): boolean {
    return !!this.ctx;
  }

  async start(h: MicHandlers): Promise<void> {
    if (this.ctx) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (e) {
      throw micErrorFrom(e);
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.src = ctx.createMediaStreamSource(this.stream);
    const rate = ctx.sampleRate;
    const onSamples = (input: Float32Array) => {
      h.onLevel?.(levelOf(input));
      const res = resampleTo16k(input, rate);
      const merged = new Float32Array(this.pending.length + res.length);
      merged.set(this.pending);
      merged.set(res, this.pending.length);
      let o = 0;
      for (; o + FRAME <= merged.length; o += FRAME) h.onFrame(merged.slice(o, o + FRAME));
      this.pending = merged.slice(o);
    };
    // 首选 AudioWorklet（音频线程，不丢帧）；不支持时退回 ScriptProcessor
    try {
      await ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href);
      const node = new AudioWorkletNode(ctx, 'cd-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      node.port.onmessage = (ev: MessageEvent<Float32Array>) => onSamples(ev.data);
      this.node = node;
      this.src.connect(node);
    } catch {
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (ev) => onSamples(new Float32Array(ev.inputBuffer.getChannelData(0)));
      this.node = sp;
      this.src.connect(sp);
      // ScriptProcessor 需要连到 destination 才会被驱动；输出全 0，不会出声
      sp.connect(ctx.destination);
    }
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const ctx = this.ctx;
    this.ctx = undefined;
    this.node = undefined;
    this.src = undefined;
    this.stream = undefined;
    this.pending = new Float32Array(0);
    await ctx?.close().catch(() => undefined);
  }
}
