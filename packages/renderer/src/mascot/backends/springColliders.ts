import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
} from '@pixiv/three-vrm';
import * as THREE from 'three';

/**
 * 给弹簧骨骼（头发 / 裙子）补一组身体碰撞体：胸、腰臀、大腿、上臂。
 * 很多 VRM 只给头发配了头部碰撞体，裙子会穿过大腿、发梢会穿过胸口和手臂。
 * 半径按身高比例取（模型空间，身高≈1.5 时头 0.1）。返回移除函数。
 */
export function addBodySpringColliders(vrm: VRM, height: number): () => void {
  const mgr = vrm.springBoneManager;
  if (!mgr || !vrm.humanoid) return () => {};
  const k = height / 1.5;
  const raw = (n: VRMHumanBoneName) => vrm.humanoid!.getRawBoneNode(n);
  const colliders: VRMSpringBoneCollider[] = [];

  const sphere = (bone: VRMHumanBoneName, r: number, off = new THREE.Vector3()) => {
    const b = raw(bone);
    if (!b) return;
    const c = new VRMSpringBoneCollider(
      new VRMSpringBoneColliderShapeSphere({ radius: r * k, offset: off }),
    );
    b.add(c);
    colliders.push(c);
  };
  const capsule = (bone: VRMHumanBoneName, child: VRMHumanBoneName, r: number) => {
    const b = raw(bone);
    const c = raw(child);
    if (!b || !c) return;
    const col = new VRMSpringBoneCollider(
      new VRMSpringBoneColliderShapeCapsule({
        radius: r * k,
        offset: new THREE.Vector3(),
        tail: c.position.clone(), // 子骨骼在父骨骼局部空间的位置
      }),
    );
    b.add(col);
    colliders.push(col);
  };

  sphere('upperChest', 0.1);
  sphere('chest', 0.1);
  sphere('hips', 0.115, new THREE.Vector3(0, -0.02 * k, 0));
  capsule('leftUpperLeg', 'leftLowerLeg', 0.075);
  capsule('rightUpperLeg', 'rightLowerLeg', 0.075);
  capsule('leftUpperArm', 'leftLowerArm', 0.045);
  capsule('rightUpperArm', 'rightLowerArm', 0.045);

  const group = { colliders, name: 'companion-body' };
  for (const j of mgr.joints) j.colliderGroups.push(group);
  return () => {
    for (const j of mgr.joints) j.colliderGroups = j.colliderGroups.filter((g) => g !== group);
    for (const c of colliders) c.removeFromParent();
  };
}

/** 把旋转限制在离静止姿态（单位四元数）maxAngle 弧度以内：防止叠加层把脊柱 / 头扭到不自然 */
export function clampRotation(node: THREE.Object3D | null, maxAngle: number): void {
  if (!node) return;
  const q = node.quaternion;
  const w = Math.min(1, Math.abs(q.w));
  const angle = 2 * Math.acos(w);
  if (angle <= maxAngle) return;
  const id = new THREE.Quaternion();
  q.copy(id.slerp(q, maxAngle / angle));
}

/** 人体关节限位（弧度，相对规范化静止姿态的最大旋转角）。规范化 T-pose：手臂水平、腿竖直。 */
export const JOINT_LIMITS: Partial<Record<VRMHumanBoneName, number>> = {
  leftShoulder: 0.35,
  rightShoulder: 0.35,
  leftUpperArm: 2.3,
  rightUpperArm: 2.3,
  leftLowerArm: 2.5,
  rightLowerArm: 2.5,
  leftHand: 1.1,
  rightHand: 1.1,
  leftUpperLeg: 1.5,
  rightUpperLeg: 1.5,
  leftLowerLeg: 2.4,
  rightLowerLeg: 2.4,
  leftFoot: 0.8,
  rightFoot: 0.8,
};

/** 对给定的（规范化）骨骼应用 JOINT_LIMITS */
export function applyJointLimits(bone: (n: VRMHumanBoneName) => THREE.Object3D | null): void {
  for (const [name, max] of Object.entries(JOINT_LIMITS) as Array<[VRMHumanBoneName, number]>)
    clampRotation(bone(name), max);
}

const _h = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * 手不穿过头发 / 帽子：头部包一个“禁区”球（头骨上方，半径约为头宽 1.3 倍）。
 * 若手腕或手肘落进去，就把上臂绕前后轴往下 / 往外转一点，最多迭代 8 次。
 * 返回调整的次数（0 = 无需调整）。
 */
export function keepHandsOutOfHead(
  bone: (n: VRMHumanBoneName) => THREE.Object3D | null,
  radius: number,
): number {
  const head = bone('head');
  if (!head) return 0;
  head.updateWorldMatrix(true, false);
  head.getWorldPosition(_h);
  _h.y += radius * 0.45; // 头顶 / 发顶 / 帽子
  let fixes = 0;
  for (const [side, sign] of [
    ['left', 1],
    ['right', -1],
  ] as const) {
    const upper = bone(`${side}UpperArm` as VRMHumanBoneName);
    const lower = bone(`${side}LowerArm` as VRMHumanBoneName);
    const hand = bone(`${side}Hand` as VRMHumanBoneName);
    if (!upper || !hand) continue;
    for (let i = 0; i < 8; i += 1) {
      upper.updateWorldMatrix(true, true);
      const dHand = hand.getWorldPosition(_p).distanceTo(_h);
      const dElbow = lower ? lower.getWorldPosition(_p).distanceTo(_h) : Infinity;
      if (Math.min(dHand, dElbow) >= radius) break;
      // 规范化空间：左臂 +Z 转 = 向下，右臂 −Z 转 = 向下
      upper.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, sign * 0.12)));
      if (lower) lower.quaternion.slerp(_q.identity(), 0.25); // 小臂伸直一些，手离头更远
      fixes += 1;
    }
  }
  return fixes;
}
