/**
 * 出站 URL 安全校验：服务端返回的 URL（例如 TTS cos_url）可能指向内网或非 HTTP
 * 协议，直接请求会形成 SSRF。这里统一只允许公网 http(s)，拒绝内嵌凭据与保留地址。
 *
 * 覆盖：
 * - IPv4 保留段（0/8、10/8、100.64/10、127/8、169.254/16、172.16/12、192.0.0/24、
 *   192.168/16、198.18/15、224/4 组播、240/4 保留、广播）；
 * - 非常规 IPv4 写法（十进制整数 2130706433、八进制 0177.0.0.1、十六进制 0x7f.1、省略段 127.1）；
 * - IPv6 回环 / 未指定 / ULA fc00::/7 / 链路本地 fe80::/10 / 组播，以及内嵌 IPv4
 *   （IPv4-mapped ::ffff:a.b.c.d、IPv4-compatible、NAT64 64:ff9b::/96）按内嵌地址判断；
 * - DNS 重绑定：`safeLookup` 作为 http(s) 请求的 lookup，在真正连接的那次解析结果上校验，
 *   避免「先查一次是公网、连接时再解析成内网」的竞态；`assertPublicHttpUrlResolved` 预检全部解析结果。
 */
import * as dns from 'dns';
import type { LookupAddress, LookupOptions } from 'dns';

/** inet_aton 宽松解析：1–4 段，每段十进制 / 0x 十六进制 / 0 开头八进制。不是 IPv4 返回 null。 */
export function parseIPv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4 || parts.some((p) => p === '')) return null;
  const nums: number[] = [];
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]*$/i.test(p)) n = p.length === 2 ? 0 : parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^(0|[1-9]\d*)$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  const last = nums.pop()!;
  if (nums.some((n) => n > 255)) return null;
  const restBytes = 4 - nums.length;
  if (last >= 2 ** (8 * restBytes)) return null;
  const out = [...nums];
  for (let i = restBytes - 1; i >= 0; i--) out.push(Math.floor(last / 2 ** (8 * i)) % 256);
  return out;
}

function isPrivateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a! >= 224
  );
}

/** IPv6 文本 → 8 个 16 位分组；支持 :: 压缩与末尾点分 IPv4。非法返回 null。 */
export function parseIPv6(host: string): number[] | null {
  let h = host.split('%')[0]!;
  if (!h.includes(':')) return null;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4) {
    const b = parseIPv4(v4[1]!);
    if (!b || v4[1]!.split('.').length !== 4) return null;
    h =
      h.slice(0, -v4[1]!.length) +
      ((b[0]! << 8) | b[1]!).toString(16) +
      ':' +
      ((b[2]! << 8) | b[3]!).toString(16);
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const seg = (s: string) => (s === '' ? [] : s.split(':'));
  const head = seg(halves[0]!);
  const tail = halves.length === 2 ? seg(halves[1]!) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (all.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function isPrivateV6(g: number[]): boolean {
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  const embedded = () => [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
  if (zero(0, 7) && (g[7] === 0 || g[7] === 1)) return true; // :: / ::1
  if (zero(0, 5) && g[5] === 0xffff) return isPrivateV4(embedded()); // ::ffff:a.b.c.d
  if (zero(0, 6)) return isPrivateV4(embedded()); // ::a.b.c.d（已废弃的 IPv4-compatible）
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isPrivateV4(embedded()); // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g[0]! & 0xff00) === 0xff00) return true; // 组播
  return false;
}

/** 是否为本机 / 局域网 / 保留地址（含主机名 localhost、*.local）。 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (h === '' || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local'))
    return true;
  const v6 = parseIPv6(h);
  if (v6) return isPrivateV6(v6);
  const v4 = parseIPv4(h);
  if (v4) return isPrivateV4(v4);
  return false;
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

type LookupAll = (host: string) => Promise<LookupAddress[]>;
const defaultLookupAll: LookupAll = (host) => dns.promises.lookup(host, { all: true });

/** 预检：URL 合法且主机名解析出的每个地址都是公网。 */
export async function assertPublicHttpUrlResolved(
  raw: string,
  lookupAll: LookupAll = defaultLookupAll,
): Promise<URL> {
  const u = assertPublicHttpUrl(raw);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (parseIPv4(host) || parseIPv6(host)) return u;
  const addrs = await lookupAll(host);
  if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) {
    throw new Error('音频 URL 不能指向本机或局域网地址');
  }
  return u;
}

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * 给 http(s).request 的 `lookup` 选项：在实际建立连接所用的解析结果上拒绝内网地址（防 DNS 重绑定）。
 */
export function makeSafeLookup(base: typeof dns.lookup = dns.lookup) {
  return function safeLookup(hostname: string, options: LookupOptions, callback: LookupCb): void {
    base(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '');
      const list = addresses as unknown as LookupAddress[];
      const bad = list.find((a) => isPrivateHost(a.address));
      if (!list.length || bad) {
        const e = new Error(`音频 URL 不能指向本机或局域网地址`) as NodeJS.ErrnoException;
        e.code = 'EPRIVATEADDR';
        return callback(e, '');
      }
      if (options?.all) return callback(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

export const safeLookup = makeSafeLookup();
