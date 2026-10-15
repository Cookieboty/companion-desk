/**
 * TTS 路由（纯逻辑，无 electron 依赖，便于单测）：
 *   sherpa-theresa（默认）→ 本地离线；失败 / 模型未就绪 → fallbackToSystem（渲染进程用 Web Speech）
 *   fish-local / fish-cloud（可选高级）→ Fish；失败 → 再试 sherpa → 仍失败才 fallbackToSystem
 *   legacy → 交给 legacy 播放器；system / 禁用 / 未知 → fallbackToSystem
 */
import type { TTSConfig, TTSSpeakRequest, TTSSpeakResult } from '@nomi-ai/types';

export type TtsEngineKind = 'sherpa' | 'fish' | 'legacy' | 'system';

export function selectEngine(cfg: Pick<TTSConfig, 'enabled' | 'provider'>): TtsEngineKind {
  if (!cfg.enabled) return 'system';
  switch (cfg.provider) {
    case 'sherpa-theresa':
      return 'sherpa';
    case 'fish-local':
    case 'fish-cloud':
      return 'fish';
    case 'legacy':
      return 'legacy';
    default:
      return 'system';
  }
}

export interface SherpaSpeaker {
  synthesize(
    text: string,
    opts: { sid?: number; speed?: number },
  ): Promise<{ wav: Buffer; durationMs?: number }>;
}

export interface FishSpeaker {
  speak(req: TTSSpeakRequest): Promise<TTSSpeakResult>;
}

/** 每条 tts:speak 请求的结果摘要（success / fallback / error + provider），供主进程打日志 */
export interface TtsSpeakOutcome {
  outcome: 'success' | 'fallback' | 'error';
  /** 配置里选的 provider（sherpa-theresa / fish-local / system …） */
  provider: string;
  /** 实际出声的引擎；none = 交给渲染进程系统语音 */
  via: TTSSpeakResult['via'];
  ms: number;
  textLength: number;
  /** sherpa 失败码（downloading / not_ready / engine_failed …） */
  code?: string;
  message?: string;
  audioBytes?: number;
}

export interface TtsRouterDeps {
  getConfig: () => TTSConfig;
  sherpa: SherpaSpeaker;
  fish: FishSpeaker;
  onSherpaFailure?: (err: unknown) => void;
  /** 每条请求结束时调用一次（成功 / 回退 / 异常） */
  onOutcome?: (o: TtsSpeakOutcome) => void;
  /** 单次请求总超时（默认 90s）：超时直接回退系统语音，避免 IPC 永久挂起 */
  speakTimeoutMs?: number;
  now?: () => number;
}

const DEFAULT_SPEAK_TIMEOUT_MS = 90_000;

const system = (message: string): TTSSpeakResult => ({
  success: false,
  via: 'none',
  fallbackToSystem: true,
  message,
});

export class TtsRouter {
  constructor(private readonly deps: TtsRouterDeps) {}

  /**
   * 对外入口：包一层「必有结果日志 + 总超时」。任何路径（成功 / 回退 / 抛错 / 超时）都恰好上报一次 onOutcome。
   */
  async speak(req: TTSSpeakRequest): Promise<TTSSpeakResult> {
    const now = this.deps.now ?? Date.now;
    const t0 = now();
    let provider = 'unknown';
    let lastCode: string | undefined;
    const textLength = req?.text?.length ?? 0;
    const report = (r: TTSSpeakResult | null, err?: unknown): void => {
      const message = err ? (err instanceof Error ? err.message : String(err)) : r?.message;
      const o: TtsSpeakOutcome = {
        outcome: err ? 'error' : r?.success ? 'success' : 'fallback',
        provider,
        via: r?.via ?? 'none',
        ms: now() - t0,
        textLength,
        code: lastCode,
        message,
        audioBytes: r?.audioBase64 ? Math.floor((r.audioBase64.length * 3) / 4) : undefined,
      };
      try {
        this.deps.onOutcome?.(o);
      } catch {
        /* 日志回调不得影响结果 */
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      provider = this.deps.getConfig().provider;
      const timeoutMs = this.deps.speakTimeoutMs ?? DEFAULT_SPEAK_TIMEOUT_MS;
      const timeout = new Promise<TTSSpeakResult>((resolve) => {
        timer = setTimeout(() => {
          lastCode = 'timeout';
          resolve(system(`tts timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      });
      const result = await Promise.race([
        this.route(req, (c) => {
          lastCode = c;
        }),
        timeout,
      ]);
      report(result);
      return result;
    } catch (err) {
      report(null, err);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async route(
    req: TTSSpeakRequest,
    noteCode: (code: string | undefined) => void,
  ): Promise<TTSSpeakResult> {
    const text = req.text?.trim();
    if (!text) return system('empty text');

    const cfg = this.deps.getConfig();
    switch (selectEngine(cfg)) {
      case 'sherpa':
        return this.speakSherpa(text, cfg, noteCode);
      case 'fish':
        return this.speakFishThenSherpa(req, text, cfg, noteCode);
      case 'legacy':
        return {
          success: false,
          via: 'legacy',
          fallbackToSystem: true,
          message: 'use legacy player',
        };
      default:
        return system(cfg.enabled ? 'system provider' : 'tts disabled');
    }
  }

  /** Fish first; on failure try offline sherpa so old fish-local configs still have voice. */
  private async speakFishThenSherpa(
    req: TTSSpeakRequest,
    text: string,
    cfg: TTSConfig,
    noteCode: (code: string | undefined) => void,
  ): Promise<TTSSpeakResult> {
    const fishResult = await this.deps.fish.speak({ ...req, text });
    if (fishResult.success) return fishResult;
    const sherpaResult = await this.speakSherpa(text, cfg, noteCode);
    if (sherpaResult.success) return sherpaResult;
    // Prefer Fish's message (e.g. unreachable) when both fail; keep system fallback flag
    if (fishResult.fallbackToSystem || sherpaResult.fallbackToSystem) {
      return system(fishResult.message || sherpaResult.message || 'fish and sherpa failed');
    }
    return fishResult;
  }

  private async speakSherpa(
    text: string,
    cfg: TTSConfig,
    noteCode: (code: string | undefined) => void,
  ): Promise<TTSSpeakResult> {
    try {
      const out = await this.deps.sherpa.synthesize(text, {
        sid: cfg.sherpaSid,
        speed: cfg.sherpaSpeed,
      });
      return {
        success: true,
        via: 'sherpa',
        audioBase64: out.wav.toString('base64'),
        mimeType: 'audio/wav',
        fallbackToSystem: false,
      };
    } catch (err) {
      this.deps.onSherpaFailure?.(err);
      const code = (err as { code?: string } | null)?.code;
      noteCode(code);
      const message = err instanceof Error ? err.message : String(err);
      if (code === 'superseded') {
        // 被更新的请求取代：渲染进程已丢弃该次结果，不需要再让系统语音抢着读
        return { success: false, via: 'none', fallbackToSystem: false, message };
      }
      return system(message);
    }
  }
}
