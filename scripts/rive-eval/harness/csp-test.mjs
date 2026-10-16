/* eslint-disable -- evaluation harness, not shipped */
import { serve, launch } from './lib.mjs';
const { srv, port } = serve();
const b = await launch();
for (const v of ['strict', 'wasm']) {
  const p = await b.newPage();
  const errs = [];
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 160));
  });
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)));
  await p.goto(`http://localhost:${port}/t4-${v}.html?rt=canvas-lite`);
  await p
    .waitForFunction('window.ready===true||window.failed===true', null, { timeout: 8000 })
    .catch(() => {});
  console.log(
    v,
    JSON.stringify(
      await p.evaluate(() => ({ ready: window.ready, failed: window.failed, log: window.__log })),
    ),
    errs.filter((e) => !e.includes('404')).slice(0, 3),
  );
  await p.close();
}
await b.close();
srv.close();
