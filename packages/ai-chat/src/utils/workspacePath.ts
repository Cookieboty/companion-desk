/** 工作目录显示：把家目录换成 ~，过长时保留最后两段（完整路径放 tooltip）。 */
export function shortenPath(full: string, max = 28): string {
  if (!full) return '';
  const norm = full.replace(/\\/g, '/').replace(/\/+$/, '');
  const home = norm.match(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\/Users\/[^/]+)(\/|$)/);
  let p = home ? `~${norm.slice(home[1]!.length)}` : norm;
  if (!p) p = '/';
  if (p.length <= max) return p;
  const parts = p.split('/').filter(Boolean);
  const tail = parts.slice(-2).join('/');
  return `…/${tail}`.length <= max ? `…/${tail}` : `…/${parts[parts.length - 1]}`;
}
