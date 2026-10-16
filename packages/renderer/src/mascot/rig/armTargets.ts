/**
 * Hand targets of every arm pose used by the action library, in rig px (see armReach.ts).
 *
 * Each entry names a pose for the screen-RIGHT arm (`r`, the character's left arm); the opposite arm
 * gets the mirrored target (x about the body centre line, fingers angle negated), which solves to the
 * same joint numbers. `scripts/mascot/gen-arm-poses.mjs` solves them with the same chain the mesh draws
 * and writes armPoses.generated.ts; tests/mascot/armReach.test.ts re-solves them and fails when the
 * generated table is stale or a hand misses its target.
 *
 *   hand   hand piece (see manifest rig.hands)
 *   t      hand-centre target (palm centre)
 *   angle  fingers direction, degrees clockwise from straight up (preference, nearest feasible is used)
 *   z      reach toward the camera 0..1 (foreshortening)
 *   elbow  +1 forearm keeps turning outward / up, −1 folds across the body
 */
import { LM } from './armReach';

export interface ArmTarget {
  hand: string;
  t: readonly [number, number];
  angle: number;
  z: number;
  elbow?: 1 | -1;
  hint?: readonly [number, number];
}

const at = (p: readonly [number, number], dx = 0, dy = 0): [number, number] => [
  p[0] + dx,
  p[1] + dy,
];

export const ARM_TARGETS: Record<string, ArmTarget> = {
  // --- raised hands beside the head (waves, cheers, peace, ok)
  waveOut: { hand: 'wave', t: [790, 400], angle: 8, z: 0.2, elbow: 1, hint: [30, 165] },
  waveUp: { hand: 'wave', t: [790, 330], angle: 6, z: 0.3, elbow: 1, hint: [45, 163] },
  waveHigh: { hand: 'wave', t: [800, 300], angle: 10, z: 0.3, elbow: 1, hint: [55, 165] },
  fistUp: { hand: 'fist', t: [770, 380], angle: 4, z: 0.3, elbow: 1, hint: [40, 165] },
  fistLow: { hand: 'fist', t: [760, 470], angle: 8, z: 0.3, elbow: 1, hint: [25, 160] },
  peaceUp: { hand: 'peace', t: [775, 360], angle: 8, z: 0.3, elbow: 1, hint: [40, 165] },
  okSide: { hand: 'ok', t: [780, 430], angle: 6, z: 0.25, elbow: 1, hint: [30, 165] },
  thumb: { hand: 'thumbsup', t: [770, 480], angle: 0, z: 0.3, elbow: 1, hint: [25, 165] },
  thumbChest: {
    hand: 'thumbsup',
    t: at(LM.heartR, 36, -24),
    angle: -10,
    z: 0.5,
    elbow: -1,
    hint: [50, -150],
  },
  point: { hand: 'point', t: [780, 400], angle: 8, z: 0.3, elbow: 1, hint: [30, 160] },
  pointUp: { hand: 'point', t: [720, 300], angle: 4, z: 0.4, elbow: 1, hint: [70, 150] },
  surprise: { hand: 'wave', t: [790, 440], angle: 12, z: 0.3, elbow: 1, hint: [30, 160] },
  shrug: { hand: 'rest', t: [800, 470], angle: 30, z: 0.2, elbow: 1, hint: [30, 155] },
  // --- hand to the face
  chin: { hand: 'rest', t: at(LM.chinR, 6, 18), angle: 18, z: 0.6, elbow: -1, hint: [-40, -130] },
  chinThink: {
    hand: 'rest',
    t: at(LM.chinR, 12, 8),
    angle: 28,
    z: 0.6,
    elbow: -1,
    hint: [-40, -130],
  },
  cheek: {
    hand: 'rest',
    t: at(LM.cheekR, 6, 36),
    angle: -14,
    z: 0.65,
    elbow: -1,
    hint: [-35, -140],
  },
  cheekPaw: {
    hand: 'fist',
    t: at(LM.cheekR, 4, 54),
    angle: -20,
    z: 0.65,
    elbow: -1,
    hint: [-35, -140],
  },
  hairTouch: { hand: 'rest', t: at(LM.hairR, -4, 6), angle: -24, z: 0.6, hint: [100, 120] },
  temple: { hand: 'rest', t: at(LM.templeR, 18, -4), angle: 62, z: 0.55, hint: [105, 100] },
  visor: { hand: 'rest', t: [596, 222], angle: -75, z: 0.55, hint: [110, 160] },
  coverFace: { hand: 'rest', t: [508, 330], angle: -8, z: 0.7, hint: [-40, -130] },
  mouth: {
    hand: 'rest',
    t: at(LM.mouth, 66, 20),
    angle: -50,
    z: 0.65,
    elbow: -1,
    hint: [-20, -150],
  },
  blowOut: { hand: 'rest', t: [690, 340], angle: 52, z: 0.5, hint: [60, 130] },
  // --- hand to the body
  chest: {
    hand: 'chest',
    t: at(LM.heartR, 14, 14),
    angle: -72,
    z: 0.5,
    elbow: -1,
    hint: [10, -150],
  },
  heart: { hand: 'rest', t: at(LM.heartR, 18, 6), angle: -60, z: 0.5, elbow: -1, hint: [10, -150] },
  sorry: { hand: 'rest', t: [530, 660], angle: -40, z: 0.45, elbow: -1, hint: [10, -100] },
  type: { hand: 'rest', t: [560, 700], angle: -62, z: 0.4, elbow: -1, hint: [20, -110] },
  clap: { hand: 'rest', t: [500, 580], angle: -74, z: 0.5, elbow: -1, hint: [0, -150] },
  pray: { hand: 'prayer', t: [488, 540], angle: -7, z: 0.5, elbow: -1, hint: [-20, -80] },
  // --- overhead
  stretchUp: { hand: 'rest', t: [640, 150], angle: -8, z: 0.2, elbow: 1, hint: [140, 100] },
};
