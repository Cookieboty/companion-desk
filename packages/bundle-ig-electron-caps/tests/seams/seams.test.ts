import { describe, expect, it } from 'vitest';

import { AsrKey, ClipboardKey, KeyStoreKey, ScreenKey, TtsKey } from '../../src/seams';

describe('seams exports', () => {
  it('every service key has a distinct symbol', () => {
    const keys = [KeyStoreKey.key, ScreenKey.key, ClipboardKey.key, AsrKey.key, TtsKey.key];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('service key symbols carry readable descriptions', () => {
    expect(KeyStoreKey.key.description).toBe('ctx.keyStore');
    expect(ScreenKey.key.description).toBe('ctx.screen');
    expect(ClipboardKey.key.description).toBe('ctx.clipboard');
    expect(AsrKey.key.description).toBe('ctx.asr');
    expect(TtsKey.key.description).toBe('ctx.tts');
  });
});
