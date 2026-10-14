import {
  anchorOnBoxChange,
  shouldFallAtStart,
  step,
  type BodyState,
  type PhysicsEnv,
} from '../../../src/mascot/desktopPhysics';

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const box = { left: 100, right: 300, top: 50, bottom: 400 };
const env = (o: Partial<PhysicsEnv> = {}): PhysicsEnv => ({
  workAreas: [AREA],
  box,
  gravity: true,
  ...o,
});
const standing = (o: Partial<BodyState> = {}): BodyState => ({
  x: 500,
  y: 1040 - 400,
  vx: 0,
  vy: 0,
  mode: 'idle',
  ...o,
});

describe('gravity triggers', () => {
  it('idle on the floor stays put when the box shrinks a little (animation) — no re-fall', () => {
    const smaller = { ...box, bottom: 390 };
    let s = standing();
    for (let i = 0; i < 120; i += 1) s = step(s, 1 / 120, env({ box: smaller })).state;
    expect(s.mode).toBe('idle');
    expect(s.y + smaller.bottom).toBeCloseTo(1040, 5);
  });

  it('anchorOnBoxChange keeps the feet on the floor', () => {
    const next = { ...box, bottom: 380 };
    const s = anchorOnBoxChange(standing(), box, next, [AREA]);
    expect(s.y + next.bottom).toBe(1040);
    expect(s.mode).toBe('idle');
  });

  it('anchorOnBoxChange ignores airborne / held bodies', () => {
    const held = standing({ mode: 'held', y: 100 });
    expect(anchorOnBoxChange(held, box, { ...box, bottom: 380 }, [AREA])).toBe(held);
  });

  it('falls at start only when clearly off the floor', () => {
    expect(shouldFallAtStart(standing({ y: 1040 - 400 - 10 }), env())).toBe(false);
    expect(shouldFallAtStart(standing({ y: 200 }), env())).toBe(true);
    expect(shouldFallAtStart(standing({ y: 200 }), env({ gravity: false }))).toBe(false);
  });

  it('a real gap (e.g. walked off a taller display) still makes her fall', () => {
    const s = step(standing({ y: 300 }), 1 / 120, env()).state;
    expect(s.mode).toBe('falling');
  });
});
