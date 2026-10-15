import { DEFAULT_TTS_CONFIG, type TTSConfig, type TTSSpeakResult } from '@nomi-ai/types';

import { SherpaTtsError } from '../../../src/tts/sherpa/SherpaTtsService';
import { TtsRouter, selectEngine } from '../../../src/tts/ttsRouter';

const cfg = (patch: Partial<TTSConfig> = {}): TTSConfig => ({
  ...DEFAULT_TTS_CONFIG,
  lastModified: 1,
  ...patch,
});

function setup(config: TTSConfig) {
  const sherpa = {
    synthesize: jest.fn(async () => ({ wav: Buffer.from('RIFFwav'), durationMs: 10 })),
  };
  const fishResult: TTSSpeakResult = {
    success: true,
    via: 'fish',
    audioBase64: 'ZmlzaA==',
    mimeType: 'audio/mpeg',
    fallbackToSystem: false,
  };
  const fish = { speak: jest.fn(async () => fishResult) };
  const onSherpaFailure = jest.fn();
  const router = new TtsRouter({ getConfig: () => config, sherpa, fish, onSherpaFailure });
  return { router, sherpa, fish, onSherpaFailure };
}

describe('selectEngine', () => {
  it('defaults to sherpa (offline), not Fish', () => {
    expect(DEFAULT_TTS_CONFIG.provider).toBe('sherpa-theresa');
    expect(DEFAULT_TTS_CONFIG.sherpaSid).toBe(0);
    expect(DEFAULT_TTS_CONFIG.sherpaSpeed).toBe(1.0);
    expect(selectEngine(cfg())).toBe('sherpa');
  });

  it('maps every provider', () => {
    expect(selectEngine(cfg({ provider: 'fish-local' }))).toBe('fish');
    expect(selectEngine(cfg({ provider: 'fish-cloud' }))).toBe('fish');
    expect(selectEngine(cfg({ provider: 'legacy' }))).toBe('legacy');
    expect(selectEngine(cfg({ provider: 'system' }))).toBe('system');
    expect(selectEngine(cfg({ enabled: false }))).toBe('system');
    expect(selectEngine({ enabled: true, provider: 'nope' as never })).toBe('system');
  });
});

describe('TtsRouter.speak', () => {
  it('sherpa success → wav base64 with sid/speed from config', async () => {
    const { router, sherpa, fish } = setup(cfg({ sherpaSid: 3, sherpaSpeed: 1.0 }));
    const r = await router.speak({ text: ' 你好 ' });
    expect(r).toEqual({
      success: true,
      via: 'sherpa',
      audioBase64: Buffer.from('RIFFwav').toString('base64'),
      mimeType: 'audio/wav',
      fallbackToSystem: false,
    });
    expect(sherpa.synthesize).toHaveBeenCalledWith('你好', { sid: 3, speed: 1.0 });
    expect(fish.speak).not.toHaveBeenCalled();
  });

  it('sherpa not ready / failure → fallbackToSystem (never Fish)', async () => {
    const { router, sherpa, fish, onSherpaFailure } = setup(cfg());
    sherpa.synthesize.mockRejectedValueOnce(new SherpaTtsError('not_ready', 'model missing'));
    const r = await router.speak({ text: '你好' });
    expect(r).toMatchObject({ success: false, via: 'none', fallbackToSystem: true });
    expect(r.message).toMatch(/model missing/);
    expect(onSherpaFailure).toHaveBeenCalledTimes(1);

    sherpa.synthesize.mockRejectedValueOnce(new Error('addon dlopen failed'));
    const r2 = await router.speak({ text: '你好' });
    expect(r2.fallbackToSystem).toBe(true);
    expect(fish.speak).not.toHaveBeenCalled();
  });

  it('superseded sherpa request does not trigger system speech', async () => {
    const { router, sherpa } = setup(cfg());
    sherpa.synthesize.mockRejectedValueOnce(new SherpaTtsError('superseded', 'newer'));
    const r = await router.speak({ text: '你好' });
    expect(r).toMatchObject({ success: false, fallbackToSystem: false });
  });

  it('routes Fish providers to Fish only when explicitly selected', async () => {
    const { router, sherpa, fish } = setup(cfg({ provider: 'fish-local' }));
    const r = await router.speak({ text: '你好', referenceId: 'nomi' });
    expect(r.via).toBe('fish');
    expect(fish.speak).toHaveBeenCalledWith({ text: '你好', referenceId: 'nomi' });
    expect(sherpa.synthesize).not.toHaveBeenCalled();
  });

  it('system / disabled / legacy / empty text never synthesize', async () => {
    for (const patch of [
      { provider: 'system' as const },
      { enabled: false },
      { provider: 'legacy' as const },
    ]) {
      const { router, sherpa, fish } = setup(cfg(patch));
      const r = await router.speak({ text: '你好' });
      expect(r.success).toBe(false);
      expect(r.fallbackToSystem).toBe(true);
      expect(sherpa.synthesize).not.toHaveBeenCalled();
      expect(fish.speak).not.toHaveBeenCalled();
    }
    const { router, sherpa } = setup(cfg());
    expect((await router.speak({ text: '   ' })).fallbackToSystem).toBe(true);
    expect(sherpa.synthesize).not.toHaveBeenCalled();
  });
});
