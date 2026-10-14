import { assertPublicHttpUrl, isPrivateHost } from '../../../src/security/netGuard';

describe('netGuard', () => {
  it('放行公网 https / http', () => {
    expect(assertPublicHttpUrl('https://cos.example.com/a/tts.mp3').hostname).toBe(
      'cos.example.com',
    );
    expect(assertPublicHttpUrl('http://8.8.8.8/x').hostname).toBe('8.8.8.8');
  });

  it('拒绝非 http(s) 协议', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(/http/);
    expect(() => assertPublicHttpUrl('ftp://example.com/a')).toThrow(/http/);
  });

  it.each([
    'http://127.0.0.1/x',
    'http://localhost/x',
    'http://192.168.1.1/x',
    'http://10.0.0.2/x',
    'http://172.16.0.1/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/x',
    'http://[fe80::1]/x',
    'http://[fc00::1]/x',
  ])('拒绝内网地址 %s', (u) => {
    expect(() => assertPublicHttpUrl(u)).toThrow(/本机或局域网/);
  });

  it('拒绝内嵌凭据', () => {
    expect(() => assertPublicHttpUrl('https://user:pass@example.com/')).toThrow(/账号密码/);
  });

  it('拒绝非法 URL', () => {
    expect(() => assertPublicHttpUrl('not a url')).toThrow(/无效/);
  });

  it('isPrivateHost 覆盖云元数据地址', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('100.64.0.1')).toBe(false);
  });
});
