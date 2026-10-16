/* eslint-disable -- evaluation harness, not shipped */
import { launch } from './lib.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 520, height: 720 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message.slice(0, 200)));
const q = process.argv[2] || 'rive=1';
await p.goto('http://127.0.0.1:5277/?' + q, { waitUntil: 'load' });
await p.waitForTimeout(5000);
console.log(
  'has rive canvas',
  await p.locator('[data-testid=rive-canvas]').count(),
  'sprite',
  await p.locator('[data-testid=sprite-canvas]').count(),
  'backend',
  await p.evaluate(() => document.documentElement.dataset.mascotBackend),
);
await p.screenshot({
  path: `/workspace/screenshots/nomi-rive-eval/app-${q.replace(/\W/g, '_')}.png`,
});
if (await p.locator('[data-testid=rive-canvas]').count()) {
  const ok = await p.evaluate(() => globalThis.__nomiMascot?.playMotion('celebrate'));
  console.log('playMotion', ok);
  await p.waitForTimeout(900);
  await p.screenshot({ path: '/workspace/screenshots/nomi-rive-eval/app-rive-celebrate.png' });
}
console.log(logs.slice(0, 12).join('\n'));
await b.close();
