import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

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
}

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

  const bone = (n: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) =>
    vrm.humanoid?.getNormalizedBoneNode(n) ?? null;
  const spine = bone('spine');
  const chest = bone('chest') ?? bone('upperChest');
  const neck = bone('neck');
  const lUpper = bone('leftUpperArm');
  const rUpper = bone('rightUpperArm');
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
      lookGoal.set(x * 1.5, 1.35 + y * 0.8, 3);
    },
    blink() {
      blinkT = 0;
    },
    playMotion(name) {
      return motions?.play(name) ?? false;
    },
    setTalking(talking) {
      motions?.setBase(talking ? 'talk' : 'idle');
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
          neck.rotation.y = Math.sin(t * 0.37) * 0.05;
          neck.rotation.z = Math.sin(t * 0.23) * 0.025;
        }
        if (lUpper) lUpper.rotation.z = 1.2 + breath * 0.015;
        if (rUpper) rUpper.rotation.z = -1.2 - breath * 0.015;
      }
      // 视线
      lookTarget.position.lerp(lookGoal, 1 - Math.exp(-4 * dt));
    },
  };
  return backend;
}
