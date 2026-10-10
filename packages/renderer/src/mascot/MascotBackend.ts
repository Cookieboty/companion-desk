/**
 * Mascot 渲染后端抽象。
 *
 * 看板娘的所有「驱动」（口型、表情、视线、眨眼）都只面向本接口编程；
 * 具体渲染库（当前唯一实现：three-vrm，见 backends/vrm.ts）在加载模型后
 * 通过 `mascotRegistry.attach()` 挂上来。将来若接入 Inochi2D 等开源 2D 运行时，
 * 只需新增一个实现本接口的 backend。
 */

/** 通用表情名（VRM 1.0 预设表情名，0.x 由 three-vrm 自动映射）。 */
export type MascotExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised';

export const MASCOT_EXPRESSIONS: readonly MascotExpression[] = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
];

export type MascotBackendKind = 'vrm';

export interface MascotCapabilities {
  /** 模型实际支持的表情（预设 + 自定义） */
  expressions: string[];
  lipSync: boolean;
  lookAt: boolean;
  blink: boolean;
}

export interface MascotBackend {
  readonly kind: MascotBackendKind;
  /** 设置表情；weight 0..1，其它情绪表情会被淡出。'neutral' = 清空情绪。 */
  setExpression(name: MascotExpression | string, weight?: number): void;
  /** 口型张合 0..1（TTS 音量包络驱动）。 */
  setMouthOpen(value: number): void;
  /** 视线目标，归一化屏幕坐标 x,y ∈ [-1, 1]（右/上为正）。 */
  lookAt(x: number, y: number): void;
  /** 立即眨一次眼（后端自身也会随机眨眼）。 */
  blink(): void;
  capabilities(): MascotCapabilities;
  dispose(): void;
}

type Listener = (backend: MascotBackend | null) => void;

/** 当前挂载的后端（全局唯一，同一时刻只有一个看板娘）。 */
class MascotRegistry {
  private backend: MascotBackend | null = null;
  private readonly listeners = new Set<Listener>();

  attach(backend: MascotBackend): () => void {
    this.backend = backend;
    this.emit();
    return () => {
      if (this.backend === backend) {
        this.backend = null;
        this.emit();
      }
    };
  }

  current(): MascotBackend | null {
    return this.backend;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    // 供 e2e / 调试观察：<html data-mascot-backend="vrm" data-mascot-lipsync="true">
    if (typeof document !== 'undefined') {
      const ds = document.documentElement.dataset;
      const caps = this.backend?.capabilities();
      ds.mascotBackend = this.backend?.kind ?? 'none';
      ds.mascotLipsync = String(!!caps?.lipSync);
      ds.mascotExpressions = caps?.expressions.join(',') ?? '';
    }
    for (const l of this.listeners) {
      try {
        l(this.backend);
      } catch {
        /* isolate listener error */
      }
    }
  }
}

export const mascotRegistry = new MascotRegistry();
