import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

import { buildColliders, type SphereCollider, type Vec3 } from '../interaction/regions';
import {
  dampedSpring,
  inertiaGravity,
  lowpass,
  NECK_LIMITS,
  squashAt,
} from '../interaction/springs';
import type { MascotBackend, MascotCapabilities } from '../MascotBackend';
import { MASCOT_EXPRESSIONS } from '../MascotBackend';
import type { MotionController } from '../motion/MotionController';

const EMOTIONS = MASCOT_EXPRESSIONS.filter((e) => e !== 'neutral');

/** 指数平滑：每秒向目标逼近 rate 倍。 */
function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export interface VrmBackend extends MascotBackend {
  /** 每帧由 VRMCharacterController 的 useFrame 调用 */
  update(dt: number, elapsed: number): void;
  /** 动作库加载完成后挂上动画管理器（之前用程序化站姿兜底） */
  attachMotions(motions: MotionController): void;
  /** 窗口运动状态（主进程物理 / 拖拽） */
  setBodyMotion(m: BodyMotion): void;
  /** 落地：压扁回弹，impact = 落地速度 px/s */
  land(impact: number): void;
  /** 当前身体区域碰撞体（世界坐标） */
  colliders(): SphereCollider[];
  /** 头部世界坐标（视线计算用） */
  headWorld(): Vec3 | null;
}

export interface BodyMotion {
  mode: 'idle' | 'held' | 'falling' | 'walking';
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

type HB = Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0];

/**
 * three-vrm 实现：
 * - 口型：`aa` 主导 + `oh` 随时间轻微混合，避免机械开合
 * - 表情：目标权重平滑过渡，情绪表情互斥
 * - 眨眼：2.5~6s 随机间隔；情绪 happy（闭眼笑）时不再叠加眨眼
 * - 身体：有动作库时由 MotionController 驱动（idle 循环 / 手势），否则程序化站姿 + 呼吸
 * - 头部轻微摆动叠加在动画之上；视线跟随 lookAt 目标
 */
export interface VrmBackendOptions {
  /** 通用表情名 → 模型表情名（用户导入模型的映射，如 happy → Joy） */
  expressionMap?: Record<string, string>;
}

export function createVrmBackend(
  vrm: VRM,
  scene: THREE.Object3D,
  opts: VrmBackendOptions = {},
): VrmBackend {
  const em = vrm.expressionManager;
  // VRoid 0.x 模型的自定义表情名大小写不统一（如 'Surprised'）：按不区分大小写解析
  const keys = em ? Object.keys(em.expressionMap) : [];
  const resolve = (name: string) => {
    const mapped = opts.expressionMap?.[name] ?? name;
    return keys.find((k) => k.toLowerCase() === mapped.toLowerCase()) ?? mapped;
  };
  const has = (name: string) => !!em?.getExpression(resolve(name));

  const weights = new Map<string, number>();
  const targets = new Map<string, number>();
  let mouthTarget = 0;
  let mouth = 0;
  let blinkT = -1;
  let nextBlinkAt = 2 + Math.random() * 3;

  const lookTarget = new THREE.Object3D();
  const lookGoal = new THREE.Vector3(0, 1.35, 3);
  lookTarget.position.copy(lookGoal);
  scene.add(lookTarget);
  if (vrm.lookAt) vrm.lookAt.target = lookTarget;

  const bone = (n: HB) => vrm.humanoid?.getNormalizedBoneNode(n) ?? null;
  // 原始骨骼（世界坐标准确）；测试替身可能没有该方法
  const rawBone = (n: HB) => vrm.humanoid?.getRawBoneNode?.(n) ?? null;
  const spine = bone('spine');
  const chest = bone('chest') ?? bone('upperChest');
  const neck = bone('neck');
  const lUpper = bone('leftUpperArm');
  const rUpper = bone('rightUpperArm');
  const head = bone('head');
  const lLeg = bone('leftUpperLeg');
  const rLeg = bone('rightUpperLeg');
  const lKnee = bone('leftLowerLeg');
  const rKnee = bone('rightLowerLeg');
  const lFore = bone('leftLowerArm');
  const rFore = bone('rightLowerArm');

  // ---- 互动状态 ----
  let body: BodyMotion = { mode: 'idle', vx: 0, vy: 0, ax: 0, ay: 0 };
  let dangle = 0; // 悬空姿态权重 0..1
  let lean = 0;
  let facing = 0; // 漫步时侧身角度
  let accX = 0;
  let accY = 0;
  let squashT = -1;
  let squashImpact = 0;
  let yaw = { x: 0, v: 0 };
  let pitch = { x: 0, v: 0 };
  const lookNorm = { x: 0, y: 0 };
  const baseScale = vrm.scene.scale.clone();
  const baseRotY = vrm.scene.rotation.y; // VRM 0.x 经 rotateVRM0 后为 π
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  let talkingBase = false;
  // 弹簧骨骼原始重力（拖拽惯性在此基础上叠加）
  const joints = [...(vrm.springBoneManager?.joints ?? [])].map((j) => ({
    j,
    dir: j.settings.gravityDir.clone(),
    power: j.settings.gravityPower,
  }));
  // 身高：用于碰撞体比例
  vrm.scene.updateMatrixWorld?.(true);
  const headY = rawBone('head')?.getWorldPosition(new THREE.Vector3()).y ?? 1.35;
  const height = Math.max(0.6, headY + 0.12);
  const COLLIDER_BONES: HB[] = [
    'head',
    'neck',
    'chest',
    'upperChest',
    'spine',
    'hips',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
    'leftLowerLeg',
    'rightLowerLeg',
    'leftFoot',
    'rightFoot',
  ];

  /** 把骨骼当前旋转向目标欧拉角混合 w */
  const blendTo = (node: THREE.Object3D | null, x: number, y: number, z: number, w: number) => {
    if (!node || w <= 0) return;
    tmpQ.setFromEuler(tmpE.set(x, y, z));
    node.quaternion.slerp(tmpQ, Math.min(1, w));
  };
  const addRot = (node: THREE.Object3D | null, x: number, y: number, z: number) => {
    if (!node) return;
    node.quaternion.multiply(tmpQ.setFromEuler(tmpE.set(x, y, z)));
  };
  const wantBase = () => (body.mode === 'walking' ? 'walk' : talkingBase ? 'talk' : 'idle');
  // 自然站姿：放下 T-pose 的手臂
  if (lUpper) lUpper.rotation.z = 1.2;
  if (rUpper) rUpper.rotation.z = -1.2;

  let motions: MotionController | null = null;
  const sway = new THREE.Quaternion();
  const swayEuler = new THREE.Euler();

  const set = (name: string, v: number) => {
    if (em && has(name)) em.setValue(resolve(name), v);
  };

  const backend: VrmBackend = {
    kind: 'vrm',
    setExpression(name, weight = 1) {
      for (const e of EMOTIONS) targets.set(e, 0);
      if (name !== 'neutral') targets.set(name, Math.max(0, Math.min(1, weight)));
    },
    setMouthOpen(value) {
      mouthTarget = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    },
    lookAt(x, y) {
      const cx = Math.max(-1, Math.min(1, x));
      const cy = Math.max(-1, Math.min(1, y));
      lookNorm.x = cx;
      lookNorm.y = cy;
      lookGoal.set(cx * 1.5, headY + cy * 0.8, 3);
    },
    blink() {
      blinkT = 0;
    },
    playMotion(name) {
      return motions?.play(name) ?? false;
    },
    setTalking(talking) {
      talkingBase = talking;
      motions?.setBase(wantBase());
    },
    setBodyMotion(m) {
      const prev = body.mode;
      body = m;
      if (prev !== m.mode && (prev === 'walking' || m.mode === 'walking'))
        motions?.setBase(wantBase());
    },
    land(impact) {
      squashT = 0;
      squashImpact = impact;
    },
    colliders() {
      const pts: Partial<Record<string, Vec3>> = {};
      for (const b of COLLIDER_BONES) {
        const n = rawBone(b);
        if (n) {
          n.getWorldPosition(tmpV);
          pts[b] = { x: tmpV.x, y: tmpV.y, z: tmpV.z };
        }
      }
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(vrm.scene.getWorldQuaternion(tmpQ));
      return buildColliders(
        pts,
        { x: f.x, y: f.y, z: f.z },
        height * vrm.scene.getWorldScale(tmpV).y,
      );
    },
    headWorld() {
      const n = rawBone('head');
      if (!n) return null;
      n.getWorldPosition(tmpV);
      return { x: tmpV.x, y: tmpV.y, z: tmpV.z };
    },
    attachMotions(m) {
      motions?.dispose();
      motions = m;
    },
    capabilities(): MascotCapabilities {
      return {
        expressions: em ? Object.keys(em.expressionMap) : [],
        lipSync: has('aa'),
        lookAt: !!vrm.lookAt,
        blink: has('blink'),
        motions: motions?.names() ?? [],
      };
    },
    dispose() {
      for (const { j, dir, power } of joints) {
        j.settings.gravityDir.copy(dir);
        j.settings.gravityPower = power;
      }
      vrm.scene.scale.copy(baseScale);
      vrm.scene.rotation.y = baseRotY;
      motions?.dispose();
      motions = null;
      scene.remove(lookTarget);
    },
    update(dt, t) {
      // 情绪表情
      for (const [name, target] of targets) {
        const v = approach(weights.get(name) ?? 0, target, 6, dt);
        weights.set(name, v);
        set(name, v);
      }
      // 口型
      mouth = approach(mouth, mouthTarget, 18, dt);
      const wobble = 0.5 + 0.5 * Math.sin(t * 11);
      set('aa', mouth * (0.75 + 0.25 * wobble));
      set('oh', mouth * 0.35 * (1 - wobble));
      // 眨眼
      const smiling = (weights.get('happy') ?? 0) > 0.5;
      if (blinkT < 0 && t >= nextBlinkAt && !smiling) blinkT = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        const d = 0.16;
        const v = blinkT < d / 2 ? blinkT / (d / 2) : Math.max(0, 1 - (blinkT - d / 2) / (d / 2));
        set('blink', v);
        if (blinkT >= d) {
          blinkT = -1;
          set('blink', 0);
          nextBlinkAt = t + 2.5 + Math.random() * 3.5;
        }
      }
      if (motions) {
        motions.update(dt);
        // 头部微动叠加在动画之上
        if (neck) {
          swayEuler.set(0, Math.sin(t * 0.37) * 0.04, Math.sin(t * 0.23) * 0.02);
          neck.quaternion.multiply(sway.setFromEuler(swayEuler));
        }
      } else {
        // 无动作库：程序化站姿 + 呼吸
        const breath = Math.sin(t * 1.6);
        if (spine) spine.rotation.x = breath * 0.012;
        if (chest) chest.rotation.x = breath * 0.018;
        if (neck) {
          neck.rotation.set(0, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.23) * 0.025);
        }
        for (const n of [head, lLeg, rLeg, lKnee, rKnee, lFore, rFore]) n?.quaternion.identity();
        if (lUpper) lUpper.rotation.z = 1.2 + breath * 0.015;
        if (rUpper) rUpper.rotation.z = -1.2 - breath * 0.015;
      }
      // ---- 悬空 / 被拎起姿态（叠加层，权重平滑淡入淡出）----
      const airborne = body.mode === 'held' || body.mode === 'falling';
      dangle = lowpass(dangle, airborne ? 1 : 0, airborne ? 8 : 5, dt);
      lean = lowpass(lean, Math.max(-1, Math.min(1, body.vx / 1800)), 6, dt);
      if (dangle > 0.001) {
        const kick = body.mode === 'held' ? 1 : 0.5;
        const sw = Math.sin(t * 9) * 0.35 * kick;
        // 手臂上举（像被人从腋下抱起），腿乱蹬
        blendTo(lUpper, 0, 0, -0.35 + Math.sin(t * 7) * 0.15, dangle);
        blendTo(rUpper, 0, 0, 0.35 - Math.sin(t * 7 + 1) * 0.15, dangle);
        blendTo(lFore, 0, 0, -0.3, dangle);
        blendTo(rFore, 0, 0, 0.3, dangle);
        blendTo(lLeg, -0.15 + sw - lean * 0.2, 0, 0.05, dangle);
        blendTo(rLeg, -0.15 - sw - lean * 0.2, 0, -0.05, dangle);
        blendTo(lKnee, 0.45 + Math.max(0, sw), 0, 0, dangle);
        blendTo(rKnee, 0.45 + Math.max(0, -sw), 0, 0, dangle);
        // 身体逆着运动方向倾斜（惯性）
        addRot(
          spine,
          Math.max(-0.3, Math.min(0.3, -body.vy / 6000)) * dangle,
          0,
          -lean * 0.35 * dangle,
        );
        addRot(head, 0, 0, Math.sin(t * 5) * 0.08 * dangle * kick);
      }
      // ---- 漫步：朝行进方向侧身 ----
      const walkDir = body.mode === 'walking' ? Math.sign(body.vx) : 0;
      facing = lowpass(facing, walkDir * 0.9, 5, dt);
      vrm.scene.rotation.y = baseRotY + facing;
      // ---- 头部跟随视线（阻尼弹簧 + 颈部限位），叠加在动作之上 ----
      const tYaw = lookNorm.x * NECK_LIMITS.yaw * (1 - dangle * 0.6);
      const tPitch = (lookNorm.y > 0 ? NECK_LIMITS.pitchUp : NECK_LIMITS.pitchDown) * lookNorm.y;
      yaw = dampedSpring(yaw, tYaw - facing * 0.5, 9, 0.9, dt);
      pitch = dampedSpring(pitch, tPitch, 9, 0.9, dt);
      addRot(neck, -pitch.x * 0.4, yaw.x * 0.4, 0);
      addRot(head, -pitch.x * 0.6, yaw.x * 0.6, 0);
      // ---- 落地压扁回弹（以脚底为原点缩放）----
      if (squashT >= 0) {
        squashT += dt;
        const { sx, sy } = squashAt(squashT, squashImpact);
        vrm.scene.scale.set(baseScale.x * sx, baseScale.y * sy, baseScale.z * sx);
        if (squashT > 1.2) {
          squashT = -1;
          vrm.scene.scale.copy(baseScale);
        }
      }
      // ---- 弹簧骨骼惯性：窗口加速度 → 等效重力（低通 + 限幅，防止高速拖拽时炸开）----
      accX = lowpass(accX, Math.max(-20000, Math.min(20000, body.ax)), 12, dt);
      accY = lowpass(accY, Math.max(-20000, Math.min(20000, body.ay)), 12, dt);
      if (!airborne && body.mode !== 'walking') {
        accX = lowpass(accX, 0, 6, dt);
        accY = lowpass(accY, 0, 6, dt);
      }
      for (const { j, dir, power } of joints) {
        const g = inertiaGravity(dir, power, accX, accY);
        j.settings.gravityDir.set(g.dir.x, g.dir.y, g.dir.z);
        j.settings.gravityPower = g.power;
      }
      // 视线
      lookTarget.position.lerp(lookGoal, 1 - Math.exp(-4 * dt));
    },
  };
  return backend;
}
