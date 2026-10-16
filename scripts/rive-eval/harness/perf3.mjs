/* eslint-disable -- evaluation harness, not shipped */
import { serve, launch } from './lib.mjs';
const [, , kind, secs = '8'] = process.argv;
const { srv, port } = serve();
const b = await launch();
const ctxp = await b.newContext({ viewport: { width: 480, height: 560 } });
const p = await ctxp.newPage();
const cdp = await ctxp.newCDPSession(p);
await cdp.send('Performance.enable');
const url =
  kind === 'canvas-rig'
    ? 'baseline.html'
    : `t3.html?rt=${process.env.RT || 'canvas'}&src=${kind}.riv&anim=spin`;
await p.goto(`http://localhost:${port}/${url}`);
await p.waitForFunction(
  kind === 'canvas-rig' ? 'window.ready===true' : 'window.ready===true',
  null,
  { timeout: 20000 },
);
if (kind === 'canvas-rig') await p.evaluate(() => window.startLoop('wave'));
else await p.evaluate(() => (window.frames = 0));
await p.waitForTimeout(1500);
const m = async () =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
  );
const m0 = await m();
const f0 = await p.evaluate(() => window.frames || 0);
const t0 = Date.now();
await p.waitForTimeout(+secs * 1000);
const m1 = await m();
const f1 = await p.evaluate(() => window.frames || 0);
const dt = (Date.now() - t0) / 1000;
const fr = f1 - f0;
console.log(
  JSON.stringify({
    kind,
    secs: dt.toFixed(1),
    frames: fr,
    fps: (fr / dt).toFixed(1),
    taskMsPerFrame: (((m1.TaskDuration - m0.TaskDuration) * 1000) / fr).toFixed(2),
    scriptMsPerFrame: (((m1.ScriptDuration - m0.ScriptDuration) * 1000) / fr).toFixed(2),
    jsHeapMB: (m1.JSHeapUsedSize / 1048576).toFixed(1),
  }),
);
await b.close();
srv.close();
