import { compareVersions, isAllowedUrl, validateCatalog } from '../../../src/models/catalog';
import { ALLOWED_MODEL_LICENSES } from '../../../src/models/licenses';

const file = (over: Record<string, unknown> = {}) => ({
  urls: ['https://example.com/a.vrm'],
  sha256: 'a'.repeat(64),
  size: 1000,
  ...over,
});
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'shibu',
  name: 'Shibu',
  author: 'pixiv',
  license: 'CC0-1.0',
  source: 'https://example.com',
  version: '1.0.0',
  vrmVersion: '0.x',
  tags: ['vroid'],
  credit: 'Shibu by pixiv (CC0)',
  vrm: file(),
  thumbnail: file({ urls: ['https://example.com/t.jpg'], size: 100 }),
  ...over,
});

describe('model catalog validation', () => {
  it('accepts a well-formed entry', () => {
    const { catalog, rejected } = validateCatalog({ schemaVersion: 1, models: [entry()] });
    expect(rejected).toEqual([]);
    expect(catalog.models[0]).toMatchObject({ id: 'shibu', license: 'CC0-1.0' });
  });

  it('rejects unknown schema', () => {
    expect(() => validateCatalog({ schemaVersion: 2, models: [] })).toThrow();
  });

  it.each([
    ['non-open licence', { license: 'LicenseRef-Proprietary' }],
    ['http url', { vrm: file({ urls: ['http://example.com/a.vrm'] }) }],
    ['missing sha256', { vrm: file({ sha256: undefined }) }],
    ['bad sha256', { vrm: file({ sha256: 'xyz' }) }],
    ['oversize', { vrm: file({ size: 500 * 1024 * 1024 }) }],
    ['bad id', { id: '../etc' }],
    ['bad version', { version: 'latest' }],
  ])('drops entries with %s', (_label, over) => {
    const { catalog, rejected } = validateCatalog({ schemaVersion: 1, models: [entry(over)] });
    expect(catalog.models).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it('drops duplicate ids and keeps the first', () => {
    const { catalog, rejected } = validateCatalog({
      schemaVersion: 1,
      models: [entry(), entry({ name: 'dup' })],
    });
    expect(catalog.models).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/duplicate/);
  });

  it('allows loopback http only when the policy says so', () => {
    expect(isAllowedUrl('http://127.0.0.1:1234/x')).toBe(false);
    expect(isAllowedUrl('http://127.0.0.1:1234/x', { allowLoopbackHttp: true })).toBe(true);
    expect(isAllowedUrl('http://evil.com/x', { allowLoopbackHttp: true })).toBe(false);
    expect(isAllowedUrl('https://user:pw@example.com/x')).toBe(false);
  });

  it('compares semver', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('licence allowlist matches the repo assets manifest', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('../../../../../assets-licenses.json') as {
      allowedLicenses: string[];
    };
    expect([...ALLOWED_MODEL_LICENSES].sort()).toEqual([...manifest.allowedLicenses].sort());
  });
});
