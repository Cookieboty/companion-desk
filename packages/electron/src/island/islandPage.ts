/**
 * 灵动岛页面（data: URL，无 preload、无远程资源）。主进程用
 * `executeJavaScript('__island.show(<JSON>)')` 投递内容；文本一律 textContent 渲染。
 * 点击岛 → location.hash = 'open'，主进程监听 did-navigate-in-page 打开对话窗口。
 * 动画：收起（刘海 / 小胶囊）→ 弹性展开 → 停留 → 收起 → 隐藏窗口。
 */
import type { IslandGeometry } from './geometry';

export function islandHtml(g: IslandGeometry): string {
  const notch = g.mode === 'notch';
  const css = `
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden;
    font: 500 13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI',
      'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif; -webkit-user-select: none; }
  #island { position: absolute; left: 50%; top: ${notch ? 0 : 0}px; transform: translateX(-50%);
    width: ${g.collapsed.width}px; height: ${g.collapsed.height}px; background: #000; color: #f5f2ee;
    border-radius: ${notch ? '0 0 14px 14px' : '999px'}; overflow: hidden; cursor: pointer;
    box-shadow: ${notch ? 'none' : '0 6px 24px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06) inset'};
    transition: width .42s cubic-bezier(.2,1.25,.35,1), height .42s cubic-bezier(.2,1.25,.35,1),
      border-radius .42s ease, opacity .2s ease; opacity: 0; }
  #island.on { opacity: 1; }
  #island.open { width: ${g.width}px; height: ${g.height}px;
    border-radius: ${notch ? '0 0 26px 26px' : '26px'}; }
  #row { position: absolute; left: 0; right: 0; bottom: 0; height: 76px; display: flex;
    align-items: center; gap: 12px; padding: 0 18px; box-sizing: border-box; opacity: 0;
    transform: translateY(-6px); transition: opacity .22s ease .12s, transform .3s ease .1s; }
  #island.open #row { opacity: 1; transform: none; }
  #icon { flex: 0 0 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
    font-size: 19px; background: rgba(251,148,102,.18); }
  #icon[data-kind='agent'] { background: rgba(120,170,255,.18); }
  #icon[data-kind='reminder'] { background: rgba(255,210,110,.18); }
  #icon[data-status='done'] { background: rgba(110,220,150,.2); }
  #icon[data-status='failed'] { background: rgba(255,110,110,.22); }
  #icon[data-status='attention'] { background: rgba(255,210,110,.22); }
  #text { min-width: 0; flex: 1; }
  #ep { display: none; margin-right: 6px; width: 15px; height: 15px; vertical-align: -3px; }
  #ep.on { display: inline-block; }
  #title { font-weight: 650; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #body { color: rgba(245,242,238,.72); font-weight: 450; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; margin-top: 2px; }
  #spark { flex: 0 0 auto; color: #fb9466; font-size: 15px; }
  @media (prefers-reduced-motion: reduce) { #island, #row { transition: none; } }
  `;
  const js = `
  const el = document.getElementById('island');
  const $ = (id) => document.getElementById(id);
  const ICON = { message: '💬', agent: '🛠', reminder: '⏰', info: '✨' };
  const STATUS_ICON = { done: '✅', failed: '⚠️', attention: '👀', running: '⏳' };
  const EP = { claude: 'Claude Code', codex: 'Codex', dsh: 'dsh', nomi: 'Nomi' };
  // same colors and glyphs as ai-chat EndpointIcon
  const EP_COLOR = { nomi: '#f4895a', claude: '#d97757', codex: '#5f93f0', dsh: '#6a73e8' };
  const EP_GLYPH = {
    nomi: [{ d: 'M8 3.2l1.2 3.1 3.1 1.2-3.1 1.2L8 11.8 6.8 8.7 3.7 7.5l3.1-1.2z', fill: true }],
    claude: [{ d: 'M8 3v10M3 8h10M4.5 4.5l7 7M11.5 4.5l-7 7' }],
    codex: [{ d: 'M4.5 5.5L7.5 8l-3 2.5M8.8 11h3' }],
    dsh: [{ d: 'M4 5.5L6.5 8 4 10.5M8 5.5L10.5 8 8 10.5' }],
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs) => {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  function paintEndpoint(node, ep) {
    node.replaceChildren();
    if (!Object.prototype.hasOwnProperty.call(EP, ep)) return false;
    const title = svgEl('title', {});
    title.textContent = EP[ep];
    node.append(title, svgEl('rect', { width: 16, height: 16, rx: 4, fill: EP_COLOR[ep] }));
    for (const g of EP_GLYPH[ep]) {
      node.append(svgEl('path', g.fill
        ? { d: g.d, fill: '#fff' }
        : { d: g.d, stroke: '#fff', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }));
    }
    return true;
  }
  let timer = 0;
  window.__island = {
    show(n) {
      clearTimeout(timer);
      $('icon').textContent = (n.status && STATUS_ICON[n.status]) || ICON[n.kind] || ICON.info;
      $('icon').dataset.kind = n.kind || 'info';
      $('icon').dataset.status = n.status || '';
      const ep = String(n.endpoint || '');
      // endpoint icon with accessible name + tooltip
      const known = paintEndpoint($('ep'), ep);
      $('ep').setAttribute('aria-label', known ? EP[ep] : '');
      $('ep').setAttribute('role', known ? 'img' : 'presentation');
      $('ep').dataset.ep = ep;
      $('ep').classList.toggle('on', known);
      $('tt').textContent = String(n.title || '');
      $('body').textContent = String(n.body || '');
      el.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
      timer = setTimeout(() => window.__island.hide(), Math.max(1500, n.durationMs || 4500));
    },
    hide() {
      el.classList.remove('open');
      setTimeout(() => { el.classList.remove('on'); document.title = 'hidden:' + Date.now(); }, 460);
    },
  };
  el.addEventListener('click', () => { location.hash = 'open-' + Date.now(); window.__island.hide(); });
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(() => window.__island.hide(), 1500); });
  document.title = 'ready';
  `;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>${css}</style></head><body>
<div id="island" role="status" aria-live="polite"><div id="row"><div id="icon"></div>
<div id="text"><div id="title"><svg id="ep" viewBox="0 0 16 16" width="15" height="15" aria-hidden="false"></svg><span id="tt"></span></div><div id="body"></div></div><div id="spark">✦</div></div></div>
<script>${js}</script></body></html>`;
}
