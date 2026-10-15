/** 把 float32 PCM（-1..1）编码为 16-bit mono WAV（供渲染进程 <audio> 直接播放）。纯函数。 */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  return buf;
}

/** 拼接多段 PCM，段间插入 gapMs 静音。 */
export function concatSamples(parts: Float32Array[], sampleRate: number, gapMs = 0): Float32Array {
  const gap = Math.max(0, Math.round((sampleRate * gapMs) / 1000));
  let total = 0;
  parts.forEach((p, i) => {
    total += p.length + (i < parts.length - 1 ? gap : 0);
  });
  const out = new Float32Array(total);
  let off = 0;
  parts.forEach((p, i) => {
    out.set(p, off);
    off += p.length;
    if (i < parts.length - 1) off += gap;
  });
  return out;
}
