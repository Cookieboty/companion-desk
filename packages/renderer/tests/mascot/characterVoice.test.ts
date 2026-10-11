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
    expect(CHARACTER_VOICE_DEFAULTS['soft-face'].rate).toBeLessThan(
      CHARACTER_VOICE_DEFAULTS['kenney-panda'].rate!,
    );
    expect(defaultsForCharacter('kenney-panda').voiceHint).toBe('yaoyao');
  });

  it('merges config then override', async () => {
    const merged = resolveCharacterVoice('soft-face', { voice: { rate: 0.8 } });
    expect(merged.rate).toBe(0.8);
    expect(merged.voiceHint).toBe('yunxia');
    await saveCharacterVoice('soft-face', { pitch: 1.2 });
    expect(resolveCharacterVoice('soft-face', { voice: { rate: 0.8 } }).pitch).toBe(1.2);
    clearCharacterVoiceOverride('soft-face');
    expect(resolveCharacterVoice('soft-face').pitch).toBe(
      CHARACTER_VOICE_DEFAULTS['soft-face'].pitch,
    );
  });

  it('active character drives resolvePrefsForCharacter', () => {
    setActiveCharacter('kenney-panda', { voice: { voiceHint: 'yaoyao', rate: 0.94 } });
    const prefs = resolvePrefsForCharacter();
    expect(prefs.rate).toBe(0.94);
  });
});
