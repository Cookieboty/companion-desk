// 全局 setup 把 fs / path 换成了 mock；这里需要真实文件系统
jest.unmock('fs');
jest.unmock('path');

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { ModelRegistry } from '../../../src/models/ModelRegistry';
import { ModelStore } from '../../../src/models/ModelStore';
import { UserModels } from '../../../src/models/UserModels';
import { makeTinyVrm } from '../../fixtures/tinyVrm';

import { tmp } from './helpers';

it('merges bundled + installed remote + user models; remote overrides bundled id', async () => {
  const root = tmp();
  const listPath = path.join(tmp(), 'model-list.json');
  await fsp.writeFile(
    listPath,
    JSON.stringify({
      models: [
        {
          name: 'default-character',
          displayName: 'Shibu',
          path: './a.vrm',
          author: 'pixiv',
          license: 'CC0-1.0',
          source: 'https://x',
        },
        {
          name: 'vivi',
          displayName: 'Vivi',
          path: './v.vrm',
          author: 'pixiv',
          license: 'CC0-1.0',
          source: 'https://x',
        },
        {
          name: 'bad',
          displayName: 'Bad',
          path: './b.vrm',
          author: 'x',
          license: 'Proprietary',
          source: 'https://x',
        },
      ],
    }),
  );
  const store = new ModelStore({ root, catalogUrls: [] });
  // 伪造一个已安装的远程模型
  const dir = path.join(store.remoteDir, 'vivi');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'model.vrm'), makeTinyVrm());
  await fsp.writeFile(
    path.join(dir, 'installed.json'),
    JSON.stringify({
      id: 'vivi',
      version: '1.2.0',
      sha256: 'c'.repeat(64),
      installedAt: 1,
      entry: {
        id: 'vivi',
        name: 'Vivi (store)',
        author: 'pixiv',
        license: 'CC0-1.0',
        source: 'https://x',
        credit: 'c',
        vrmVersion: '0.x',
        tags: [],
      },
    }),
  );
  const user = new UserModels(root);
  const src = path.join(tmp(), 'mine.vrm');
  await fsp.writeFile(src, makeTinyVrm({ title: 'Mine', license: 'Other' }));
  const u = await user.import(src);

  const list = await new ModelRegistry({ bundledListPath: listPath, store, user }).list();
  expect(list.map((m) => [m.id, m.origin])).toEqual([
    ['default-character', 'bundled'],
    ['vivi', 'remote'],
    [u.id, 'user'],
  ]);
  expect(list[1]).toMatchObject({ name: 'Vivi (store)', version: '1.2.0' });
  expect(list[1]?.path).toMatch(/^cdmodel:\/\/remote\/vivi\/model\.vrm/);
  expect(list[2]).toMatchObject({
    license: 'Other',
    meta: expect.objectContaining({ title: 'Mine' }),
  });
});
