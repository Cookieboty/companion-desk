/**
 * TTS 路由（纯逻辑，无 electron 依赖，便于单测）：
 *   sherpa-theresa（默认）→ 本地离线；失败 / 模型未就绪 → fallbackToSystem（渲染进程用 Web Speech）
 *   fish-local / fish-cloud（可选高级）→ Fish；失败 → fallbackToSystem
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

export interface TtsRouterDeps {
  getConfig: () => TTSConfig;
  sherpa: SherpaSpeaker;
  fish: FishSpeaker;
  onSherpaFailure?: (err: unknown) => void;
}

const system = (message: string): TTSSpeakResult => ({
  success: false,
  via: 'none',
  fallbackToSystem: true,
  message,
});

export class TtsRouter {
  constructor(private readonly deps: TtsRouterDeps) {}

  async speak(req: TTSSpeakRequest): Promise<TTSSpeakResult> {
    const text = req.text?.trim();
    if (!text) return system('empty text');

    const cfg = this.deps.getConfig();
    switch (selectEngine(cfg)) {
      case 'sherpa':
        return this.speakSherpa(text, cfg);
      case 'fish':
        return this.deps.fish.speak({ ...req, text });
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

  private async speakSherpa(text: string, cfg: TTSConfig): Promise<TTSSpeakResult> {
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
      const message = err instanceof Error ? err.message : String(err);
      if (code === 'superseded') {
        // 被更新的请求取代：渲染进程已丢弃该次结果，不需要再让系统语音抢着读
        return { success: false, via: 'none', fallbackToSystem: false, message };
      }
      return system(message);
    }
  }
}
