/**
 * sherpa-onnx 本地离线 TTS（主进程）。
 * - 原生 addon（sherpa-onnx-node，N-API）懒加载；模型懒加载；单例；推理走 *Async（不阻塞主进程事件循环）。
 * - 分句合成后拼接成一段 16-bit mono WAV，交给渲染进程 <audio> 播放（沿用 tts:speak 的 base64 协议）。
 * - 模型随安装包 extraResources 分发；开发态缺失时自动下载到约定目录（日志进度，无安装器 UI）。
 * - Electron 下必须 enableExternalBuffer:false，否则 V8 内存笼会拒绝 external ArrayBuffer。
 * - 任何失败都抛 SherpaTtsError，上层路由回退系统语音。
 */
import path from 'node:path';

import type { SherpaModelStatus } from '@nomi-ai/types';

import {
  SHERPA_DEFAULT_SID,
  SHERPA_DEFAULT_SPEED,
  SHERPA_MANIFEST,
  SHERPA_MAX_NUM_SENTENCES,
  SHERPA_NUM_THREADS,
  SHERPA_RULE_FSTS,
  type ModelManifest,
} from './manifest';
import { installModel, locateModel, type ModelSource } from './modelStore';
import { splitSentences } from './sentences';
import { concatSamples, encodeWavPcm16 } from './wav';

export type SherpaErrorCode = 'not_ready' | 'engine_failed' | 'too_long' | 'empty' | 'superseded';

export class SherpaTtsError extends Error {
  constructor(
    readonly code: SherpaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SherpaTtsError';
  }
}

export interface SherpaGenerated {
  samples: Float32Array;
  sampleRate: number;
}

export interface SherpaHandle {
  sampleRate: number;
  generateAsync(req: {
    text: string;
    sid: number;
    speed: number;
    enableExternalBuffer: boolean;
  }): Promise<SherpaGenerated>;
}

export interface SherpaAddon {
  OfflineTts: { createAsync(config: unknown): Promise<SherpaHandle> };
}

export interface SherpaServiceDeps {
  /** 打包后：process.resourcesPath/tts-models */
  resourcesRoot?: () => string | undefined;
  /** 开发态（未打包）模型目录候选 */
  devDirs?: () => string[];
  envDir?: () => string | undefined;
  /** userData/tts-models：定位 + 打包态自动下载落点 */
  userRoot?: () => string | undefined;
  /**
   * 自动下载根目录（最终 `<root>/<id>/`）。
   * 开发态：仓库同级 `../models`；未设置则不自动下载。
   */
  installRoot?: () => string | undefined;
  loadAddon?: () => SherpaAddon;
  install?: typeof installModel;
  manifest?: ModelManifest;
  now?: () => number;
  /** 进度日志（默认 console.info） */
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface SherpaSynthResult {
  wav: Buffer;
  sampleRate: number;
  durationMs: number;
  sentences: number;
}

const MAX_TEXT_CHARS = 1500;
const SENTENCE_GAP_MS = 120;
/** 引擎加载失败后的冷却：期间直接回退，避免每句话都重试 0.7s+ 的加载 */
const ENGINE_RETRY_COOLDOWN_MS = 60_000;

function defaultLoadAddon(): SherpaAddon {
  // 懒加载：只有真正用到 sherpa 才 dlopen 原生库；缺平台包 / 加载失败时抛错 → 回退系统语音
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('sherpa-onnx-node') as SherpaAddon;
}

export class SherpaTtsService {
  private readonly manifest: ModelManifest;
  private engine: Promise<{ handle: SherpaHandle; modelDir: string }> | null = null;
  private engineFailedAt = 0;
  private lastError: string | undefined;
  private ensurePromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;

  constructor(private readonly deps: SherpaServiceDeps) {
    this.manifest = deps.manifest ?? SHERPA_MANIFEST;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private log(msg: string, extra?: Record<string, unknown>): void {
    if (this.deps.log) {
      this.deps.log(msg, extra);
      return;
    }
    if (extra) console.warn(`[sherpa-tts] ${msg}`, extra);
    else console.warn(`[sherpa-tts] ${msg}`);
  }

  private locate(): { dir: string; source: ModelSource } | null {
    const resourcesRoot = this.deps.resourcesRoot?.();
    return locateModel({
      envDir: this.deps.envDir?.(),
      resourcesDir: resourcesRoot ? path.join(resourcesRoot, this.manifest.id) : undefined,
      devDirs: this.deps.devDirs?.(),
      userRoot: this.deps.userRoot?.(),
      manifest: this.manifest,
    });
  }

  getStatus(): SherpaModelStatus {
    const base = { modelId: this.manifest.id };
    const found = this.locate();
    if (found) return { ...base, state: 'ready', source: found.source };
    if (this.lastError) {
      return { ...base, state: 'error', message: this.lastError };
    }
    return { ...base, state: 'missing' };
  }

  /**
   * 若模型目录缺失/不完整且配置了 installRoot，则下载解压到约定目录。
   * 幂等；已就绪直接返回。失败写入 lastError 并抛出。
   */
  private async ensureModelPresent(): Promise<void> {
    if (this.locate()) return;
    if (this.ensurePromise) return this.ensurePromise;
    const installRoot = this.deps.installRoot?.();
    if (!installRoot) {
      throw new SherpaTtsError('not_ready', 'sherpa model not found');
    }
    const run = this.deps.install ?? installModel;
    let lastPct = -1;
    this.log(`model missing; downloading ${this.manifest.id} → ${installRoot}`);
    this.ensurePromise = run({
      installRoot,
      manifest: this.manifest,
      onProgress: (phase, p) => {
        if (phase === 'extract') {
          this.log('extracting archive…');
          return;
        }
        const total = p.total || this.manifest.bytes;
        const pct = total > 0 ? Math.floor((p.received / total) * 100) : 0;
        // 每 10% 打一次，避免刷屏
        if (pct >= lastPct + 10 || p.received === total) {
          lastPct = pct;
          this.log(`download ${pct}%`, {
            received: p.received,
            total,
          });
        }
      },
    })
      .then((dir) => {
        this.lastError = undefined;
        this.engineFailedAt = 0;
        this.log(`model ready at ${dir}`);
      })
      .catch((e: unknown) => {
        this.lastError = e instanceof Error ? e.message : String(e);
        throw e;
      })
      .finally(() => {
        this.ensurePromise = null;
      });
    try {
      await this.ensurePromise;
    } catch (e) {
      throw new SherpaTtsError(
        'not_ready',
        e instanceof Error ? e.message : 'sherpa model download failed',
      );
    }
  }

  private ensureEngine(): Promise<{ handle: SherpaHandle; modelDir: string }> {
    if (this.engine) return this.engine;
    if (this.engineFailedAt && this.now() - this.engineFailedAt < ENGINE_RETRY_COOLDOWN_MS) {
      return Promise.reject(
        new SherpaTtsError('engine_failed', this.lastError ?? 'sherpa engine failed recently'),
      );
    }
    const p = (async () => {
      await this.ensureModelPresent();
      const found = this.locate();
      if (!found) {
        throw new SherpaTtsError('not_ready', 'sherpa model not found after install');
      }
      const dir = found.dir;
      const addon = (this.deps.loadAddon ?? defaultLoadAddon)();
      const j = (f: string) => path.join(dir, f);
      const handle = await addon.OfflineTts.createAsync({
        model: {
          vits: {
            model: j('theresa.onnx'),
            lexicon: j('lexicon.txt'),
            tokens: j('tokens.txt'),
            dictDir: j('dict'),
          },
          numThreads: SHERPA_NUM_THREADS,
          provider: 'cpu',
          debug: false,
        },
        ruleFsts: SHERPA_RULE_FSTS.map(j).join(','),
        maxNumSentences: SHERPA_MAX_NUM_SENTENCES,
      });
      return { handle, modelDir: dir };
    })();
    this.engine = p;
    p.catch((e: unknown) => {
      this.engine = null;
      // download 失败用 not_ready，不算引擎冷却
      if (!(e instanceof SherpaTtsError && e.code === 'not_ready')) {
        this.engineFailedAt = this.now();
        this.lastError = e instanceof Error ? e.message : String(e);
      }
    });
    return p.catch((e: unknown) => {
      if (e instanceof SherpaTtsError) throw e;
      throw new SherpaTtsError('engine_failed', e instanceof Error ? e.message : String(e));
    });
  }

  /** 预加载引擎（设置页「检测」用）；缺模型时会先自动下载。返回耗时毫秒。 */
  async warmup(): Promise<number> {
    const t0 = this.now();
    await this.ensureEngine();
    return this.now() - t0;
  }

  /**
   * 分句合成并拼成一段 WAV。同一时刻只跑一个合成；较新的请求会让较旧的在句间退出。
   */
  synthesize(
    text: string,
    opts: { sid?: number; speed?: number } = {},
  ): Promise<SherpaSynthResult> {
    const id = ++this.seq;
    const run = async (): Promise<SherpaSynthResult> => {
      if (id !== this.seq) throw new SherpaTtsError('superseded', 'superseded by a newer request');
      const trimmed = text?.trim() ?? '';
      if (!trimmed) throw new SherpaTtsError('empty', 'empty text');
      if (trimmed.length > MAX_TEXT_CHARS) {
        throw new SherpaTtsError('too_long', `text longer than ${MAX_TEXT_CHARS} chars`);
      }
      const sentences = splitSentences(trimmed);
      if (sentences.length === 0) throw new SherpaTtsError('empty', 'nothing readable');
      const { handle } = await this.ensureEngine();
      const sid = opts.sid ?? SHERPA_DEFAULT_SID;
      const speed = opts.speed ?? SHERPA_DEFAULT_SPEED;
      const parts: Float32Array[] = [];
      let sampleRate = handle.sampleRate;
      for (const s of sentences) {
        if (id !== this.seq)
          throw new SherpaTtsError('superseded', 'superseded by a newer request');
        let audio: SherpaGenerated;
        try {
          // Electron 的 V8 内存笼不允许 external ArrayBuffer
          audio = await handle.generateAsync({
            text: s,
            sid,
            speed,
            enableExternalBuffer: false,
          });
        } catch (e) {
          throw new SherpaTtsError('engine_failed', e instanceof Error ? e.message : String(e));
        }
        if (audio.samples.length > 0) parts.push(audio.samples);
        sampleRate = audio.sampleRate || sampleRate;
      }
      if (parts.length === 0) throw new SherpaTtsError('engine_failed', 'engine returned no audio');
      const pcm = concatSamples(parts, sampleRate, SENTENCE_GAP_MS);
      return {
        wav: encodeWavPcm16(pcm, sampleRate),
        sampleRate,
        durationMs: Math.round((pcm.length / sampleRate) * 1000),
        sentences: sentences.length,
      };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
