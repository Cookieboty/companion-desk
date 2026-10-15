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
  // same glyphs as ai-chat EndpointIcon (packages/ui/src/brand/endpointGlyphs.ts; lobe-icons MIT)
  const EP_TILE = {
    nomi: { fill: '#FCEFE1', stroke: 'rgba(51,41,31,.14)' },
    claude: { fill: '#d97757' },
    codex: { fill: '#111111', stroke: 'rgba(255,255,255,.22)' },
    dsh: { fill: '#ffffff', stroke: 'rgba(77,107,254,.35)' },
  };
  const EP_GLYPH = {
    nomi: [
      { d: 'M84 104 C96 96 112 104 120 128 C128 154 138 188 156 196', stroke: '#F7A67C', sw: 30, tf: 'translate(-0.69 0.81) scale(0.0625)' },
      { d: 'M48 200 C48 120 64 70 100 70 C140 70 142 196 180 196 C204 196 214 176 214 150', stroke: '#33291F', sw: 40, tf: 'translate(-0.69 0.81) scale(0.0625)' },
      { d: 'M200 30 C203 50 210 57 230 60 C210 63 203 70 200 90 C197 70 190 63 170 60 C190 57 197 50 200 30 Z', fill: '#FB9466', tf: 'translate(-0.69 0.81) scale(0.0625)' },
    ],
    claude: [{ d: 'M8 3v10M3 8h10M4.5 4.5l7 7M11.5 4.5l-7 7', stroke: '#fff', sw: 1.5 }],
    codex: [{ d: 'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z', fill: '#fff', tf: 'translate(3 3) scale(0.4167)' }],
    dsh: [{ d: 'M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z', fill: '#4D6BFE', tf: 'translate(2.4 2.4) scale(0.4667)' }],
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
    const tile = EP_TILE[ep];
    node.append(title, svgEl('rect', tile.stroke
      ? { x: 0.3, y: 0.3, width: 15.4, height: 15.4, rx: 4, fill: tile.fill, stroke: tile.stroke, 'stroke-width': 0.6 }
      : { width: 16, height: 16, rx: 4, fill: tile.fill }));
    for (const g of EP_GLYPH[ep]) {
      const attrs = { d: g.d, fill: g.fill || 'none' };
      if (g.stroke) Object.assign(attrs, { stroke: g.stroke, 'stroke-width': g.sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (g.tf) attrs.transform = g.tf;
      node.append(svgEl('path', attrs));
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
