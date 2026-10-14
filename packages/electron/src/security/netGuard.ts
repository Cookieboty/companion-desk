/**
 * 出站 URL 安全校验：服务端返回的 URL（例如 TTS cos_url）可能指向内网或非 HTTP
 * 协议，直接请求会形成 SSRF。这里统一只允许公网 http(s)，拒绝内嵌凭据与保留地址。
 */

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^fe80:/.test(h)
  );
}

export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new Error('无效的音频 URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('音频 URL 只允许 http / https');
  }
  if (u.username || u.password) {
    throw new Error('音频 URL 不能包含账号密码');
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('音频 URL 不能指向本机或局域网地址');
  }
  return u;
}
