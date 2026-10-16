/* eslint-disable -- evaluation harness, not shipped */
import { serve, launch } from './lib.mjs';
import fs from 'node:fs';
const [, , rt, outDir, action] = process.argv;
const { srv, port } = serve();
const b = await launch();
const p = await b.newPage({ viewport: { width: 480, height: 560 } });
p.on('console', (m) => console.log('console:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(`http://localhost:${port}/t2.html?rt=${rt}`);
await p.waitForFunction('window.ready===true', null, { timeout: 20000 });
console.log('log', await p.evaluate(() => JSON.stringify(window.__log)));
fs.mkdirSync(outDir, { recursive: true });
await p.waitForTimeout(500);
await p.locator('#c').screenshot({ path: `${outDir}/${rt}-idle.png`, omitBackground: true });
await p.evaluate((a) => window.fire(a), action);
for (const ms of [350, 350, 400, 500]) {
  await p.waitForTimeout(ms);
  await p.locator('#c').screenshot({
    path: `${outDir}/${rt}-${action}-${Date.now() % 100000}.png`,
    omitBackground: true,
  });
}
await b.close();
srv.close();
