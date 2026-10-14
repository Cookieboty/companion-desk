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
  #text { min-width: 0; flex: 1; }
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
  let timer = 0;
  window.__island = {
    show(n) {
      clearTimeout(timer);
      $('icon').textContent = ICON[n.kind] || ICON.info;
      $('icon').dataset.kind = n.kind || 'info';
      $('title').textContent = String(n.title || '');
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
<div id="text"><div id="title"></div><div id="body"></div></div><div id="spark">✦</div></div></div>
<script>${js}</script></body></html>`;
}
