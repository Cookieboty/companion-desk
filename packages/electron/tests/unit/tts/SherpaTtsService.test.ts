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
  url: 'https://example.invalid/tiny.tar.bz2',
  sha256: '0'.repeat(64),
  bytes: 1,
  topDir: 'tiny',
  files: { 'model.onnx': 1 },
};

function modelRoot(): string {
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
    const root = modelRoot();
    const svc = new SherpaTtsService({
      resourcesRoot: () => root,
      loadAddon,
      manifest,
    });
    expect(loadAddon).not.toHaveBeenCalled();
    const [ra, rb] = await Promise.allSettled([
      svc.synthesize('你好。世界。'),
      svc.synthesize('再见。'),
    ]);
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
    const root = modelRoot();
    const svc = new SherpaTtsService({
      resourcesRoot: () => root,
      loadAddon: () => addon,
      manifest,
    });
    const r = await svc.synthesize('你好。世界！', { sid: 0, speed: 1.0 });
    expect(r.sentences).toBe(2);
    expect(r.wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(r.sampleRate).toBe(22050);
    expect(generate.mock.calls.map((c) => c[0])).toEqual([
      { text: '你好。', sid: 0, speed: 1.0, enableExternalBuffer: false },
      { text: '世界！', sid: 0, speed: 1.0, enableExternalBuffer: false },
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

  it('defaults to sid 0 / speed 1.0 and disables external buffers (Electron)', async () => {
    const { addon, generate } = fakeAddon();
    const svc = new SherpaTtsService({
      resourcesRoot: () => modelRoot(),
      loadAddon: () => addon,
      manifest,
    });
    await svc.synthesize('你好');
    expect(generate).toHaveBeenCalledWith({
      text: '你好',
      sid: 0,
      speed: 1.0,
      enableExternalBuffer: false,
    });
  });

  it('missing model without installRoot → not_ready (caller falls back to system speech)', async () => {
    const loadAddon = jest.fn();
    const svc = new SherpaTtsService({
      resourcesRoot: () => fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-empty-')),
      loadAddon,
      manifest,
    });
    await expect(svc.synthesize('你好')).rejects.toMatchObject({ code: 'not_ready' });
    expect(loadAddon).not.toHaveBeenCalled();
    expect(svc.getStatus()).toMatchObject({ state: 'missing', modelId: 'tiny' });
  });

  it('missing model with installRoot → auto-downloads then synthesizes', async () => {
    const { addon, createAsync, generate } = fakeAddon();
    const loadAddon = jest.fn(() => addon);
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-install-'));
    const install = jest.fn(async () => {
      const dir = path.join(installRoot, 'tiny');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'model.onnx'), 'x');
      return dir;
    });
    const logs: string[] = [];
    const svc = new SherpaTtsService({
      resourcesRoot: () => fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-empty-')),
      installRoot: () => installRoot,
      userRoot: () => installRoot,
      loadAddon,
      install,
      manifest,
      log: (m: string) => logs.push(m),
    });
    expect(svc.getStatus().state).toBe('missing');
    const r = await svc.synthesize('你好');
    expect(r.sentences).toBe(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(loadAddon).toHaveBeenCalledTimes(1);
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalled();
    expect(svc.getStatus()).toMatchObject({ state: 'ready', source: 'userData' });
    expect(logs.some((l) => /download/i.test(l) || /missing/i.test(l))).toBe(true);
  });

  it('addon load failure → engine_failed, then cooldown avoids retrying immediately', async () => {
    let now = 1_000_000;
    const loadAddon = jest.fn(() => {
      throw new Error('dlopen failed');
    });
    const svc = new SherpaTtsService({
      resourcesRoot: () => modelRoot(),
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
      resourcesRoot: () => modelRoot(),
      loadAddon: () => addon,
      manifest,
    });
    await expect(svc.synthesize('   ')).rejects.toMatchObject({ code: 'empty' });
    await expect(svc.synthesize('。。。')).rejects.toMatchObject({ code: 'empty' });
    await expect(svc.synthesize('啊'.repeat(1501))).rejects.toMatchObject({ code: 'too_long' });
  });

  it('reports ready when resourcesRoot has a valid model', () => {
    const root = modelRoot();
    const svc = new SherpaTtsService({ resourcesRoot: () => root, manifest });
    expect(svc.getStatus()).toMatchObject({ state: 'ready', source: 'resources', modelId: 'tiny' });
  });
});
