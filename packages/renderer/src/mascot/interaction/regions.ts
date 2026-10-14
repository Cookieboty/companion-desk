/**
 * 身体区域碰撞体：用骨骼位置生成简化球体（头 / 脸 / 身体 / 手 / 裙子 / 腿），
 * 光标射线与之求交得到触摸区域。纯数学，不依赖 three 的网格射线（蒙皮网格逐顶点求交太贵）。
 */

export type BodyRegion = 'face' | 'head' | 'body' | 'hands' | 'skirt' | 'legs';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SphereCollider {
  region: BodyRegion;
  center: Vec3;
  radius: number;
}

/** 骨骼 → 区域（VRM 规范化骨骼名） */
export const BONE_REGIONS: Record<string, BodyRegion> = {
  head: 'head',
  neck: 'head',
  chest: 'body',
  upperChest: 'body',
  spine: 'body',
  leftShoulder: 'body',
  rightShoulder: 'body',
  leftUpperArm: 'body',
  rightUpperArm: 'body',
  leftLowerArm: 'hands',
  rightLowerArm: 'hands',
  leftHand: 'hands',
  rightHand: 'hands',
  hips: 'skirt',
  leftUpperLeg: 'skirt',
  rightUpperLeg: 'skirt',
  leftLowerLeg: 'legs',
  rightLowerLeg: 'legs',
  leftFoot: 'legs',
  rightFoot: 'legs',
};

export function regionForBone(bone: string): BodyRegion | null {
  return BONE_REGIONS[bone] ?? null;
}

/** 射线与球求交：返回最近的正距离，未命中返回 null。dir 需为单位向量。 */
export function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? t1 : null;
}

/** 最近命中的区域；脸与头重叠时脸在前，自然先命中 */
export function pickRegion(
  o: Vec3,
  d: Vec3,
  colliders: SphereCollider[],
): { region: BodyRegion; distance: number } | null {
  let best: { region: BodyRegion; distance: number } | null = null;
  for (const c of colliders) {
    const t = raySphere(o, d, c.center, c.radius);
    if (t !== null && (!best || t < best.distance)) best = { region: c.region, distance: t };
  }
  return best;
}

/**
 * 由骨骼世界坐标生成碰撞体。
 * forward = 角色正面朝向（世界坐标，单位向量），height = 角色身高（米），用于按比例给半径。
 */
export function buildColliders(
  bones: Partial<Record<string, Vec3>>,
  forward: Vec3,
  height: number,
): SphereCollider[] {
  const out: SphereCollider[] = [];
  const s = height / 1.5; // 以 1.5m 的 VRoid 角色为基准
  const add = (
    region: BodyRegion,
    p: Vec3 | undefined,
    r: number,
    off: Vec3 = { x: 0, y: 0, z: 0 },
  ) => {
    if (p)
      out.push({
        region,
        radius: r * s,
        center: { x: p.x + off.x * s, y: p.y + off.y * s, z: p.z + off.z * s },
      });
  };
  const head = bones.head;
  if (head) {
    // 脸：头骨前下方的小球；头顶：头骨上方的大球（摸头）
    add('face', head, 0.075, { x: forward.x * 0.06, y: 0.06, z: forward.z * 0.06 });
    add('head', head, 0.12, { x: -forward.x * 0.02, y: 0.13, z: -forward.z * 0.02 });
  }
  add('body', bones.upperChest ?? bones.chest, 0.13);
  add('body', bones.spine, 0.12);
  for (const side of ['left', 'right']) {
    add('hands', bones[`${side}Hand`], 0.06);
    add('hands', bones[`${side}LowerArm`], 0.05);
    add('body', bones[`${side}UpperArm`], 0.05);
    add('legs', bones[`${side}LowerLeg`], 0.07);
    add('legs', bones[`${side}Foot`], 0.06);
  }
  // 裙子：髋部下方
  add('skirt', bones.hips, 0.15, { x: 0, y: -0.08, z: 0 });
  return out;
}
