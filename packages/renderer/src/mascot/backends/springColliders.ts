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
