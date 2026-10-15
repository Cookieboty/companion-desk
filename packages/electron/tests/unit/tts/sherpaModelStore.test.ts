jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ModelManifest } from '../../../src/tts/sherpa/manifest';
import { SHERPA_MANIFEST } from '../../../src/tts/sherpa/manifest';
import { locateModel, verifyModelDir } from '../../../src/tts/sherpa/modelStore';

const manifest: ModelManifest = {
  id: 'tiny',
  files: { 'model.onnx': 8, 'dict/words.txt': 3 },
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-sherpa-'));

function mk(root: string): string {
  fs.mkdirSync(path.join(root, 'dict'), { recursive: true });
  fs.writeFileSync(path.join(root, 'model.onnx'), '12345678');
  fs.writeFileSync(path.join(root, 'dict/words.txt'), 'abc');
  return root;
}

describe('sherpa manifest', () => {
  it('pins required files for the default bundled model', () => {
    expect(SHERPA_MANIFEST.id).toBe('vits-zh-hf-theresa');
    expect(Object.keys(SHERPA_MANIFEST.files)).toEqual(
      expect.arrayContaining(['theresa.onnx', 'lexicon.txt', 'tokens.txt', 'dict/jieba.dict.utf8']),
    );
    expect(SHERPA_MANIFEST.files['theresa.onnx']).toBe(121913906);
  });
});

describe('verifyModelDir / locateModel', () => {
  it('requires every file with exact size', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'dict'));
    fs.writeFileSync(path.join(dir, 'model.onnx'), '12345678');
    expect(verifyModelDir(dir, manifest)).toEqual({ ok: false, bad: ['dict/words.txt'] });
    fs.writeFileSync(path.join(dir, 'dict/words.txt'), 'abcd');
    expect(verifyModelDir(dir, manifest).bad).toEqual(['dict/words.txt']);
    fs.writeFileSync(path.join(dir, 'dict/words.txt'), 'abc');
    expect(verifyModelDir(dir, manifest).ok).toBe(true);
  });

  it('prefers env > resources > dev and ignores incomplete dirs', () => {
    const resources = mk(tmp());
    const dev = mk(tmp());
    const env = mk(tmp());
    const broken = tmp();
    expect(locateModel({ resourcesDir: resources, manifest })).toEqual({
      dir: resources,
      source: 'resources',
    });
    expect(locateModel({ resourcesDir: broken, manifest, devDirs: [broken, dev] })).toEqual({
      dir: dev,
      source: 'dev',
    });
    expect(locateModel({ resourcesDir: resources, manifest, devDirs: [dev], envDir: env })).toEqual(
      { dir: env, source: 'env' },
    );
    expect(locateModel({ resourcesDir: broken, manifest, envDir: broken })).toBeNull();
  });
});
