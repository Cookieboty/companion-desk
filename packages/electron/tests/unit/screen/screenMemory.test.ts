import {
  DEFAULT_EXCLUSIONS,
  cleanOcr,
  expired,
  matchExclusion,
  sanitizeScreenSettings,
  similarFrame,
  toGray,
  toImageRect,
} from '../../../src/screen/screenMemory';

describe('screen memory logic', () => {
  it('is off by default and sanitizes values', () => {
    const s = sanitizeScreenSettings(undefined);
    expect(s.enabled).toBe(false);
    expect(s.exclusions).toEqual(DEFAULT_EXCLUSIONS);
    const t = sanitizeScreenSettings({
      enabled: 'yes',
      intervalSec: 7,
      retentionDays: 3,
      exclusions: [' a ', 'a', ''],
    });
    expect(t.enabled).toBe(false);
    expect(t.intervalSec).toBe(60);
    expect(t.retentionDays).toBe(3);
    expect(t.exclusions).toEqual(['a']);
  });
  it('matches exclusions case-insensitively against any visible window', () => {
    expect(matchExclusion(['Terminal', 'Vault — 1PASSWORD'], ['1Password'])).toBe('1Password');
    expect(matchExclusion(['Chrome - 无痕窗口'], ['无痕'])).toBe('无痕');
    expect(matchExclusion(['Code'], ['1Password'])).toBeNull();
  });
  it('detects unchanged frames', () => {
    const a = toGray(new Uint8Array([10, 10, 10, 255, 200, 200, 200, 255]));
    expect(a.length).toBe(2);
    expect(similarFrame(a, new Uint8Array([a[0] + 1, a[1]]))).toBe(true);
    expect(similarFrame(a, new Uint8Array([200, 10]))).toBe(false);
    expect(similarFrame(null, a)).toBe(false);
  });
  it('prunes by retention and cleans OCR', () => {
    const now = 10 * 86_400_000;
    expect(expired([{ at: now - 2 * 86_400_000 }, { at: now }], 1, now)).toHaveLength(1);
    expect(cleanOcr('a   b\n\n\nc ')).toBe('a b\nc');
  });
  it('maps a view selection to image pixels (HiDPI) and clamps', () => {
    expect(
      toImageRect(
        { x: 10, y: 10, width: 100, height: 50 },
        { width: 1000, height: 500 },
        { width: 2000, height: 1000 },
      ),
    ).toEqual({ x: 20, y: 20, width: 200, height: 100 });
    expect(
      toImageRect(
        { x: 950, y: 0, width: 200, height: 10 },
        { width: 1000, height: 500 },
        { width: 1000, height: 500 },
      ).width,
    ).toBe(50);
  });
});
