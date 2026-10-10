/** 数值小工具：阻尼弹簧、落地压扁、视线限位、弹簧骨骼惯性。纯函数，便于单测。 */

export interface SpringState {
  x: number;
  v: number;
}

/**
 * 阻尼弹簧（半隐式欧拉，固定子步长保证大 dt 下稳定）。
 * omega = 角频率（越大越“硬”），zeta = 阻尼比（1 = 临界阻尼，不过冲）。
 */
export function dampedSpring(
  s: SpringState,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): SpringState {
  let { x, v } = s;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a = -2 * zeta * omega * v - omega * omega * (x - target);
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

/**
 * 落地压扁 → 回弹：t 秒后的缩放。impact = 落地速度 px/s。
 * 体积近似守恒：横向膨胀约为纵向压缩的一半。
 */
export function squashAt(t: number, impact: number): { sx: number; sy: number } {
  if (t < 0) return { sx: 1, sy: 1 };
  const amp = Math.min(0.18, Math.max(0.035, impact / 9000));
  const k = amp * Math.exp(-7 * t) * Math.cos(18 * t);
  if (Math.abs(k) < 1e-4) return { sx: 1, sy: 1 };
  return { sx: 1 + k * 0.5, sy: 1 - k };
}

export interface LookLimits {
  yaw: number; // rad
  pitchUp: number;
  pitchDown: number;
}

export const NECK_LIMITS: LookLimits = { yaw: 0.6, pitchUp: 0.35, pitchDown: 0.3 };

/**
 * 光标（相对头部的屏幕像素偏移，y 向下）→ 头部偏航 / 俯仰（弧度，已限位）。
 * depth = 假想的“视距”像素，越大头转得越少。
 */
export function lookAngles(
  dx: number,
  dy: number,
  depth = 700,
  limits: LookLimits = NECK_LIMITS,
): { yaw: number; pitch: number } {
  const yaw = Math.atan2(dx, depth);
  const pitch = Math.atan2(-dy, depth);
  return {
    yaw: Math.max(-limits.yaw, Math.min(limits.yaw, yaw)),
    pitch: Math.max(-limits.pitchDown, Math.min(limits.pitchUp, pitch)),
  };
}

/**
 * 窗口加速度 → 弹簧骨骼的“等效重力”。
 * 窗口向右加速时，头发 / 裙子因惯性向左甩：等效外力 = -a。屏幕 y 向下 → 世界 y 向上需取反。
 * 结果 = 原重力向量 + 惯性力（按 gain 缩放、限幅），返回单位方向 + 强度，供 three-vrm joint.settings 使用。
 */
export function inertiaGravity(
  base: { x: number; y: number; z: number },
  basePower: number,
  axPx: number,
  ayPx: number,
  pxPerMeter = 300,
  gain = 0.12,
  maxExtra = 2.5,
): { dir: { x: number; y: number; z: number }; power: number } {
  let ex = (-axPx / pxPerMeter) * gain;
  let ey = (ayPx / pxPerMeter) * gain;
  const m = Math.hypot(ex, ey);
  if (m > maxExtra) {
    ex *= maxExtra / m;
    ey *= maxExtra / m;
  }
  const gx = base.x * basePower + ex;
  const gy = base.y * basePower + ey;
  const gz = base.z * basePower;
  const p = Math.hypot(gx, gy, gz);
  if (p < 1e-6) return { dir: { x: 0, y: -1, z: 0 }, power: 0 };
  return { dir: { x: gx / p, y: gy / p, z: gz / p }, power: p };
}

/** 一阶低通（指数平滑） */
export function lowpass(prev: number, next: number, rate: number, dt: number): number {
  return prev + (next - prev) * (1 - Math.exp(-rate * dt));
}
