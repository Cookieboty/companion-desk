jest.unmock('fs');
jest.unmock('path');

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ModelManifest } from '../../../src/tts/sherpa/manifest';
import { SHERPA_MANIFEST } from '../../../src/tts/sherpa/manifest';
import { installModel, locateModel, verifyModelDir } from '../../../src/tts/sherpa/modelStore';

// 213 字节的 tar.bz2：tiny-model/model.onnx(8B)、tiny-model/dict/words.txt(3B)、
// 以及一个 zip-slip 条目 tiny-model/../../escape.txt（必须被丢弃）
const FIXTURE_B64 =
  'QlpoOTFBWSZTWaAx9mUAAOz/gMuABABAA//AAogCAH4n3+AKGDAArbBJUamQzSD0JoGmjQyPRPUGpqaZAAAA0AAASioxMAmTAAjIYIyGA9tCdEEirtjELxrSEhxZXgFgbQHNZIwGA2CIKAKhuERQP46dDqqrLSjgd1BB0FAGClKvQAAkgFMFHYceEEkCMi4kgLYGB513yO2BayXnoAn6uC/zZ7+I6XfcUMnjynDVciXEJnyA9F+e9ErZsweVUhlCFVBAJqXVEQcgQfxdyRThQkKAx9mU';
const FIXTURE = Buffer.from(FIXTURE_B64, 'base64');
const FIXTURE_SHA = '9735325ed4dfb93eef3512ebb21519dcb03ee22b3d92f91e168201b43fb0d9b6';

const manifest: ModelManifest = {
  id: 'tiny',
  url: 'https://example.invalid/tiny.tar.bz2',
  sha256: FIXTURE_SHA,
  bytes: FIXTURE.length,
  topDir: 'tiny-model',
  files: { 'model.onnx': 8, 'dict/words.txt': 3 },
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-'));

const okFetch = (body: Buffer) => async () =>
  new Response(new Uint8Array(body), {
    status: 200,
    headers: { 'content-length': String(body.length) },
  });

describe('sherpa manifest', () => {
  it('pins archive sha256 + required files for the default model', () => {
    expect(SHERPA_MANIFEST.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(SHERPA_MANIFEST.url).toMatch(/^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\//);
    expect(Object.keys(SHERPA_MANIFEST.files)).toEqual(
      expect.arrayContaining(['theresa.onnx', 'lexicon.txt', 'tokens.txt', 'dict/jieba.dict.utf8']),
    );
  });
});

describe('verifyModelDir / locateModel', () => {
  it('requires every file with exact size', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'dict'));
    fs.writeFileSync(path.join(dir, 'model.onnx'), '12345678');
    expect(verifyModelDir(dir, manifest)).toEqual({ ok: false, bad: ['dict/words.txt'] });
    fs.writeFileSync(path.join(dir, 'dict/words.txt'), 'abcd'); // wrong size
    expect(verifyModelDir(dir, manifest).bad).toEqual(['dict/words.txt']);
    fs.writeFileSync(path.join(dir, 'dict/words.txt'), 'abc');
    expect(verifyModelDir(dir, manifest).ok).toBe(true);
  });

  it('prefers env > dev > userData and ignores incomplete dirs', () => {
    const mk = (root: string) => {
      fs.mkdirSync(path.join(root, 'dict'), { recursive: true });
      fs.writeFileSync(path.join(root, 'model.onnx'), '12345678');
      fs.writeFileSync(path.join(root, 'dict/words.txt'), 'abc');
      return root;
    };
    const userRoot = tmp();
    const user = mk(path.join(userRoot, 'tiny'));
    const dev = mk(tmp());
    const env = mk(tmp());
    const broken = tmp();
    expect(locateModel({ userRoot, manifest })?.source).toBe('userData');
    expect(locateModel({ userRoot, manifest, devDirs: [broken, dev] })).toEqual({
      dir: dev,
      source: 'dev',
    });
    expect(locateModel({ userRoot, manifest, devDirs: [dev], envDir: env })).toEqual({
      dir: env,
      source: 'env',
    });
    expect(locateModel({ userRoot, manifest, envDir: broken })?.dir).toBe(user);
    expect(locateModel({ userRoot: tmp(), manifest })).toBeNull();
  });
});

describe('installModel', () => {
  it('downloads, verifies sha256, extracts (strip top dir) and drops zip-slip entries', async () => {
    const userRoot = tmp();
    const phases: string[] = [];
    const dir = await installModel({
      userRoot,
      manifest,
      fetchImpl: okFetch(FIXTURE),
      onProgress: (phase) => phases.push(phase),
    });
    expect(dir).toBe(path.join(userRoot, 'tiny'));
    expect(fs.readFileSync(path.join(dir, 'model.onnx'), 'utf8')).toBe('12345678');
    expect(fs.readFileSync(path.join(dir, 'dict/words.txt'), 'utf8')).toBe('abc');
    expect(fs.existsSync(path.join(userRoot, '..', 'escape.txt'))).toBe(false);
    expect(fs.existsSync(path.join(userRoot, 'escape.txt'))).toBe(false);
    expect(phases).toContain('download');
    expect(phases).toContain('extract');
    // 临时文件已清理
    expect(fs.existsSync(`${dir}.partial`)).toBe(false);
    expect(fs.existsSync(path.join(userRoot, '.download', 'tiny.tar.bz2'))).toBe(false);
    expect(locateModel({ userRoot, manifest })?.source).toBe('userData');
  });

  it('rejects a sha256 mismatch and installs nothing', async () => {
    const userRoot = tmp();
    const tampered = Buffer.from(FIXTURE);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(
      installModel({ userRoot, manifest, fetchImpl: okFetch(tampered) }),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(userRoot, 'tiny'))).toBe(false);
    expect(fs.existsSync(path.join(userRoot, '.download', 'tiny.tar.bz2'))).toBe(false);
    expect(fs.existsSync(path.join(userRoot, '.download', 'tiny.tar.bz2.part'))).toBe(false);
  });

  it('rejects an archive whose extracted files do not match expected sizes', async () => {
    const userRoot = tmp();
    const bad: ModelManifest = { ...manifest, files: { 'model.onnx': 9, 'dict/words.txt': 3 } };
    await expect(
      installModel({ userRoot, manifest: bad, fetchImpl: okFetch(FIXTURE) }),
    ).rejects.toThrow(/校验失败|model\.onnx/);
    expect(fs.existsSync(path.join(userRoot, 'tiny'))).toBe(false);
    expect(fs.existsSync(path.join(userRoot, 'tiny.partial'))).toBe(false);
  });

  it('surfaces HTTP failures', async () => {
    const userRoot = tmp();
    await expect(
      installModel({
        userRoot,
        manifest,
        fetchImpl: async () => new Response('nope', { status: 404 }),
      }),
    ).rejects.toThrow(/404/);
    expect(fs.existsSync(path.join(userRoot, 'tiny'))).toBe(false);
  });

  it('sanity: fixture sha constant matches the embedded bytes', () => {
    expect(createHash('sha256').update(FIXTURE).digest('hex')).toBe(FIXTURE_SHA);
  });
});
