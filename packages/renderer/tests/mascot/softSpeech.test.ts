import { describe, expect, it } from 'vitest';

import { clausePauseParts, DEFAULT_SOFT_SPEECH, scoreVoice } from '../../src/mascot/softSpeech';

function fakeVoice(partial: Partial<SpeechSynthesisVoice> & { name: string; lang: string }) {
  return {
    default: false,
    localService: true,
    voiceURI: partial.voiceURI ?? partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

describe('softSpeech', () => {
  it('scores Edge Xiaoxiao neural above generic male', () => {
    const soft = scoreVoice(
      fakeVoice({
        name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
        lang: 'zh-CN',
        localService: false,
      }),
      true,
    );
    const harsh = scoreVoice(fakeVoice({ name: 'Microsoft Kangkang', lang: 'zh-CN' }), true);
    expect(soft).toBeGreaterThan(harsh);
    expect(harsh).toBeLessThan(0);
  });

  it('splits clauses for pauses', () => {
    expect(clausePauseParts('你好，我是看板娘。加油！')).toEqual([
      '你好，',
      '我是看板娘。',
      '加油！',
    ]);
  });

  it('ships soft defaults slower than 1.0', () => {
    expect(DEFAULT_SOFT_SPEECH.rate).toBeLessThan(1);
    expect(DEFAULT_SOFT_SPEECH.pitch).toBeLessThan(1.2);
  });
});
