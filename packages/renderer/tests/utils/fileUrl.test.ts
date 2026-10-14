import { describe, expect, it } from 'vitest';

import { toFileUrl } from '../../src/utils/fileUrl';

describe('toFileUrl', () => {
  it('handles POSIX absolute paths', () => {
    expect(toFileUrl('/home/u/a b.png')).toBe('file:///home/u/a%20b.png');
  });

  it('handles Windows drive-letter paths (backslashes)', () => {
    expect(toFileUrl('C:\\Users\\me\\AppData\\img #1.png')).toBe(
      'file:///C:/Users/me/AppData/img%20%231.png',
    );
  });

  it('handles Windows paths with forward slashes and UNC paths', () => {
    expect(toFileUrl('D:/data/x.wav')).toBe('file:///D:/data/x.wav');
    expect(toFileUrl('\\\\server\\share\\x.wav')).toBe('file://server/share/x.wav');
  });

  it('leaves URLs and relative paths untouched', () => {
    expect(toFileUrl('assets/a.wav')).toBe('assets/a.wav');
    expect(toFileUrl('file:///C:/a.png')).toBe('file:///C:/a.png');
    expect(toFileUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(toFileUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
