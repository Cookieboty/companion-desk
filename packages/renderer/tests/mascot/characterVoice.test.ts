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

  it('ships only Nomi defaults; imported models get family fallbacks', () => {
    expect(Object.keys(CHARACTER_VOICE_DEFAULTS)).toEqual(['nomi']);
    expect(defaultsForCharacter('nomi').pitch).toBe(1.1);
    expect(defaultsForCharacter('user-x-abcdef', ['sprite']).rate).toBe(0.9);
    expect(defaultsForCharacter('user-y-abcdef').rate).toBe(0.88);
  });

  it('merges config then override', async () => {
    const merged = resolveCharacterVoice('nomi', { voice: { rate: 0.8, voiceHint: 'meijia' } });
    expect(merged.rate).toBe(0.8);
    expect(merged.voiceHint).toBe('meijia');
    await saveCharacterVoice('nomi', { pitch: 1.2 });
    expect(resolveCharacterVoice('nomi', { voice: { rate: 0.8 } }).pitch).toBe(1.2);
    clearCharacterVoiceOverride('nomi');
    expect(resolveCharacterVoice('nomi').pitch).toBe(CHARACTER_VOICE_DEFAULTS.nomi.pitch);
  });

  it('active character drives resolvePrefsForCharacter', () => {
    setActiveCharacter('nomi', { voice: { voiceHint: 'xiaoxiao', rate: 0.94 } });
    const prefs = resolvePrefsForCharacter();
    expect(prefs.rate).toBe(0.94);
  });
});
