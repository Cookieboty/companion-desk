import { describe, expect, it } from 'vitest';

import { resolveSigningEnv } from '../release/signing-env.mjs';

const full: Record<string, string> = {
  MAC_CSC_LINK: 'base64p12',
  MAC_CSC_KEY_PASSWORD: 'pw',
  APPLE_ID: 'a@b.c',
  APPLE_APP_SPECIFIC_PASSWORD: 'app-pw',
  APPLE_TEAM_ID: 'TEAM123',
  WIN_CSC_LINK: 'winp12',
  WIN_CSC_KEY_PASSWORD: 'winpw',
};

describe('resolveSigningEnv', () => {
  it('mac: signs and notarizes when every secret is present', () => {
    const r = resolveSigningEnv('mac', full);
    expect(r.signed).toBe(true);
    expect(r.notarize).toBe(true);
    expect(r.vars).toMatchObject({
      CSC_LINK: 'base64p12',
      CSC_KEY_PASSWORD: 'pw',
      APPLE_ID: 'a@b.c',
      APPLE_TEAM_ID: 'TEAM123',
    });
  });

  it('mac: unsigned and no notarize env when secrets are empty strings (unset in CI)', () => {
    const r = resolveSigningEnv('mac', { MAC_CSC_LINK: '', APPLE_ID: '' });
    expect(r.signed).toBe(false);
    expect(r.notarize).toBe(false);
    expect(r.vars).toEqual({ CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  });

  it('mac: partial notarization secrets are never exported (electron-builder would throw)', () => {
    const rest = { ...full };
    delete rest.APPLE_TEAM_ID;
    const r = resolveSigningEnv('mac', rest);
    expect(r.signed).toBe(true);
    expect(r.notarize).toBe(false);
    expect(r.vars).not.toHaveProperty('APPLE_ID');
    expect(r.notes.join()).toMatch(/incomplete/);
  });

  it('mac: notarization needs signing', () => {
    const r = resolveSigningEnv('mac', {
      APPLE_ID: 'a',
      APPLE_APP_SPECIFIC_PASSWORD: 'b',
      APPLE_TEAM_ID: 'c',
    });
    expect(r.notarize).toBe(false);
    expect(r.vars).not.toHaveProperty('APPLE_ID');
  });

  it('win: uses WIN_CSC_* and never the mac certificate', () => {
    const r = resolveSigningEnv('win', full);
    expect(r.signed).toBe(true);
    expect(r.vars).toMatchObject({ WIN_CSC_LINK: 'winp12', WIN_CSC_KEY_PASSWORD: 'winpw' });
    expect(r.vars).not.toHaveProperty('CSC_LINK');
    expect(resolveSigningEnv('win', {}).signed).toBe(false);
  });

  it('linux: nothing to sign', () => {
    expect(resolveSigningEnv('linux', full).vars).toEqual({});
  });
});
