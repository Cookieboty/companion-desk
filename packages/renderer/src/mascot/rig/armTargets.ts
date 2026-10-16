/**
 * Hand targets — ELBOW_S=320 / HAND_S=560 (upper slightly longer than fore), elbow ≤110°.
 * Rigid upper/fore pieces + elbow cap; no continuous-mesh rubber-hose at the hinge.
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
  waveOut: { hand: 'wave', t: [750, 300], angle: 0, z: 0.15, elbow: 1, hint: [55, 95] },
  waveUp: { hand: 'wave', t: [750, 300], angle: 0, z: 0.15, elbow: 1, hint: [55, 95] },
  waveHigh: { hand: 'wave', t: [750, 270], angle: 0, z: 0.2, elbow: 1, hint: [60, 95] },
  fistUp: { hand: 'fist', t: [740, 320], angle: 0, z: 0.2, elbow: 1, hint: [55, 100] },
  fistLow: { hand: 'fist', t: [730, 330], angle: 0, z: 0.2, elbow: 1, hint: [50, 100] },
  peaceUp: { hand: 'peace', t: [740, 300], angle: 0, z: 0.2, elbow: 1, hint: [55, 100] },
  okSide: { hand: 'ok', t: [750, 300], angle: 0, z: 0.15, elbow: 1, hint: [55, 100] },
  thumb: { hand: 'thumbsup', t: [750, 300], angle: 0, z: 0.2, elbow: 1, hint: [55, 100] },
  thumbChest: { hand: 'thumbsup', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  point: { hand: 'point', t: [750, 300], angle: 0, z: 0.15, elbow: 1, hint: [55, 100] },
  pointUp: { hand: 'point', t: [720, 260], angle: 4, z: 0.25, elbow: 1, hint: [65, 100] },
  surprise: { hand: 'wave', t: [750, 300], angle: 0, z: 0.15, elbow: 1, hint: [55, 95] },
  shrug: { hand: 'rest', t: [750, 300], angle: 15, z: 0.15, elbow: 1, hint: [55, 95] },
  chin: { hand: 'rest', t: at(LM.chinR, 8, 20), angle: 18, z: 0.4, elbow: -1, hint: [-40, -100] },
  chinThink: { hand: 'rest', t: at(LM.chinR, 12, 12), angle: 24, z: 0.4, elbow: -1, hint: [-40, -100] },
  cheek: { hand: 'rest', t: at(LM.cheekR, 6, 36), angle: -10, z: 0.45, elbow: -1, hint: [-40, -100] },
  cheekPaw: { hand: 'fist', t: at(LM.cheekR, 4, 44), angle: -16, z: 0.45, elbow: -1, hint: [-40, -100] },
  hairTouch: { hand: 'rest', t: [640, 260], angle: -15, z: 0.3, elbow: 1, hint: [70, 100] },
  temple: { hand: 'rest', t: at(LM.templeR, 4, 16), angle: 25, z: 0.35, hint: [95, 85] },
  visor: { hand: 'rest', t: [590, 250], angle: -45, z: 0.35, hint: [105, 105] },
  coverFace: { hand: 'rest', t: [520, 340], angle: -8, z: 0.45, hint: [-40, -100] },
  mouth: { hand: 'rest', t: at(LM.mouth, 45, 28), angle: -30, z: 0.45, elbow: -1, hint: [-20, -100] },
  blowOut: { hand: 'rest', t: [670, 340], angle: 25, z: 0.3, hint: [55, 100] },
  chest: { hand: 'chest', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  heart: { hand: 'rest', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  sorry: { hand: 'rest', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  type: { hand: 'rest', t: [600, 360], angle: -10, z: 0.25, elbow: 1, hint: [80, 100] },
  clap: { hand: 'rest', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  pray: { hand: 'prayer', t: [580, 340], angle: -20, z: 0.35, elbow: -1, hint: [-50, -100] },
  stretchUp: { hand: 'rest', t: [640, 180], angle: -8, z: 0.15, elbow: 1, hint: [120, 85] },
};
