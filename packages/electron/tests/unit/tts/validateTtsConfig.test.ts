import { DEFAULT_TTS_CONFIG } from '@nomi-ai/types';

import { normalizeTtsConfig, validateTtsConfig } from '../../../src/tts/fish/validateTtsConfig';

describe('validateTtsConfig', () => {
  it('accepts built-in fish-local defaults', () => {
    const cfg = normalizeTtsConfig({ ...DEFAULT_TTS_CONFIG, lastModified: 1 });
    const v = validateTtsConfig(cfg);
    expect(v.isValid).toBe(true);
    expect(cfg.provider).toBe('fish-local');
    expect(cfg.referenceId).toBe('nomi');
  });

  it('rejects invalid fish baseUrl', () => {
    const cfg = normalizeTtsConfig({
      ...DEFAULT_TTS_CONFIG,
      baseUrl: 'not-a-url',
      lastModified: 1,
    });
    // normalize keeps the string; validate catches it
    cfg.baseUrl = 'not-a-url';
    const v = validateTtsConfig(cfg);
    expect(v.isValid).toBe(false);
    expect(v.errors.some((e) => /baseUrl/.test(e))).toBe(true);
  });

  it('requires legacy clone fields when provider=legacy', () => {
    const cfg = normalizeTtsConfig({
      enabled: true,
      provider: 'legacy',
      baseUrl: 'http://127.0.0.1:8080',
      referenceId: 'nomi',
      format: 'mp3',
      timeoutMs: 30000,
      hostname: '',
      port: 0,
      path: 'bad',
      audioUrl: '',
      promptText: '',
      lastModified: 1,
    });
    const v = validateTtsConfig(cfg);
    expect(v.isValid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('system provider needs no fish fields', () => {
    const cfg = normalizeTtsConfig({
      ...DEFAULT_TTS_CONFIG,
      provider: 'system',
      enabled: true,
      lastModified: 1,
    });
    expect(validateTtsConfig(cfg).isValid).toBe(true);
  });

  it('infers legacy provider from classic filled fields', () => {
    const cfg = normalizeTtsConfig({
      enabled: true,
      hostname: 'example.com',
      port: 8443,
      path: '/voice_clone_direct',
      audioUrl: 'https://example.com/a.wav',
      promptText: 'hello',
    } as any);
    expect(cfg.provider).toBe('legacy');
  });
});
