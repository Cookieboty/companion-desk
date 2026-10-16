/* eslint-disable -- evaluation harness, not shipped */
const q = new URLSearchParams(location.search);
const rt = q.get('rt') || 'canvas-lite';
window.__log = [];
window.addEventListener('securitypolicyviolation', (e) =>
  window.__log.push('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI),
);
const s = document.createElement('script');
s.src = `${rt}/rive.js`;
s.onload = start;
document.head.appendChild(s);
function start() {
  rive.RuntimeLoader.setWasmUrl(new URL(rt + '/rive.wasm', location.href).href);
  const r = new rive.Rive({
    src: 'nomi-poc.riv',
    canvas: document.getElementById('c'),
    stateMachines: 'Nomi',
    autoplay: true,
    autoBind: true,
    onLoad: () => {
      window.__log.push('loaded');
      window.ready = true;
    },
    onLoadError: (e) => {
      window.__log.push('loadError ' + e);
      window.failed = true;
    },
  });
}
