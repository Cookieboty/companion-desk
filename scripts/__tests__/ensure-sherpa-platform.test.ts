import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NEEDED,
  hasSherpaPackage,
  resolveSherpaVersion,
} from '../release/ensure-sherpa-platform.mjs';

describe('ensure-sherpa-platform', () => {
  it('maps each packaging target to the natives electron-builder must ship', () => {
    expect(NEEDED.linux).toEqual(['sherpa-onnx-linux-x64']);
    expect(NEEDED.win).toEqual(['sherpa-onnx-win-x64']);
    expect(NEEDED.mac).toEqual(['sherpa-onnx-darwin-arm64', 'sherpa-onnx-darwin-x64']);
  });

  it('resolves version from installed sherpa-onnx-node', () => {
    expect(resolveSherpaVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('hasSherpaPackage is false for an empty stub directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-check-'));
    const name = 'sherpa-onnx-win-x64';
    await fs.mkdir(path.join(root, 'node_modules', name), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', name, 'package.json'), '{}');
    expect(await hasSherpaPackage(name, root)).toBe(false);
  });

  it('hasSherpaPackage is true when a .node (or DLL) is present', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-ok-'));
    const name = 'sherpa-onnx-linux-x64';
    const dir = path.join(root, 'node_modules', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'sherpa-onnx.node'), 'fake');
    expect(await hasSherpaPackage(name, root)).toBe(true);
  });
});
