import { splitSentences } from '../../../src/tts/sherpa/sentences';
import { concatSamples, encodeWavPcm16 } from '../../../src/tts/sherpa/wav';

describe('splitSentences', () => {
  it('splits on sentence punctuation and keeps the punctuation', () => {
    expect(splitSentences('真诚就是不欺人也不自欺。热爱就是全心投入！好吗？')).toEqual([
      '真诚就是不欺人也不自欺。',
      '热爱就是全心投入！',
      '好吗？',
    ]);
  });

  it('drops punctuation-only / blank fragments', () => {
    expect(splitSentences('。。。 \n ！？')).toEqual([]);
    expect(splitSentences('  你好  \n\n 世界 ')).toEqual(['你好', '世界']);
  });

  it('splits over-long sentences on soft punctuation, then hard-cuts', () => {
    const long = '甲乙丙丁，'.repeat(10);
    const parts = splitSentences(long, 12);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 12)).toBe(true);
    expect(parts.join('')).toBe(long);
    const noPunct = '啊'.repeat(25);
    expect(splitSentences(noPunct, 10).map((p) => p.length)).toEqual([10, 10, 5]);
  });
});

describe('wav helpers', () => {
  it('encodes a 16-bit mono PCM WAV header + clamped samples', () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1, 2, -2]), 22050);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(10);
    expect(wav.length).toBe(44 + 10);
    expect([0, 1, 2, 3, 4].map((i) => wav.readInt16LE(44 + i * 2))).toEqual([
      0, 32767, -32768, 32767, -32768,
    ]);
  });

  it('concatenates parts with silence gaps', () => {
    const out = concatSamples([new Float32Array([1, 1]), new Float32Array([2])], 1000, 3);
    expect(Array.from(out)).toEqual([1, 1, 0, 0, 0, 2]);
    expect(concatSamples([], 1000, 3).length).toBe(0);
  });
});
