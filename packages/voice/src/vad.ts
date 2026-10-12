/**
 * 说话概率估计：
 * - RemoteVad：Silero VAD v5，在主进程推理（模型按需下载）；渲染进程无需 WASM，CSP 不放宽。
 * - EnergyVad：没有模型时的退化方案（自适应噪声底 + 能量阈值），保证免按键模式也能用。
 * 两者都以 16 kHz、512 样本（32 ms）为一帧。
 */
import { rms } from './audio';

export const FRAME = 512;

export interface VadEngine {
  readonly kind: 'silero' | 'energy';
  prob(frame: Float32Array): Promise<number>;
  reset(): void;
  dispose(): void;
}

export class EnergyVad implements VadEngine {
  readonly kind = 'energy' as const;
  private floor = 0.004;
  prob(frame: Float32Array): Promise<number> {
    const e = rms(frame);
    // 噪声底：只在安静时缓慢跟随
    if (e < this.floor * 2) this.floor = this.floor * 0.97 + e * 0.03;
    const snr = e / Math.max(1e-4, this.floor);
    return Promise.resolve(Math.max(0, Math.min(1, (snr - 2) / 6)));
  }
  reset(): void {
    this.floor = 0.004;
  }
  dispose(): void {}
}

/** Silero VAD 在主进程推理（ai:voice:vadProb），渲染进程只传 32 ms 帧 */
export class RemoteVad implements VadEngine {
  readonly kind = 'silero' as const;
  constructor(
    private readonly probFn: (frame: Float32Array) => Promise<number>,
    private readonly closeFn: () => void,
  ) {}
  prob(frame: Float32Array): Promise<number> {
    return this.probFn(frame);
  }
  reset(): void {}
  dispose(): void {
    this.closeFn();
  }
}
