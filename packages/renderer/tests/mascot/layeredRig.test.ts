import { describe, expect, it } from 'vitest';

import { createSpriteBackend, type SpriteManifest } from '../../src/mascot/backends/sprite';
import { EXPRESSION_STYLES, RigAnimator, type RigInput } from '../../src/mascot/layeredRig';

const base: RigInput = {
  expression: 'neutral',
  mouth: 0,
  talking: false,
  blink: 0,
  lookX: 0,
  lookY: 0,
};

function run(anim: RigAnimator, input: Partial<RigInput>, secs = 1, t0 = 0) {
  let pose = anim.step(1 / 60, t0, { ...base, ...input });
  for (let i = 1; i < secs * 60; i++) pose = anim.step(1 / 60, t0 + i / 60, { ...base, ...input });
  return pose;
}

describe('layered rig animator', () => {
  it('maps every mascot emotion to a style', () => {
    for (const e of [
      'neutral',
      'happy',
      'relaxed',
      'sad',
      'angry',
      'surprised',
      'talking',
      'blink',
    ]) {
      expect(EXPRESSION_STYLES[e]).toBeDefined();
    }
  });

  it('breathes and sways in idle, but not with reduced motion', () => {
    const a = new RigAnimator();
    const ys = [0.2, 0.6, 1.0, 1.4].map((t) => a.step(1 / 60, t, base).bodyY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
    const r = new RigAnimator();
    const rs = [0.2, 0.6, 1.0].map((t) => r.step(1 / 60, t, { ...base, reducedMotion: true }));
    expect(rs.every((p) => p.bodyY === 0 && p.hairRotL === 0)).toBe(true);
  });

  it('closes eyes on blink and shows the lid line', () => {
    const p = run(new RigAnimator(), { blink: 1 }, 0.5);
    expect(p.eyeOpen).toBeLessThan(0.1);
    expect(p.lidAlpha).toBeGreaterThan(0.9);
  });

  it('follows the cursor with head + extra feature parallax', () => {
    const p = run(new RigAnimator(), { lookX: 1, lookY: 0 }, 2);
    expect(p.headX).toBeGreaterThan(5);
    expect(p.featX).toBeGreaterThan(2);
    expect(p.headRot).toBeGreaterThan(0);
  });

  it('opens the mouth while talking', () => {
    const p = run(new RigAnimator(), { talking: true, mouth: 0.8 }, 0.5);
    expect(p.mouthVariant).toBe('open');
    expect(p.mouthOpen).toBeGreaterThan(0.5);
    const q = run(new RigAnimator(), {}, 0.5);
    expect(q.mouthVariant).toBe('closed');
  });

  it('expressions change variants / tint', () => {
    expect(run(new RigAnimator(), { expression: 'happy' }).eyeVariant).toBe('happy');
    expect(run(new RigAnimator(), { expression: 'surprised' }).mouthVariant).toBe('o');
    const sad = run(new RigAnimator(), { expression: 'sad' }, 2);
    expect(sad.mouthVariant).toBe('frown');
    expect(sad.tint.a).toBeGreaterThan(0.05);
    expect(run(new RigAnimator(), { expression: 'angry' }, 2).angerMark).toBeGreaterThan(0.5);
  });

  it('hair lags behind head motion (secondary motion)', () => {
    const a = new RigAnimator();
    run(a, { lookX: -1 }, 1);
    const p = a.step(1 / 60, 1.01, { ...base, lookX: 1 });
    const p2 = run(a, { lookX: 1 }, 0.15, 1.02);
    expect(Math.abs(p2.hairRotL - p.hairRotL)).toBeGreaterThan(0.001);
  });
});

describe('sprite backend with rig', () => {
  const manifest: SpriteManifest = {
    id: 'rig',
    displayName: 'Rig',
    style: 'soft',
    license: 'MIT',
    author: 't',
    expressions: { neutral: 'neutral.png' },
    rig: { size: [10, 10], anchors: {}, layers: { body: [0, 0], head: [0, 0] } },
  };
  it('keeps emotion names and exposes talking/mouth', () => {
    const b = createSpriteBackend(manifest, '/x/');
    b.setExpression('angry');
    b.setTalking(true);
    b.setMouthOpen(0.7);
    b.update(0.1, 0.1);
    const s = b.snapshot();
    expect(s.expression).toBe('angry');
    expect(s.talking).toBe(true);
    expect(s.mouth).toBeGreaterThan(0.3);
    expect(b.capabilities().lipSync).toBe(true);
    b.setExpression('blink');
    b.update(0.05, 0.2);
    expect(b.snapshot().blinkOpacity).toBeGreaterThan(0);
  });
});
