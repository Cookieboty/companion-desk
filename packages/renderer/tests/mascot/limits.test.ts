import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { clampRotation, JOINT_LIMITS, keepHandsOutOfHead } from '@/mascot/backends/springColliders';

/** 极简规范化骨架：hips → chest → head；chest → 左 / 右上臂 → 小臂 → 手（T-pose） */
function rig() {
  const mk = (x: number, y: number, parent?: THREE.Object3D) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, 0);
    parent?.add(o);
    return o;
  };
  const hips = mk(0, 1);
  const chest = mk(0, 0.3, hips);
  const head = mk(0, 0.3, chest);
  const bones: Record<string, THREE.Object3D> = { hips, chest, head };
  for (const [side, s] of [
    // 与运行时一致：左臂在 −X（左臂绕 +Z 转 = 放下）
    ['left', -1],
    ['right', 1],
  ] as const) {
    const up = mk(0.15 * s, 0.2, chest);
    const lo = mk(0.28 * s, 0, up);
    const hand = mk(0.25 * s, 0, lo);
    Object.assign(bones, {
      [`${side}UpperArm`]: up,
      [`${side}LowerArm`]: lo,
      [`${side}Hand`]: hand,
    });
  }
  hips.updateMatrixWorld(true);
  return (n: string) => bones[n] ?? null;
}

describe('joint limits', () => {
  it('clampRotation caps the angle from rest', () => {
    const o = new THREE.Object3D();
    o.quaternion.setFromEuler(new THREE.Euler(0, 0, 3));
    clampRotation(o, 1);
    expect(2 * Math.acos(Math.abs(o.quaternion.w))).toBeCloseTo(1, 4);
  });

  it('limits exist for shoulders, arms, legs, hands', () => {
    for (const b of [
      'leftShoulder',
      'rightUpperArm',
      'leftLowerArm',
      'rightHand',
      'leftUpperLeg',
      'rightLowerLeg',
    ])
      expect(JOINT_LIMITS[b as keyof typeof JOINT_LIMITS]).toBeGreaterThan(0);
  });

  it('arms raised straight up over the head are pushed out of the head zone', () => {
    const bone = rig();
    // 双臂竖直举过头顶，小臂向内收：手落在头顶上
    bone('leftUpperArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, -1.45));
    bone('leftLowerArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, -0.6));
    bone('rightUpperArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, 1.45));
    bone('rightLowerArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, 0.6));
    const fixes = keepHandsOutOfHead(bone as never, 0.4);
    expect(fixes).toBeGreaterThan(0);
    const head = bone('head')!.getWorldPosition(new THREE.Vector3());
    head.y += 0.4 * 0.45;
    for (const s of ['left', 'right']) {
      bone(`${s}UpperArm`)!.updateWorldMatrix(true, true);
      expect(
        bone(`${s}Hand`)!.getWorldPosition(new THREE.Vector3()).distanceTo(head),
      ).toBeGreaterThanOrEqual(0.4 - 1e-6);
    }
  });

  it('leaves a relaxed pose untouched', () => {
    const bone = rig();
    bone('leftUpperArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, 1.2));
    bone('rightUpperArm')!.quaternion.setFromEuler(new THREE.Euler(0, 0, -1.2));
    expect(keepHandsOutOfHead(bone as never, 0.2)).toBe(0);
  });
});
