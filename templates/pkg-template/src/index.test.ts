import { describe, expect, it } from 'vitest';

import { hello, PKG_NAME } from './index';

describe('pkg-template', () => {
  it('exposes package name', () => {
    expect(PKG_NAME).toBe('@ig-live/pkg-template');
  });

  it('says hello', () => {
    expect(hello('trae')).toBe('hello, trae');
  });
});
