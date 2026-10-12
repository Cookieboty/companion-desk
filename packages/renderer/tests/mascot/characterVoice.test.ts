import { describe, expect, it, beforeEach } from 'vitest';

import {
  CHARACTER_VOICE_DEFAULTS,
  clearCharacterVoiceOverride,
  defaultsForCharacter,
  resolveCharacterVoice,
  resolvePrefsForCharacter,
  saveCharacterVoice,
  setActiveCharacter,
} from '../../src/mascot/characterVoice';

const mem = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
} as Storage;

describe('characterVoice', () => {
  beforeEach(() => {
    mem.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
    setActiveCharacter(null);
  });

  it('ships distinct softer defaults per character', () => {
    expect(CHARACTER_VOICE_DEFAULTS.michona.rate).toBeLessThan(
      CHARACTER_VOICE_DEFAULTS['pastel-girl'].rate!,
    );
    expect(defaultsForCharacter('pastel-girl').voiceHint).toBe('xiaoxiao');
  });

  it('merges config then override', async () => {
    const merged = resolveCharacterVoice('michona', { voice: { rate: 0.8 } });
    expect(merged.rate).toBe(0.8);
    expect(merged.voiceHint).toBe('meijia');
    await saveCharacterVoice('michona', { pitch: 1.2 });
    expect(resolveCharacterVoice('michona', { voice: { rate: 0.8 } }).pitch).toBe(1.2);
    clearCharacterVoiceOverride('michona');
    expect(resolveCharacterVoice('michona').pitch).toBe(
      CHARACTER_VOICE_DEFAULTS.michona.pitch,
    );
  });

  it('active character drives resolvePrefsForCharacter', () => {
    setActiveCharacter('pastel-girl', { voice: { voiceHint: 'xiaoxiao', rate: 0.94 } });
    const prefs = resolvePrefsForCharacter();
    expect(prefs.rate).toBe(0.94);
  });
});
