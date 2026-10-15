jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ModelManifest } from '../../../src/tts/sherpa/manifest';
import {
  SherpaTtsError,
  SherpaTtsService,
  type SherpaAddon,
  type SherpaHandle,
} from '../../../src/tts/sherpa/SherpaTtsService';

const manifest: ModelManifest = {
  id: 'tiny',
  url: 'https://example.invalid/x.tar.bz2',
  sha256: '0'.repeat(64),
  bytes: 100,
  topDir: 'tiny',
  files: { 'model.onnx': 1 },
};

function modelDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-svc-'));
  fs.mkdirSync(path.join(root, 'tiny'));
  fs.writeFileSync(path.join(root, 'tiny', 'model.onnx'), 'x');
  return root;
}

function fakeAddon() {
  const generate = jest.fn(async (req: { text: string; sid: number; speed: number }) => ({
    samples: new Float32Array(req.text.length * 100).fill(0.1),
    sampleRate: 22050,
  }));
  const handle: SherpaHandle = { sampleRate: 22050, generateAsync: generate };
  const createAsync = jest.fn(async (_cfg: unknown) => handle);
  const addon: SherpaAddon = { OfflineTts: { createAsync } };
  return { addon, createAsync, generate };
}

describe('SherpaTtsService', () => {
  it('is lazy: addon not loaded until first synth; engine is a singleton', async () => {
    const { addon, createAsync, generate } = fakeAddon();
    const loadAddon = jest.fn(() => addon);
    const svc = new SherpaTtsService({
      userRoot: () => modelDir(),
      loadAddon,
      manifest,
    });
    expect(loadAddon).not.toHaveBeenCalled();
    const [ra, rb] = await Promise.allSettled([
      svc.synthesize('你好。世界。'),
      svc.synthesize('再见。'),
    ]);
    // 并发请求：第一个被第二个取代，第二个成功
    expect(ra.status).toBe('rejected');
    expect((ra as PromiseRejectedResult).reason).toBeInstanceOf(SherpaTtsError);
    expect((ra as PromiseRejectedResult).reason.code).toBe('superseded');
    expect(rb.status).toBe('fulfilled');
    expect((rb as PromiseFulfilledResult<{ sentences: number }>).value.sentences).toBe(1);
    await svc.synthesize('第三次。');
    expect(loadAddon).toHaveBeenCalledTimes(1);
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalled();
  });

  it('passes the model config with sid / speed, splits sentences and returns a WAV', async () => {
    const { addon, createAsync, generate } = fakeAddon();
    const root = modelDir();
    const svc = new SherpaTtsService({ userRoot: () => root, loadAddon: () => addon, manifest });
    const r = await svc.synthesize('你好。世界！', { sid: 0, speed: 1.0 });
    expect(r.sentences).toBe(2);
    expect(r.wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(r.sampleRate).toBe(22050);
    expect(generate.mock.calls.map((c) => c[0])).toEqual([
      { text: '你好。', sid: 0, speed: 1.0 },
      { text: '世界！', sid: 0, speed: 1.0 },
    ]);
    const cfg = createAsync.mock.calls[0]![0] as {
      model: { vits: Record<string, string>; numThreads: number; provider: string };
      ruleFsts: string;
      maxNumSentences: number;
    };
    expect(cfg.model.vits.model).toBe(path.join(root, 'tiny', 'theresa.onnx'));
    expect(cfg.model.vits.dictDir).toBe(path.join(root, 'tiny', 'dict'));
    expect(cfg.model.numThreads).toBe(4);
    expect(cfg.model.provider).toBe('cpu');
    expect(cfg.maxNumSentences).toBe(1);
    expect(cfg.ruleFsts.split(',').map((p) => path.basename(p))).toEqual([
      'phone.fst',
      'date.fst',
      'number.fst',
      'new_heteronym.fst',
    ]);
  });

  it('defaults to sid 0 / speed 1.0', async () => {
    const { addon, generate } = fakeAddon();
    const svc = new SherpaTtsService({
      userRoot: () => modelDir(),
      loadAddon: () => addon,
      manifest,
    });
    await svc.synthesize('你好');
    expect(generate).toHaveBeenCalledWith({ text: '你好', sid: 0, speed: 1.0 });
  });

  it('missing model → not_ready (caller falls back to system speech), status=missing', async () => {
    const loadAddon = jest.fn();
    const svc = new SherpaTtsService({
      userRoot: () => fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-empty-')),
      loadAddon,
      manifest,
    });
    await expect(svc.synthesize('你好')).rejects.toMatchObject({ code: 'not_ready' });
    expect(loadAddon).not.toHaveBeenCalled();
    expect(svc.getStatus()).toMatchObject({ state: 'missing', modelId: 'tiny' });
  });

  it('addon load failure → engine_failed, then cooldown avoids retrying immediately', async () => {
    let now = 1_000_000;
    const loadAddon = jest.fn(() => {
      throw new Error('dlopen failed');
    });
    const svc = new SherpaTtsService({
      userRoot: () => modelDir(),
      loadAddon,
      manifest,
      now: () => now,
    });
    await expect(svc.synthesize('你好')).rejects.toMatchObject({ code: 'engine_failed' });
    await expect(svc.synthesize('你好')).rejects.toMatchObject({ code: 'engine_failed' });
    expect(loadAddon).toHaveBeenCalledTimes(1);
    now += 61_000;
    await expect(svc.synthesize('你好')).rejects.toMatchObject({ code: 'engine_failed' });
    expect(loadAddon).toHaveBeenCalledTimes(2);
  });

  it('rejects empty, unreadable and over-long text', async () => {
    const { addon } = fakeAddon();
    const svc = new SherpaTtsService({
      userRoot: () => modelDir(),
      loadAddon: () => addon,
      manifest,
    });
    await expect(svc.synthesize('   ')).rejects.toMatchObject({ code: 'empty' });
    await expect(svc.synthesize('。。。')).rejects.toMatchObject({ code: 'empty' });
    await expect(svc.synthesize('啊'.repeat(1501))).rejects.toMatchObject({ code: 'too_long' });
  });

  it('reports download progress, becomes ready, and records errors', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-dl-'));
    let finish!: () => void;
    const install = jest.fn(
      async (o: {
        onProgress?: (p: 'download' | 'extract', v: { received: number; total: number }) => void;
      }) => {
        o.onProgress?.('download', { received: 40, total: 100 });
        await new Promise<void>((r) => (finish = r));
        fs.mkdirSync(path.join(root, 'tiny'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tiny', 'model.onnx'), 'x');
        return path.join(root, 'tiny');
      },
    );
    const svc = new SherpaTtsService({
      userRoot: () => root,
      manifest,
      install: install as never,
    });
    expect(svc.startDownload().state).toBe('downloading');
    expect(svc.getStatus()).toMatchObject({
      state: 'downloading',
      receivedBytes: 40,
      totalBytes: 100,
    });
    svc.startDownload(); // 幂等
    expect(install).toHaveBeenCalledTimes(1);
    finish();
    await svc.whenInstalled();
    expect(svc.getStatus().state).toBe('ready');
    expect(svc.startDownload().state).toBe('ready');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('download failure surfaces as status=error; cancel is not an error', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-dlerr-'));
    const failing = jest.fn(async () => {
      throw new Error('校验失败：期望 abc');
    });
    const svc = new SherpaTtsService({ userRoot: () => root, manifest, install: failing as never });
    svc.startDownload();
    await svc.whenInstalled();
    expect(svc.getStatus()).toMatchObject({
      state: 'error',
      message: expect.stringContaining('校验失败'),
    });

    const cancellable = jest.fn(
      (o: { signal?: AbortSignal }) =>
        new Promise<string>((_, reject) => {
          o.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const svc2 = new SherpaTtsService({
      userRoot: () => root,
      manifest,
      install: cancellable as never,
    });
    svc2.startDownload();
    svc2.cancelDownload();
    await svc2.whenInstalled();
    expect(svc2.getStatus().state).toBe('missing');
  });
});
