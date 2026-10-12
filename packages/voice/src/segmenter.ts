/**
 * 语音分段状态机（纯逻辑）：输入每帧语音概率，输出 speech-start / speech-end 事件。
 * 迟滞：进入阈值 threshold，退出阈值 threshold-0.15；
 * 至少 minSpeechMs 才算一句；静音持续 minSilenceMs 才结束；保留 preRollMs 的前导音频，避免吞掉句首。
 */
export interface SegmenterOptions {
  frameMs: number;
  threshold: number;
  minSpeechMs: number;
  minSilenceMs: number;
  preRollMs: number;
  maxSpeechMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  frameMs: 32,
  threshold: 0.5,
  minSpeechMs: 250,
  minSilenceMs: 700,
  preRollMs: 320,
  maxSpeechMs: 30_000,
};

export type SegmentEvent =
  { type: 'start' } | { type: 'end'; audio: Float32Array; ms: number } | { type: 'misfire' };

export class Segmenter {
  private o: SegmenterOptions;
  private pre: Float32Array[] = [];
  private cur: Float32Array[] = [];
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;
  private started = false;

  constructor(o: Partial<SegmenterOptions> = {}) {
    this.o = { ...DEFAULT_SEGMENTER, ...o };
  }

  get active(): boolean {
    return this.speaking;
  }

  setThreshold(threshold: number): void {
    this.o = { ...this.o, threshold };
  }

  push(frame: Float32Array, prob: number): SegmentEvent[] {
    const { frameMs, threshold, minSpeechMs, minSilenceMs, preRollMs, maxSpeechMs } = this.o;
    const ev: SegmentEvent[] = [];
    if (!this.speaking) {
      this.pre.push(frame);
      while (this.pre.length * frameMs > preRollMs) this.pre.shift();
      if (prob >= threshold) {
        this.speaking = true;
        this.started = false;
        this.cur = [...this.pre];
        this.pre = [];
        this.speechMs = frameMs;
        this.silenceMs = 0;
      }
      return ev;
    }
    this.cur.push(frame);
    if (prob >= threshold - 0.15) {
      this.speechMs += frameMs;
      this.silenceMs = 0;
    } else this.silenceMs += frameMs;
    if (!this.started && this.speechMs >= minSpeechMs) {
      this.started = true;
      ev.push({ type: 'start' });
    }
    const tooLong = this.cur.length * frameMs >= maxSpeechMs;
    if (this.silenceMs >= minSilenceMs || tooLong) {
      if (this.started) {
        const len = this.cur.reduce((a, c) => a + c.length, 0);
        const audio = new Float32Array(len);
        let o = 0;
        for (const c of this.cur) {
          audio.set(c, o);
          o += c.length;
        }
        ev.push({ type: 'end', audio, ms: this.cur.length * frameMs });
      } else ev.push({ type: 'misfire' });
      this.reset();
    }
    return ev;
  }

  reset(): void {
    this.speaking = false;
    this.started = false;
    this.cur = [];
    this.pre = [];
    this.speechMs = 0;
    this.silenceMs = 0;
  }
}
