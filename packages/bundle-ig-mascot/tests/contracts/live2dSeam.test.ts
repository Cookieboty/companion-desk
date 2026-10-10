import { describe, expect, it } from 'vitest';

import { Live2dSeamPlugin } from '../../src/plugins/Live2dSeamPlugin';
import { Live2dKey } from '../../src/seams/live2d';
import { createFakeCtx } from '../helpers/fakeCtx';
import { createFakeLive2dHost } from '../helpers/fakeLive2dHost';

describe('Live2dSeamPlugin', () => {
  it('provides Live2dService and starts without host', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey);
    expect(svc).toBeDefined();
    expect(svc!.hasHost()).toBe(false);
  });

  it('noop playMotion / setExpression when tolerateNoHost=true (default)', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    await expect(svc.playMotion('idle')).resolves.toBeUndefined();
    await expect(svc.setExpression('smile')).resolves.toBeUndefined();
    expect(ctx.logs.some((l) => l.level === 'warn' && l.msg.includes('no host'))).toBe(true);
  });

  it('throws when tolerateNoHost=false and no host attached', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, { tolerateNoHost: false });
    const svc = ctx.inject(Live2dKey)!;
    await expect(svc.playMotion('idle')).rejects.toThrow(/no host attached/);
  });

  it('attaches host and forwards playMotion/setExpression/driveLipSync/setParameter', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const host = createFakeLive2dHost();
    const detach = svc.attachHost(host);
    expect(svc.hasHost()).toBe(true);

    await svc.playMotion('idle', 0);
    await svc.setExpression('smile');
    svc.driveLipSync(0.42);
    svc.setParameter('ParamAngleX', 30);

    expect(host.record.playMotion).toEqual([{ group: 'idle', index: 0 }]);
    expect(host.record.setExpression).toEqual(['smile']);
    expect(host.record.driveLipSync).toEqual([0.42]);
    expect(host.record.setParameter).toEqual([{ id: 'ParamAngleX', value: 30 }]);

    detach();
    expect(svc.hasHost()).toBe(false);
  });

  it('clamps driveLipSync rms into [0, 1]', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const host = createFakeLive2dHost();
    svc.attachHost(host);

    svc.driveLipSync(-5);
    svc.driveLipSync(999);
    svc.driveLipSync(Number.NaN);
    svc.driveLipSync(0.5);
    expect(host.record.driveLipSync).toEqual([0, 1, 0, 0.5]);
  });

  it('forwards host events (touch / motion:end) to on(evt) listeners', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const host = createFakeLive2dHost();
    svc.attachHost(host);

    const touches: unknown[] = [];
    const ends: unknown[] = [];
    svc.on('touch', (p) => touches.push(p));
    svc.on('motion:end', (p) => ends.push(p));

    host.emit('touch', { hitArea: 'Head', at: 1_000 });
    host.emit('motion:end', { group: 'idle', index: 0 });

    expect(touches).toEqual([{ hitArea: 'Head', at: 1_000 }]);
    expect(ends).toEqual([{ group: 'idle', index: 0 }]);
  });

  it('replaces host on double attachHost and detaches old one', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const h1 = createFakeLive2dHost();
    const h2 = createFakeLive2dHost();
    svc.attachHost(h1);
    svc.attachHost(h2);

    const received: unknown[] = [];
    svc.on('touch', (p) => received.push(p));
    h1.emit('touch', { hitArea: 'H1', at: 1 });
    h2.emit('touch', { hitArea: 'H2', at: 2 });

    expect(received).toEqual([{ hitArea: 'H2', at: 2 }]);
    expect(ctx.logs.some((l) => l.msg.includes('replacing'))).toBe(true);
  });

  it('swallows host errors in playMotion/setExpression with warn log', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const host = createFakeLive2dHost();
    svc.attachHost(host);
    host.fail('playMotion', new Error('boom'));

    await expect(svc.playMotion('idle')).resolves.toBeUndefined();
    expect(ctx.logs.some((l) => l.level === 'warn' && l.msg.includes('playMotion failed'))).toBe(
      true,
    );
  });
});
