// 全局 setup 把 fs / path 换成了 mock；这里需要真实文件系统
jest.unmock('fs');
jest.unmock('path');

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  parseConfigFile,
  sanitizeModelConfig,
  toConfigFile,
} from '../../../src/models/modelConfig';
import { resolveModelUrl } from '../../../src/models/protocol';
import { UserModels } from '../../../src/models/UserModels';
import { inspectVrm, inspectVrmFile } from '../../../src/models/vrmInspect';
import { makeTinyVrm } from '../../fixtures/tinyVrm';

import { tmp } from './helpers';

async function writeVrm(dir: string, name: string, buf: Buffer) {
  const p = path.join(dir, name);
  await fsp.writeFile(p, buf);
  return p;
}

describe('inspectVrm', () => {
  it('reads VRM 0.x meta, expressions and thumbnail', () => {
    const r = inspectVrm(makeTinyVrm({ title: 'Zero', author: 'Ann', license: 'CC0' }));
    expect(r.meta).toMatchObject({
      version: '0.x',
      title: 'Zero',
      author: 'Ann',
      license: 'CC0',
      commercialUsage: 'Allow',
    });
    expect(r.meta.expressions).toEqual(expect.arrayContaining(['a', 'blink', 'joy']));
    expect(r.thumbnail?.mime).toBe('image/png');
  });

  it('reads VRM 1.0 meta including redistribution', async () => {
    const dir = tmp();
    const p = await writeVrm(
      dir,
      'one.vrm',
      makeTinyVrm({ version: '1.0', title: 'One', allowRedistribution: true }),
    );
    const r = await inspectVrmFile(p);
    expect(r.meta).toMatchObject({
      version: '1.0',
      title: 'One',
      allowRedistribution: true,
      allowedUser: 'everyone',
    });
    expect(r.meta.expressions).toContain('happy');
  });

  it('rejects plain glTF without VRM extension and non-GLB files', () => {
    const glb = makeTinyVrm();
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    expect(json.extensions.VRM).toBeDefined();
    expect(() => inspectVrm(Buffer.from('hello world, not a glb'))).toThrow();
  });
});

describe('UserModels', () => {
  it('imports, configures, replaces and removes a user VRM', async () => {
    const root = tmp();
    const src = tmp();
    const um = new UserModels(root);
    const a = await writeVrm(
      src,
      'My Girl.vrm',
      makeTinyVrm({ title: 'My Girl', license: 'Other' }),
    );
    const rec = await um.import(a, { scale: 99 });
    expect(rec.id).toMatch(/^user-my-girl-[0-9a-f]{6}$/);
    expect(rec.config.scale).toBe(5); // 夹到上限
    expect(rec.thumbnail).toBe('thumb.png');
    expect(rec.meta.title).toBe('My Girl');

    const upd = await um.updateConfig(rec.id, {
      name: 'Renamed',
      camera: { distance: 2 },
      motions: ['wave', 'BAD!'],
    });
    expect(upd.name).toBe('Renamed');
    expect(upd.config).toMatchObject({ camera: { distance: 2 }, motions: ['wave'] });

    const b = await writeVrm(src, 'v2.vrm', makeTinyVrm({ version: '1.0', title: 'V2' }));
    const rep = await um.replace(rec.id, b);
    expect(rep.meta.version).toBe('1.0');
    expect(rep.name).toBe('Renamed');

    expect((await um.list()).map((r) => r.id)).toEqual([rec.id]);
    await um.remove(rec.id);
    expect(await um.list()).toEqual([]);
  });

  it('rejects non-VRM files and leaves nothing behind', async () => {
    const root = tmp();
    const um = new UserModels(root);
    const bad = await writeVrm(tmp(), 'fake.vrm', Buffer.from('nope'));
    await expect(um.import(bad)).rejects.toThrow();
    expect(await um.list()).toEqual([]);
    const notVrm = await writeVrm(tmp(), 'x.glb', makeTinyVrm());
    await expect(um.import(notVrm)).rejects.toThrow(/\.vrm/);
  });

  it('refuses ids that could escape the user dir', async () => {
    const um = new UserModels(tmp());
    await expect(um.remove('../../etc')).rejects.toThrow();
  });
});

describe('model config JSON', () => {
  it('round-trips through export/import and strips unknown fields', () => {
    const file = toConfigFile(
      { scale: 1.2, offset: [0, -0.1, 0], expressionMap: { happy: 'Joy' } },
      'X',
    );
    const back = parseConfigFile(
      JSON.stringify({ ...file, config: { ...file.config, evil: '<script>' } }),
    );
    expect(back).toEqual({ scale: 1.2, offset: [0, -0.1, 0], expressionMap: { happy: 'Joy' } });
  });

  it('rejects foreign JSON', () => {
    expect(() => parseConfigFile('{"foo":1}')).toThrow(/schema/);
    expect(() => parseConfigFile('nope')).toThrow();
  });

  it('sanitizes bad values', () => {
    expect(
      sanitizeModelConfig({ scale: 'big', offset: [1, 2], expressionMap: { 'a b<': 'x' } }),
    ).toEqual({});
  });
});

describe('cdmodel:// resolver', () => {
  it('serves files inside the allowed areas only', async () => {
    const root = tmp();
    await fsp.mkdir(path.join(root, 'user', 'user-a-abcdef'), { recursive: true });
    await fsp.writeFile(path.join(root, 'user', 'user-a-abcdef', 'model.vrm'), 'x');
    await fsp.writeFile(path.join(root, 'secret.vrm'), 'x');
    expect(await resolveModelUrl(root, 'cdmodel://user/user-a-abcdef/model.vrm?v=1')).toMatch(
      /model\.vrm$/,
    );
    expect(await resolveModelUrl(root, 'cdmodel://user/../secret.vrm')).toBeNull();
    expect(await resolveModelUrl(root, 'cdmodel://user/%2e%2e/secret.vrm')).toBeNull();
    expect(await resolveModelUrl(root, 'cdmodel://other/x.vrm')).toBeNull();
    expect(await resolveModelUrl(root, 'cdmodel://user/user-a-abcdef/model.json')).toBeNull();
  });
});
