/* eslint-disable -- evaluation harness, not shipped */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const MOUNTS = {
  '/nomi/': '/workspace/nomi-rive-eval/packages/renderer/public/assets/models/sprite/nomi/',
  '/': '/workspace/rive-harness/www/',
};
export function serve() {
  const srv = http
    .createServer((q, s) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      let f = null;
      for (const [pre, dir] of Object.entries(MOUNTS))
        if (u.startsWith(pre)) {
          f = path.join(dir, u.slice(pre.length));
          if (fs.existsSync(f) && fs.statSync(f).isFile()) break;
          f = null;
        }
      if (!f) {
        s.statusCode = 404;
        return s.end();
      }
      const t =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.wasm': 'application/wasm',
          '.json': 'application/json',
          '.png': 'image/png',
        }[path.extname(f)] || 'application/octet-stream';
      s.setHeader('content-type', t);
      fs.createReadStream(f).pipe(s);
    })
    .listen(0);
  return { srv, port: srv.address().port };
}
export async function launch(extra = []) {
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      ...extra,
    ],
  });
}
