import type {
  TtsChunk,
  TtsOptions,
  TtsProvider,
  TtsProviderInfo,
  TtsResult,
  TtsVoice,
} from '../../seams/tts';

/**
 * macOS `say` / Windows `SAPI` 系统 TTS。
 * P3-6 真实实现时：
 *   - macOS: child_process.spawn('say', ['-v', voice, '-o', tmpAiff, '--data-format=LEI16@22050', text])
 *   - Windows: 通过 SAPI COM 或 Edge PowerShell 桥
 *   - 完成后读入 → 分块 → 计算 rms → yield
 */
export class SystemTtsProvider implements TtsProvider {
  readonly info: TtsProviderInfo = {
    id: 'system',
    name: 'System TTS',
    streaming: false,
    requiresApiKey: false,
  };

  async synth(_text: string, _opts?: TtsOptions): Promise<TtsResult> {
    throw new Error('[SystemTtsProvider] not implemented (P3-6 TODO)');
  }

  async *stream(_text: string, _opts?: TtsOptions): AsyncIterable<TtsChunk> {
    yield await Promise.reject(new Error('[SystemTtsProvider] not implemented (P3-6 TODO)'));
  }

  stop(_reqId: string): void {
    /* no-op in skeleton */
  }

  async listVoices(): Promise<TtsVoice[]> {
    return [];
  }
}
