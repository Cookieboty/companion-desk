/**
 * Silero VAD v5 推理（主进程，onnxruntime-web 的 Node/WASM 构建，单线程）。
 * 放在主进程：渲染进程的 CSP 无需放开 wasm-unsafe-eval；模型字节也不离开主进程。
 * 每个窗口一个会话（RNN 状态 + 64 样本上下文）。
 */
import fs from 'node:fs';

type Ort = typeof import('onnxruntime-web');
type Session = import('onnxruntime-web').InferenceSession;

let ortP: Promise<Ort> | null = null;
let sessionP: Promise<Session> | null = null;
let modelFile = '';
let queue: Promise<void> = Promise.resolve();

async function session(model: string): Promise<{ ort: Ort; s: Session }> {
  if (!ortP) {
    ortP = import('onnxruntime-web').then((m) => {
      const ort = ((m as unknown as { default?: Ort }).default ?? m) as Ort;
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';
      return ort;
    });
  }
  const ort = await ortP;
  if (!sessionP || modelFile !== model) {
    modelFile = model;
    sessionP = ort.InferenceSession.create(new Uint8Array(fs.readFileSync(model)), {
      executionProviders: ['wasm'],
    });
    sessionP.catch(() => {
      sessionP = null;
    });
  }
  return { ort, s: await sessionP };
}

export class SileroStream {
  private state = new Float32Array(256);
  private ctx = new Float32Array(64);
  constructor(private readonly model: string) {}

  /** onnxruntime-web 的同一会话不能并发 run：所有流串行执行 */
  prob(frame: Float32Array): Promise<number> {
    const run = queue.then(() => this.run(frame));
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async run(frame: Float32Array): Promise<number> {
    const { ort, s } = await session(this.model);
    const x = new Float32Array(576);
    x.set(this.ctx, 0);
    x.set(frame.subarray(0, 512), 64);
    this.ctx = x.slice(512);
    const out = await s.run({
      input: new ort.Tensor('float32', x, [1, 576]),
      state: new ort.Tensor('float32', this.state, [2, 1, 128]),
      sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), []),
    });
    this.state = new Float32Array(out.stateN!.data as Float32Array);
    return Number((out.output!.data as Float32Array)[0] ?? 0);
  }
}

/** 预热（下载完成 / 打开免按键时），失败返回错误信息 */
export async function warmup(model: string): Promise<string | null> {
  try {
    await new SileroStream(model).prob(new Float32Array(512));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** IPC 收到的帧可能是 Float32Array、Buffer/Uint8Array（字节）、ArrayBuffer 或数字数组 */
export function toFloat32(x: unknown): Float32Array | null {
  // 用类型标签判断（跨 realm 时 instanceof 不可靠）
  const tag = Object.prototype.toString.call(x);
  if (tag === '[object Float32Array]') return new Float32Array(x as Float32Array);
  if (tag === '[object ArrayBuffer]') return new Float32Array((x as ArrayBuffer).slice(0));
  if (ArrayBuffer.isView(x)) {
    const b = new Uint8Array(x.buffer, x.byteOffset, x.byteLength).slice();
    return b.byteLength % 4 === 0 ? new Float32Array(b.buffer) : null;
  }
  if (Array.isArray(x)) return Float32Array.from(x as number[]);
  return null;
}
