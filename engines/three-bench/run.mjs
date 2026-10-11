#!/usr/bin/env node
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const require = createRequire(join(root, 'package.json'));
const threeEntry = require.resolve('three'); // .../three/build/three.cjs
const THREE_ROOT = /[/\\]build[/\\]/.test(threeEntry)
  ? dirname(dirname(threeEntry))
  : dirname(threeEntry);
const vrmEntry = require.resolve('@pixiv/three-vrm');
const VRM_ROOT = dirname(dirname(vrmEntry)); // .../lib/three-vrm.module.js → package root
const GODOT_MODELS = join(__dirname, '../godot-stage/assets/models');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const which = args.model || 'shibu';
const modelFile =
  which === 'shapell'
    ? 'shapell-vrm1.vrm'
    : which === 'darkness'
      ? 'darkness-shibu-vrm0.vrm'
      : 'shibu-vrm0.vrm';
const seconds = Number(args.seconds || 8);
const out = args.out || join(__dirname, '../godot-stage/bench/results', `three-${which}.json`);
const shot = args.shot || '';

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.vrm': 'model/gltf-binary',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file;
  if (url === '/' || url.startsWith('/index')) file = join(__dirname, 'index.html');
  else if (url === '/main.js') file = join(__dirname, 'main.js');
  else if (url.startsWith('/vendor/three/'))
    file = join(THREE_ROOT, url.slice('/vendor/three/'.length)); // package root
  else if (url.startsWith('/vendor/three-vrm/'))
    file = join(VRM_ROOT, url.slice('/vendor/three-vrm/'.length));
  else if (url.startsWith('/models/')) file = join(GODOT_MODELS, url.slice('/models/'.length));
  else {
    res.writeHead(404);
    res.end('not found ' + url);
    return;
  }
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end('missing ' + file);
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const pageUrl = `http://127.0.0.1:${port}/?model=/models/${encodeURIComponent(modelFile)}&seconds=${seconds}&label=three-${which}`;
console.log('[three-bench]', pageUrl);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('  browser:', m.text()));
await page.goto(pageUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__bench?.ready || window.__bench?.error, null, {
  timeout: 120_000,
});
const err = await page.evaluate(() => window.__bench?.error);
if (err) throw new Error(String(err));
await page.waitForFunction(() => window.__bench?.result, null, {
  timeout: (seconds + 3) * 1000 + 60_000,
});
const result = await page.evaluate(() => window.__bench.result);
if (shot) {
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  console.log('[three-bench] shot', shot);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log('[three-bench] wrote', out);
console.log(
  `[three-bench] fps_avg=${result.fps_avg.toFixed(1)} frame_ms_avg=${result.frame_ms_avg.toFixed(2)} p95=${result.frame_ms_p95.toFixed(2)}`,
);
await browser.close();
server.close();
