import type {
  AsrOptions,
  AsrProvider,
  AsrProviderInfo,
  AsrResult,
  AsrStreamEvent,
  PcmChunk,
} from '../../seams/asr';

/**
 * 火山（Volcengine）实时 ASR：WebSocket 双工。
 * P3-5 真实实现时：
 *   - wss://openspeech.bytedance.com/api/v2/asr（或最新契约）
 *   - 认证：X-Api-App-Key + X-Api-Access-Key（走 ctx.keyStore）
 *   - 帧格式：16k mono PCM，40ms/包
 */
export class VolcAsrProvider implements AsrProvider {
  readonly info: AsrProviderInfo = {
    id: 'volc-asr',
    name: 'Volcengine ASR',
    streaming: true,
    requiresApiKey: true,
    supportedLanguages: ['zh', 'en'],
  };

  async transcribe(_pcm: PcmChunk, _opts?: AsrOptions): Promise<AsrResult> {
    throw new Error('[VolcAsrProvider] not implemented (P3-5 TODO)');
  }

  async *stream(
    _pcmStream: AsyncIterable<PcmChunk>,
    _opts?: AsrOptions,
  ): AsyncIterable<AsrStreamEvent> {
    yield { type: 'error', error: '[VolcAsrProvider] not implemented (P3-5 TODO)' };
  }
}
