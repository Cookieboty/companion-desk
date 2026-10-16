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
  waveOut: { hand: 'wave', t: [780, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  waveUp: { hand: 'wave', t: [780, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  waveHigh: { hand: 'wave', t: [775, 290], angle: 0, z: 0.3, elbow: 1, hint: [55, 115] },
  fistUp: { hand: 'fist', t: [775, 330], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  fistLow: { hand: 'fist', t: [770, 345], angle: 0, z: 0.3, elbow: 1, hint: [40, 115] },
  peaceUp: { hand: 'peace', t: [775, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  okSide: { hand: 'ok', t: [780, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  thumb: { hand: 'thumbsup', t: [780, 325], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  thumbChest: { hand: 'thumbsup', t: [496, 560], angle: -10, z: 0.5, elbow: -1, hint: [0, -150] },
  point: { hand: 'point', t: [780, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  pointUp: { hand: 'point', t: [760, 280], angle: 4, z: 0.3, elbow: 1, hint: [55, 115] },
  surprise: { hand: 'wave', t: [780, 320], angle: 0, z: 0.3, elbow: 1, hint: [45, 115] },
  shrug: { hand: 'rest', t: [780, 320], angle: 15, z: 0.3, elbow: 1, hint: [45, 115] },
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
  chest: { hand: 'chest', t: [490, 580], angle: -72, z: 0.5, elbow: -1, hint: [0, -150] },
  heart: { hand: 'rest', t: [490, 570], angle: -60, z: 0.5, elbow: -1, hint: [0, -150] },
  sorry: { hand: 'rest', t: [490, 650], angle: -40, z: 0.45, elbow: -1, hint: [0, -100] },
  type: { hand: 'rest', t: [495, 700], angle: -62, z: 0.4, elbow: -1, hint: [0, -110] },
  clap: { hand: 'rest', t: [500, 580], angle: -74, z: 0.5, elbow: -1, hint: [0, -150] },
  pray: { hand: 'prayer', t: [488, 540], angle: -7, z: 0.5, elbow: -1, hint: [-20, -80] },
  stretchUp: { hand: 'rest', t: [640, 180], angle: -8, z: 0.15, elbow: 1, hint: [120, 85] },
};
