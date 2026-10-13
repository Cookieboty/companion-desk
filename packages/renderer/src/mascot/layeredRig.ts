/**
 * Pseudo-3D layered 2D rig (Live2D-like feel without Live2D or WebGL).
 *
 * A rig is a handful of transparent PNG layers cut from one illustration
 * (body, head, side hair, ribbon, eyes, mouth + painted variants). The
 * animator below turns mascot state (expression / mouth / blink / look)
 * into per-layer transforms; `drawRig` paints them with Canvas2D only.
 */

export interface RigEyeMetrics {
  /** eye opening bbox in rig px */
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  /** upper lash stroke thickness (rig px) */
  lash: number;
  /** tight under-lash oval used to hard-clip the travelling iris */
  ovalX0?: number;
  ovalX1?: number;
  ovalTop?: number;
  ovalBottom?: number;
}

export interface RigManifest {
  /** Rig canvas size in px (all anchors/offsets live in this space). */
  size: [number, number];
  /** Named pivots, e.g. neck, eyeL, eyeR, mouth, hairL, hairR, ribbon, cheekL, cheekR, headTop. */
  anchors: Record<string, [number, number]>;
  /** iris radius per eye (rig px), for hi-res eyes with movable irises */
  irisRadius?: { l?: number; r?: number };
  /** eye-opening metrics; when present lids are drawn procedurally (descending lid blink) */
  eyes?: { l?: RigEyeMetrics; r?: RigEyeMetrics };
  /** colour of the lash / closed-eye line */
  lashColor?: string;
  /** rotation pivots of body parts (arm-l, arm-r, badge, strap-r …) */
  pivots?: Record<string, [number, number]>;
  /**
   * Layer name → top-left offset of its (trimmed) PNG in rig space, plus an optional
   * draw scale (e.g. 0.5 for hi-res face layers authored at 2× rig density).
   * Files are `${dir}${name}.png`.
   */
  layers: Record<string, [number, number] | [number, number, number]>;
  /** Folder (relative to manifest) holding the layer PNGs. */
  dir?: string;
}

export type EyeVariant = 'open' | 'happy';
export type MouthVariant = 'closed' | 'open' | 'o' | 'frown';

export interface RigGesture {
  name: string;
  /** changes every time the gesture is (re)triggered */
  id: number;
}

export interface RigInput {
  expression: string;
  /** 0..1 from lip sync (RMS) */
  mouth: number;
  talking: boolean;
  /** extra external blink envelope, 0 = open … 1 = closed (the animator also blinks on its own) */
  blink: number;
  lookX: number;
  lookY: number;
  reducedMotion?: boolean;
  /** one-shot body gesture (nod, wave, bow, jump, stomp, think …) */
  gesture?: RigGesture | null;
  /** AI is generating: hold a thinking tilt */
  thinking?: boolean;
}

export interface RigPose {
  bodyY: number;
  bodyScaleY: number;
  /** torso weight shift / lean (rig px, rad), pivoting at the hips */
  torsoX: number;
  torsoRot: number;
  /** whole-figure scale (jump back = slightly smaller) */
  figureScale: number;
  /** shoulder lift, negative = up (rig px) */
  shoulderL: number;
  shoulderR: number;
  armRotL: number;
  armRotR: number;
  badgeRot: number;
  strapRot: number;
  headX: number;
  headY: number;
  headRot: number;
  featX: number;
  featY: number;
  /** iris offset inside the eye, -1..1 (scaled by the iris radius) */
  irisX: number;
  irisY: number;
  hairRotL: number;
  hairRotR: number;
  ribbonRot: number;
  /** vertical eye scale, 1 open … 0 closed (legacy squash rigs) */
  eyeOpen: number;
  /** upper-lid descent, 0 open … 1 closed */
  lidClose: number;
  eyeScale: number;
  eyeVariant: EyeVariant;
  /** 0..1 blend toward the happy ^^ eyes */
  happy: number;
  /** alpha of the closed-lid line */
  lidAlpha: number;
  mouthVariant: MouthVariant;
  mouthOpen: number;
  /** viseme width factor (≈0.8 round … 1.15 wide) */
  mouthWidth: number;
  blush: number;
  tint: { r: number; g: number; b: number; a: number };
  angerMark: number;
  sweat: number;
}

interface ExprStyle {
  eyeOpen: number;
  eyeScale: number;
  eyeVariant: EyeVariant;
  mouth: MouthVariant;
  mouthBase: number;
  tilt: number; // deg
  headY: number;
  blush: number;
  tint: [number, number, number, number];
  breathRate: number;
  anger: number;
  sweat: number;
  /** held body posture */
  slump: number;
  /** one-shot gesture fired when the expression starts */
  gesture?: string;
}

const BASE: ExprStyle = {
  eyeOpen: 1,
  eyeScale: 1,
  eyeVariant: 'open',
  mouth: 'closed',
  mouthBase: 0,
  tilt: 0,
  headY: 0,
  blush: 0.15,
  tint: [0, 0, 0, 0],
  breathRate: 1,
  anger: 0,
  sweat: 0,
  slump: 0,
};

export const EXPRESSION_STYLES: Record<string, ExprStyle> = {
  neutral: BASE,
  talking: BASE,
  blink: BASE,
  happy: {
    ...BASE,
    eyeVariant: 'happy',
    mouth: 'open',
    mouthBase: 0.45,
    tilt: 3,
    blush: 0.65,
    breathRate: 1.3,
    gesture: 'hop',
  },
  relaxed: { ...BASE, eyeOpen: 0.55, tilt: -2.5, headY: 2, blush: 0.35, breathRate: 0.75 },
  sad: {
    ...BASE,
    eyeOpen: 0.62,
    mouth: 'frown',
    tilt: -3,
    headY: 6,
    blush: 0,
    tint: [70, 110, 200, 0.09],
    breathRate: 0.65,
    sweat: 1,
    slump: 1,
  },
  angry: {
    ...BASE,
    eyeOpen: 0.8,
    mouth: 'frown',
    tilt: 1.5,
    headY: -1,
    blush: 0.55,
    tint: [230, 60, 40, 0.1],
    breathRate: 1.5,
    anger: 1,
    gesture: 'stomp',
  },
  surprised: {
    ...BASE,
    eyeScale: 1.12,
    mouth: 'o',
    mouthBase: 0.7,
    headY: -4,
    blush: 0.25,
    breathRate: 1.4,
    gesture: 'jump',
  },
};

export function expressionStyle(name: string): ExprStyle {
  return EXPRESSION_STYLES[name] ?? BASE;
}

function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));

/** deterministic hash → [0,1) */
function hash1(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 1-D gradient noise, roughly −1..1, C1-smooth. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = hash1(i) * 2 - 1;
  const g1 = hash1(i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return (g0 * f * (1 - u) + g1 * (f - 1) * u) * 2.2;
}

/** two-octave noise; `seed` offsets the lattice so channels stay uncorrelated */
const fbm = (x: number, seed: number) =>
  noise1(x + seed * 31.7) * 0.7 + noise1(x * 2.13 + seed * 17.3 + 5.1) * 0.3;

/** small seeded PRNG (mulberry32) so a run is reproducible */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spring-damper: stiffness k, damping ratio zeta (1 = critical, no overshoot). */
export class Spring {
  x = 0;
  v = 0;
  private c: number;
  constructor(
    private k: number,
    zeta: number,
  ) {
    this.c = 2 * zeta * Math.sqrt(k);
  }
  step(target: number, dt: number): number {
    // semi-implicit Euler, sub-stepped for stiff springs / long frames
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((target - this.x) * this.k - this.v * this.c) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

const DEG = Math.PI / 180;

/** Blink envelope (seconds since start) → lid closure 0..1, ≈170 ms, slower reopen. */
export function blinkCurve(tau: number): number {
  const CLOSE = 0.06;
  const HOLD = 0.025;
  const OPEN = 0.085;
  if (tau < 0) return 0;
  if (tau < CLOSE) return easeInOut(tau / CLOSE);
  if (tau < CLOSE + HOLD) return 1;
  if (tau < CLOSE + HOLD + OPEN) return 1 - easeInOut((tau - CLOSE - HOLD) / OPEN);
  return 0;
}
export const BLINK_DURATION = 0.17;

interface GestureOut {
  bodyY: number;
  headY: number;
  headRot: number;
  shoulder: number;
  torsoX: number;
  torsoRot: number;
  armOut: number;
  armR: number;
  scale: number;
  nodHead: number;
}
const ZERO_G: GestureOut = {
  bodyY: 0,
  headY: 0,
  headRot: 0,
  shoulder: 0,
  torsoX: 0,
  torsoRot: 0,
  armOut: 0,
  armR: 0,
  scale: 0,
  nodHead: 0,
};

const pulse = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

/** One-shot gesture curves (time τ in s). Returns null once finished. */
export function gestureCurve(name: string, tau: number): GestureOut | null {
  const g = { ...ZERO_G };
  switch (name) {
    case 'hop':
    case 'cheer':
    case 'clap': {
      // two little bounces + a shrug
      const D = 0.9;
      if (tau > D) return null;
      const decay = 1 - tau / D;
      g.bodyY = -9 * Math.abs(Math.sin((Math.PI * tau) / 0.42)) * decay;
      g.shoulder = -5 * pulse(tau / 0.5);
      g.headRot = 2 * DEG * pulse(tau / 0.9);
      g.armOut = 0.6 * DEG * pulse(tau / 0.5);
      return g;
    }
    case 'jump':
    case 'flinch':
    case 'shake': {
      // jump back: fast rise, slow settle
      const D = 0.9;
      if (tau > D) return null;
      const k = tau < 0.1 ? easeInOut(tau / 0.1) : Math.exp(-(tau - 0.1) * 5.5);
      g.bodyY = -11 * k;
      g.headY = -5 * k;
      g.scale = -0.03 * k;
      g.shoulder = -6 * k;
      g.armOut = 1.1 * DEG * k;
      return g;
    }
    case 'stomp': {
      const D = 0.9;
      if (tau > D) return null;
      const s1 = pulse(tau / 0.16);
      const s2 = pulse((tau - 0.34) / 0.16);
      g.bodyY = 5 * (s1 + s2 * 0.9);
      g.shoulder = -3 * (s1 + s2);
      g.torsoX = Math.sin(tau * 34) * 2.2 * (1 - tau / D);
      g.headRot = Math.sin(tau * 31) * 1.6 * DEG * (1 - tau / D);
      return g;
    }
    case 'nod':
    case 'greet': {
      const D = 0.95;
      if (tau > D) return null;
      g.nodHead = 7 * pulse(tau / 0.42) + 4 * pulse((tau - 0.45) / 0.4);
      g.shoulder = -1.5 * pulse(tau / 0.42);
      return g;
    }
    case 'wave': {
      const D = 1.3;
      if (tau > D) return null;
      const env = pulse(tau / D);
      g.nodHead = 5 * pulse(tau / 0.45);
      g.headRot = 3 * DEG * env;
      g.shoulder = -3 * env;
      g.armR = Math.sin(tau * 11) * 1.3 * DEG * env;
      g.bodyY = -3 * Math.abs(Math.sin((Math.PI * tau) / 0.65)) * env;
      return g;
    }
    case 'bow': {
      const D = 1.5;
      if (tau > D) return null;
      const env = easeInOut(tau / 0.45) * (tau < 0.9 ? 1 : 1 - easeInOut((tau - 0.9) / 0.6));
      g.nodHead = 12 * env;
      g.bodyY = 3 * env;
      g.scale = -0.008 * env;
      return g;
    }
    case 'think': {
      const D = 1.6;
      if (tau > D) return null;
      const env = pulse(tau / D);
      g.headRot = -5 * DEG * env;
      g.torsoRot = -0.6 * DEG * env;
      return g;
    }
    default:
      return null;
  }
}

/**
 * Stateful animator: call `step(dt, t, input)` once per frame.
 * Motion = layered noise + spring-dampers (no bare sine loops), so it never looks periodic.
 */
export class RigAnimator {
  private s = {
    eyeBase: 0,
    eyeScale: 1,
    tilt: 0,
    headY: 0,
    blush: 0.15,
    tr: 0,
    tg: 0,
    tb: 0,
    ta: 0,
    anger: 0,
    sweat: 0,
    happy: 0,
    slump: 0,
    think: 0,
    energy: 0,
    mouth: 0,
    breathPhase: 0,
  };
  private rand: () => number;
  // gaze: eyes jump (saccades), head follows with a critically damped lag
  private eyeGoalX = 0;
  private eyeGoalY = 0;
  private eyeX = new Spring(1400, 1);
  private eyeY = new Spring(1400, 1);
  private headLX = new Spring(26, 1.05);
  private headLY = new Spring(26, 1.05);
  private nextSaccade = 0.8;
  // blinks
  private blinkStarts: number[] = [];
  private nextBlink = 1.8;
  private lastBlink = -10;
  // body
  private shift = 0;
  private nextShift = 6;
  private shiftS = new Spring(5, 1);
  private lean = new Spring(60, 1);
  private bobS = new Spring(140, 0.75);
  private armL = new Spring(30, 0.35);
  private armR = new Spring(28, 0.35);
  private badge = new Spring(20, 0.18);
  private strap = new Spring(26, 0.2);
  private hairL = new Spring(45, 0.3);
  private hairR = new Spring(38, 0.28);
  private ribbon = new Spring(24, 0.22);
  private prev = { headRot: 0, headX: 0, headY: 0, torsoX: 0, bodyY: 0, vX: 0, vY: 0 };
  private gesture: { name: string; t0: number } | null = null;
  private gestureId = -1;
  private lastExpr = 'neutral';
  private started = false;

  constructor(seed = 7) {
    this.rand = rng(seed);
  }

  private trigger(name: string, t: number) {
    if (gestureCurve(name, 0)) this.gesture = { name, t0: t };
  }

  /** blink closure 0..1 from the blink scheduler (auto, double, on gaze shift) */
  private blinkAt(t: number): number {
    let c = 0;
    for (const b of this.blinkStarts) c = Math.max(c, blinkCurve(t - b));
    this.blinkStarts = this.blinkStarts.filter((b) => t - b < BLINK_DURATION + 0.3);
    return c;
  }
  private startBlink(t: number, allowDouble = true) {
    if (t - this.lastBlink < 0.35) return;
    this.lastBlink = t;
    this.blinkStarts.push(t);
    if (allowDouble && this.rand() < 0.16) this.blinkStarts.push(t + 0.24);
  }

  step(dt: number, t: number, input: RigInput): RigPose {
    const st = expressionStyle(input.expression);
    const rm = !!input.reducedMotion;
    const s = this.s;
    const m = rm ? 0 : 1;
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (!this.started) {
      this.started = true;
      this.nextBlink = t + 1.2 + this.rand() * 2;
      this.nextShift = t + 5 + this.rand() * 4;
      this.nextSaccade = t + 0.6;
    }

    // --- events → gestures
    if (input.expression !== this.lastExpr) {
      if (st.gesture) this.trigger(st.gesture, t);
      this.lastExpr = input.expression;
    }
    if (input.gesture && input.gesture.id !== this.gestureId) {
      this.gestureId = input.gesture.id;
      this.trigger(input.gesture.name, t);
    }
    const g = (this.gesture && gestureCurve(this.gesture.name, t - this.gesture.t0)) || ZERO_G;
    if (this.gesture && g === ZERO_G) this.gesture = null;

    // --- eased expression parameters
    s.eyeBase = approach(s.eyeBase, (1 - st.eyeOpen) * 0.85, 7, dt);
    s.eyeScale = approach(s.eyeScale, st.eyeScale, 10, dt);
    s.tilt = approach(s.tilt, st.tilt, 3.5, dt);
    s.headY = approach(s.headY, st.headY, 4, dt);
    s.blush = approach(s.blush, st.blush, 3, dt);
    s.tr = approach(s.tr, st.tint[0], 5, dt);
    s.tg = approach(s.tg, st.tint[1], 5, dt);
    s.tb = approach(s.tb, st.tint[2], 5, dt);
    s.ta = approach(s.ta, st.tint[3], 3, dt);
    s.anger = approach(s.anger, st.anger, 5, dt);
    s.sweat = approach(s.sweat, st.sweat, 2.5, dt);
    s.happy = approach(s.happy, st.eyeVariant === 'happy' ? 1 : 0, 14, dt);
    s.slump = approach(s.slump, st.slump, 2.2, dt);
    s.think = approach(s.think, input.thinking ? 1 : 0, 3, dt);

    // --- gaze: saccadic eyes lead, head follows on a no-overshoot spring
    const thinkLook = s.think;
    const goalX = input.lookX * (1 - thinkLook) - 0.45 * thinkLook;
    const goalY = input.lookY * (1 - thinkLook) + 0.55 * thinkLook;
    const jump = Math.hypot(goalX - this.eyeGoalX, goalY - this.eyeGoalY);
    if (jump > 0.12) {
      if (jump > 0.55 && this.rand() < 0.6) this.startBlink(t, false);
      this.eyeGoalX = goalX;
      this.eyeGoalY = goalY;
      this.nextSaccade = t + 0.5 + this.rand() * 1.4;
    } else if (t >= this.nextSaccade) {
      // idle micro-saccade around the current target
      this.eyeGoalX = goalX + (this.rand() - 0.5) * 0.16 * m;
      this.eyeGoalY = goalY + (this.rand() - 0.5) * 0.1 * m;
      this.nextSaccade = t + 0.7 + this.rand() * 1.9;
    }
    const eyeX = this.eyeX.step(this.eyeGoalX, dt);
    const eyeY = this.eyeY.step(this.eyeGoalY, dt);
    const lookX = this.headLX.step(goalX, dt);
    const lookY = this.headLY.step(goalY, dt);

    // --- blinks (also with reduced motion)
    if (t >= this.nextBlink) {
      this.startBlink(t);
      this.nextBlink = t + 2.2 + this.rand() * 3.8;
    }
    const blink = Math.max(this.blinkAt(t), clamp01(input.blink));

    // --- speech: asymmetric envelope (fast attack, slower release) + viseme width
    const speaking = input.talking || input.mouth > 0.04;
    const raw = speaking ? Math.max(input.mouth, input.talking ? 0.1 : 0) : 0;
    s.energy = approach(s.energy, raw, raw > s.energy ? 28 : 11, dt);
    const mouthTarget = speaking ? s.energy : st.mouthBase;
    s.mouth = approach(s.mouth, mouthTarget, speaking ? 30 : 10, dt);
    const mouthWidth = speaking ? 1 + 0.16 * fbm(t * 5.5, 9) - 0.08 * s.energy : 1;
    const bob = this.bobS.step(s.energy * 4.5 * m, dt);

    // --- breathing: noise-modulated rate, inhale quicker than exhale
    s.breathPhase += dt * (0.27 + 0.03 * fbm(t * 0.1, 3)) * st.breathRate * Math.PI * 2;
    const ph = s.breathPhase % (Math.PI * 2);
    const breath =
      (ph < Math.PI * 0.85 ? -Math.cos(ph / 0.85) : Math.cos((ph - Math.PI * 0.85) / 1.15)) * m;

    // --- weight shift idle loop
    if (t >= this.nextShift) {
      this.shift = (this.shift > 0 ? -1 : 1) * (0.5 + this.rand() * 0.5);
      this.nextShift = t + 7 + this.rand() * 6;
    }
    const shift = this.shiftS.step(this.shift * m, dt);

    // --- idle micro-movements (noise, different seeds per channel)
    const nRot = fbm(t * 0.35, 1) * 1.3 * m;
    const nX = fbm(t * 0.27, 2) * 1.6 * m;
    const nY = fbm(t * 0.31, 4) * 0.9 * m;
    const nTalk = fbm(t * 1.8, 5) * 1.4 * Math.min(1, s.energy * 3) * m;

    const slump = s.slump;
    // Whole-body intent: every head motion (look, tilt, nod, sway, poses) is carried by the
    // torso first; the head only adds a smaller share on top, so it never moves over a
    // frozen body. The torso rotates at the hips, which also carries the neck.
    const intentRot =
      (s.tilt + nRot + lookX * 3.2 * (1 - thinkLook) - 6 * s.think + nTalk - shift * 0.8) * DEG +
      g.headRot * m;
    const intentX = lookX * 9 + nX + shift * 1.5;
    const intentY = s.headY - lookY * 5 + nY + bob + slump * 3 + (g.headY + g.nodHead) * m;
    // the torso takes its share of the intent in the same frame (no lag); only the slow
    // idle sway goes through a spring
    const torsoIdle =
      (shift * 0.7 + fbm(t * 0.12, 6) * 0.35 + fbm(t * 0.23, 16) * 0.25 + slump * 0.4) * DEG * m;
    const torsoRot = intentRot * 0.38 * m + this.lean.step(torsoIdle, dt) + g.torsoRot * m;
    const torsoX = (intentX * 0.45 + shift * 3.5 + fbm(t * 0.19, 17) * 1.2 + g.torsoX) * m;
    // the chest dips with nods / bows / slumps (positive intentY = head down)
    const bodyY = (g.bodyY + slump * 3 + Math.max(-6, Math.min(6, intentY * 0.45))) * m;
    const bodyScaleY = 1 + breath * 0.0045;
    const headRot = intentRot * 0.62;
    const headX = intentX * 0.5;
    const headY = intentY * 0.6 - breath * 0.9;
    // shoulders follow the lean: the side the torso tips toward drops a little
    const tiltSh = (torsoRot / DEG) * 1.6;
    const sh = (-breath * 1.8 + g.shoulder + slump * 5) * m;
    const shL = sh - tiltSh * m;
    const shR = sh + tiltSh * m;

    // velocities drive inertia of hanging parts
    const inv = dt > 0 ? 1 / dt : 0;
    const vHeadRot = (headRot - this.prev.headRot) * inv;
    const vHeadX = (headX - this.prev.headX) * inv;
    const vX = (torsoX - this.prev.torsoX) * inv;
    const vY = (bodyY + headY * 0.3 - this.prev.bodyY) * inv;
    const aX = (vX - this.prev.vX) * inv;
    const aY = (vY - this.prev.vY) * inv;
    this.prev = { headRot, headX, headY, torsoX, bodyY: bodyY + headY * 0.3, vX, vY };

    const hairDrive = (-vHeadRot * 0.09 - vHeadX * 0.0016) * m;
    const hairRotL = this.hairL.step(hairDrive + fbm(t * 0.6, 10) * 1.0 * DEG * m, dt);
    const hairRotR = this.hairR.step(hairDrive + fbm(t * 0.55 + 2, 11) * 1.0 * DEG * m, dt);
    const ribbonRot = this.ribbon.step(
      hairDrive * 1.5 + (fbm(t * 0.8, 12) * 2.6 - vY * 0.02) * DEG * m,
      dt,
    );
    const lim = (v: number, l: number) => Math.max(-l, Math.min(l, v));
    const armDrive = -aX * 0.00004 - torsoRot * 0.5;
    const armRotL = lim(
      this.armL.step(
        (armDrive + g.armOut + fbm(t * 0.4, 13) * 0.25 * DEG + slump * 0.5 * DEG) * m,
        dt,
      ),
      1.6 * DEG,
    );
    const armRotR = lim(
      this.armR.step(
        (armDrive - g.armOut + g.armR + fbm(t * 0.42, 14) * 0.25 * DEG - slump * 0.5 * DEG) * m,
        dt,
      ),
      1.6 * DEG,
    );
    const hang = -torsoRot - aX * 0.00025 + aY * 0.0001;
    const badgeRot = lim(this.badge.step(hang * m, dt), 7 * DEG);
    const strapRot = lim(
      this.strap.step((hang * 0.8 + fbm(t * 0.5, 15) * 0.6 * DEG) * m, dt),
      6 * DEG,
    );

    const happy = s.happy;
    const lidClose = Math.min(1, s.eyeBase + blink * (1 - s.eyeBase));
    const eyeOpen = Math.max(0.02, 1 - lidClose);
    const lidAlpha = smooth(0.6, 0.95, lidClose) * (1 - happy);

    let mouthVariant: MouthVariant = 'closed';
    if (s.mouth > 0.06) mouthVariant = st.mouth === 'o' ? 'o' : 'open';
    else if (st.mouth === 'frown') mouthVariant = 'frown';

    const pose: RigPose = {
      bodyY,
      bodyScaleY,
      torsoX,
      torsoRot,
      figureScale: 1 + g.scale * m,
      shoulderL: shL,
      shoulderR: shR,
      armRotL,
      armRotR,
      badgeRot,
      strapRot,
      headX: rm ? lookX * 4 : headX,
      headY: rm ? s.headY * 0.5 : headY,
      headRot: rm ? s.tilt * 0.5 * DEG : headRot,
      featX: lookX * 4 + (eyeX - lookX) * 1.2,
      featY: -lookY * 3,
      irisX: Math.max(-1, Math.min(1, eyeX * 1.2)),
      irisY: Math.max(-1, Math.min(1, -eyeY * 1.2)),
      hairRotL,
      hairRotR,
      ribbonRot,
      eyeOpen: happy > 0.5 ? 1 : eyeOpen,
      lidClose,
      eyeScale: s.eyeScale,
      eyeVariant: happy > 0.5 ? 'happy' : 'open',
      happy,
      lidAlpha,
      mouthVariant,
      mouthOpen: Math.min(1, s.mouth),
      mouthWidth,
      blush: s.blush,
      tint: { r: s.tr, g: s.tg, b: s.tb, a: s.ta },
      angerMark: s.anger,
      sweat: s.sweat,
    };
    return pose;
  }
}

export type RigImages = Map<string, CanvasImageSource & { width: number; height: number }>;

/** Layers a rig needs for the full feature set (missing ones are skipped). */
export const RIG_LAYERS = [
  'body',
  'arm-l',
  'arm-r',
  'strap-r',
  'badge',
  'head',
  'crown',
  'face-hd',
  'eye-white-l',
  'eye-white-r',
  'iris-l',
  'iris-r',
  'lash-l',
  'lash-r',
  'lid-l',
  'lid-r',
  'happy-l',
  'happy-r',
  // legacy single-plate eyes (older rigs)
  'eye-l',
  'eye-r',
  'eyes-closed',
  'eyes-happy',
  'mouth',
  'mouth-open',
  'mouth-o',
  'mouth-frown',
  'hair-side-l',
  'hair-side-r',
  'ribbon',
  'bangs',
] as const;

const scratches: (HTMLCanvasElement | OffscreenCanvas | undefined)[] = [];
function scratchCanvas(w: number, h: number, slot = 0) {
  let c = scratches[slot];
  if (!c) {
    c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    scratches[slot] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

type Eye = RigEyeMetrics;

/**
 * Anime-style lid stroke: thick tapered lash in the lash colour, outer-corner ticks,
 * a faint eyelid crease, and a tiny lower-lash hint. `kind` closed = gentle ∪,
 * happy = ∩ arc (^^).
 */
function lidStroke(
  ctx: CanvasRenderingContext2D,
  e: Eye,
  side: 'l' | 'r',
  y: number,
  kind: 'closed' | 'happy',
  color: string,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  const w = e.x1 - e.x0;
  const h = e.bottom - e.top;
  const outerRight = side === 'r';
  const inner = outerRight ? e.x0 + w * 0.01 : e.x1 - w * 0.01;
  const outer = outerRight ? e.x1 + w * 0.1 : e.x0 - w * 0.1;
  const N = 22;
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  const at = (t: number) => {
    const x = inner + (outer - inner) * t;
    const yc =
      kind === 'closed'
        ? y + h * 0.18 * Math.sin(Math.PI * t) + h * 0.04 * t
        : y - h * 0.42 * Math.sin(Math.PI * Math.pow(t, 0.88)) + h * 0.03 * t;
    return [x, yc] as [number, number];
  };
  // thicker mid-lash, sharp taper at both ends (matches the open-eye source stroke)
  const thickness = (t: number) =>
    e.lash *
    (kind === 'closed' ? 1.28 : 1.18) *
    (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.68)), 0.62));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, yc] = at(t);
    const [x2, y2] = at(Math.min(1, t + 0.01));
    const [x1, y1] = at(Math.max(0, t - 0.01));
    let nx = -(y2 - y1);
    let ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const th = thickness(t) / 2;
    top.push([x - nx * th, yc - ny * th]);
    bot.push([x + nx * th, yc + ny * th]);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const q of top) ctx.lineTo(q[0], q[1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fill();
  // outer-corner ticks (winged clumps, matching the open-eye source)
  const dir = outerRight ? 1 : -1;
  const ticks =
    kind === 'closed'
      ? [
          [0.7, 0.09, 28],
          [0.82, 0.15, 40],
          [0.93, 0.13, 52],
        ]
      : [
          [0.88, 0.1, 28],
          [0.97, 0.12, 42],
        ];
  for (const [t, lenF, angDeg] of ticks) {
    const [x, yc] = at(t);
    const len = w * lenF;
    const ang = angDeg * DEG;
    const ex = x + dir * Math.cos(ang) * len;
    const ey = yc + Math.sin(ang) * len + (kind === 'closed' ? h * 0.02 : e.lash * 0.15);
    const bw = e.lash * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - dir * bw * 0.6, yc - e.lash * 0.15);
    ctx.quadraticCurveTo(x + dir * len * 0.45, yc + len * 0.05, ex, ey);
    ctx.quadraticCurveTo(x + dir * len * 0.35, yc + len * 0.5, x + dir * bw, yc + bw * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  // faint eyelid crease above the lash (gives the lid depth instead of a flat pale patch)
  ctx.globalAlpha *= 0.42;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, e.lash * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    if (t < 0.08 || t > 0.92) continue;
    const [x, yc] = at(t);
    const cy = yc - h * (kind === 'closed' ? 0.22 : 0.18) * Math.sin(Math.PI * t);
    if (i === 0 || t <= 0.08 + 1 / N) ctx.moveTo(x, cy);
    else ctx.lineTo(x, cy);
  }
  ctx.stroke();
  // tiny lower-lash hints (closed only; happy arcs sit above)
  if (kind === 'closed') {
    ctx.globalAlpha = alpha * 0.55;
    ctx.lineWidth = Math.max(0.55, e.lash * 0.22);
    const lowerY = y + h * 0.38;
    for (const t of [0.22, 0.4, 0.58, 0.75]) {
      const x = inner + (outer - inner) * t;
      const len = h * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, lowerY);
      ctx.quadraticCurveTo(
        x + dir * len * 0.2,
        lowerY + len * 0.7,
        x + dir * len * 0.15,
        lowerY + len,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Paint one frame. `ctx` must already be transformed so that 1 unit = 1 rig px.
 */
export function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: RigManifest,
  imgs: RigImages,
  pose: RigPose,
): void {
  const A = rig.anchors;
  const L = rig.layers;
  const P = rig.pivots ?? {};
  const layer = (name: string, alpha = 1) => {
    const img = imgs.get(name);
    const off = L[name];
    if (!img || !off || alpha <= 0.003) return;
    const prev = ctx.globalAlpha;
    if (alpha < 1) ctx.globalAlpha = prev * alpha;
    const k = off[2] ?? 1;
    if (k === 1) ctx.drawImage(img, off[0], off[1]);
    else ctx.drawImage(img, off[0], off[1], img.width * k, img.height * k);
    ctx.globalAlpha = prev;
  };
  const tint = pose.tint;
  const tintedLayer = (name: string, slot: number) => {
    const img = imgs.get(name);
    const off = L[name];
    if (!img || !off) return;
    if (tint.a <= 0.004) return layer(name);
    const c = scratchCanvas(img.width, img.height, slot);
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!g) return layer(name);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(${tint.r | 0},${tint.g | 0},${tint.b | 0},${tint.a})`;
    g.fillRect(0, 0, c.width, c.height);
    const k = off[2] ?? 1;
    ctx.drawImage(c as CanvasImageSource, off[0], off[1], img.width * k, img.height * k);
  };
  const pivot = (p: [number, number], fn: () => void, rot = 0, sx = 1, sy = 1) => {
    ctx.save();
    ctx.translate(p[0], p[1]);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-p[0], -p[1]);
    fn();
    ctx.restore();
  };
  /** white + iris hard-clipped to the eye-white alpha (and a tight oval) at native res */
  const composeEye = (side: 'l' | 'r') => {
    const white = imgs.get(`eye-white-${side}`);
    const wo = L[`eye-white-${side}`];
    if (!white || !wo) return null;
    const k = wo[2] ?? 1;
    const c = scratchCanvas(white.width, white.height, side === 'l' ? 2 : 3);
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!g) return null;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(white, 0, 0);
    const iris = imgs.get(`iris-${side}`);
    const io = L[`iris-${side}`];
    const r = rig.irisRadius?.[side] ?? 20;
    if (iris && io) {
      g.globalCompositeOperation = 'source-atop';
      const dx = (io[0] - wo[0]) / k + (pose.irisX * r * 0.34) / k;
      const dy = (io[1] - wo[1]) / k + (pose.irisY * r * 0.16) / k;
      // draw iris ~4% larger so soft/AA rim never leaves a white gap at the lid
      const is = 1.04;
      const iw = iris.width * is;
      const ih = iris.height * is;
      g.drawImage(iris, dx - (iw - iris.width) / 2, dy - (ih - iris.height) / 2, iw, ih);
    }
    // belt-and-suspenders: hard oval clip matching the open-eye shape under the lash
    const m = rig.eyes?.[side];
    if (m) {
      const ox0 = m.ovalX0 ?? m.x0;
      const ox1 = m.ovalX1 ?? m.x1;
      const oy0 = m.ovalTop ?? m.top;
      const oy1 = m.ovalBottom ?? m.bottom;
      const cx = (ox0 + ox1) / 2;
      const cy = (oy0 + oy1) / 2;
      const rx = ((ox1 - ox0) / 2) * 1.04;
      const ry = ((oy1 - oy0) / 2) * 1.08;
      g.globalCompositeOperation = 'destination-in';
      g.beginPath();
      g.ellipse((cx - wo[0]) / k, (cy - wo[1]) / k, rx / k, ry / k, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return { c, wo, k, white };
  };
  /** legacy rigs: squash the eye group for blinks */
  const squashEye = (side: 'l' | 'r', pivotPt: [number, number]) => {
    const e = composeEye(side);
    if (!e) return false;
    pivot(
      pivotPt,
      () => {
        ctx.drawImage(
          e.c as CanvasImageSource,
          e.wo[0],
          e.wo[1],
          e.white.width * e.k,
          e.white.height * e.k,
        );
        layer(`lash-${side}`);
      },
      0,
      pose.eyeScale,
      pose.eyeOpen * pose.eyeScale,
    );
    return true;
  };
  /** upper lid descends over the eye (iris clipped, never squashed); procedural closed / ^^ */
  const lidEye = (side: 'l' | 'r', m: Eye) => {
    const color = rig.lashColor ?? '#3a2218';
    const h = m.bottom - m.top;
    const w = m.x1 - m.x0;
    const cx = (m.x0 + m.x1) / 2;
    const cy = (m.top + m.bottom) / 2;
    const irisC = (side === 'l' ? A.irisL : A.irisR) ?? [cx, cy];
    const closeY = m.top + h * 0.66;
    const cl = clamp01(pose.lidClose);
    const happyA = smooth(0.2, 0.8, pose.happy);
    const openA = 1 - happyA;
    const x0 = m.x0 - w * 0.25;
    const x1 = m.x1 + w * 0.25;
    const edge = m.top - 2 + (closeY - m.top + 2) * cl;
    const edgeAt = (x: number) => {
      const t = clamp01((x - m.x0) / w);
      return (
        edge - h * 0.2 * (1 - cl) * Math.sin(Math.PI * t) + h * 0.12 * cl * Math.sin(Math.PI * t)
      );
    };
    const edgePath = () => {
      for (let i = 0; i <= 12; i++) {
        const x = x0 + ((x1 - x0) * i) / 12;
        ctx.lineTo(x, edgeAt(x));
      }
    };
    pivot(
      [cx, cy],
      () => {
        if (openA > 0.01 && cl < 0.985) {
          const e = composeEye(side);
          ctx.save();
          ctx.globalAlpha *= openA;
          if (e) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x0, m.bottom + 30);
            edgePath();
            ctx.lineTo(x1, m.bottom + 30);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(
              e.c as CanvasImageSource,
              e.wo[0],
              e.wo[1],
              e.white.width * e.k,
              e.white.height * e.k,
            );
            ctx.restore();
          }
          // lower lash stays; upper lash rides the lid down and fades into the closed line
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 - 20, irisC[1], x1 - x0 + 40, h + 40);
          ctx.clip();
          layer(`lash-${side}`, 1 - smooth(0.55, 0.9, cl));
          ctx.restore();
          const lashA = 1 - smooth(0.62, 0.95, cl);
          if (lashA > 0.01) {
            ctx.save();
            ctx.globalAlpha *= lashA;
            ctx.translate(0, edge - (m.top - 2));
            ctx.beginPath();
            ctx.rect(x0 - 20, m.top - 60, x1 - x0 + 40, irisC[1] - m.top + 60);
            ctx.clip();
            pivot([cx, m.top], () => layer(`lash-${side}`), 0, 1, 1 - 0.35 * cl);
            ctx.restore();
          }
          ctx.restore();
        }
        // lid mound: soft warm fill so closed/happy lids are not pale flat inpaint
        const lidFill = Math.max(smooth(0.25, 1, cl), happyA * 0.85);
        if (lidFill > 0.01) {
          const sy = closeY * (1 - happyA) + (m.top + h * 0.42) * happyA;
          const gr = ctx.createRadialGradient(cx, sy - h * 0.05, w * 0.08, cx, sy, w * 0.72);
          gr.addColorStop(0, `rgba(236, 176, 156, ${0.55 * lidFill})`);
          gr.addColorStop(0.45, `rgba(220, 150, 130, ${0.32 * lidFill})`);
          gr.addColorStop(1, 'rgba(210, 140, 120, 0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(cx, sy, w * 0.7, h * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          // cooler shadow tucked under the brow / upper crease
          const sh = ctx.createRadialGradient(
            cx,
            m.top + h * 0.1,
            0,
            cx,
            m.top + h * 0.15,
            w * 0.55,
          );
          sh.addColorStop(0, `rgba(180, 110, 95, ${0.22 * lidFill})`);
          sh.addColorStop(1, 'rgba(180, 110, 95, 0)');
          ctx.fillStyle = sh;
          ctx.beginPath();
          ctx.ellipse(cx, m.top + h * 0.18, w * 0.55, h * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        lidStroke(ctx, m, side, closeY, 'closed', color, pose.lidAlpha * openA);
        lidStroke(ctx, m, side, m.top + h * 0.58, 'happy', color, happyA);
      },
      0,
      pose.eyeScale,
      pose.eyeScale,
    );
  };

  const [W, H] = rig.size;
  const neck = A.neck;
  ctx.save();
  ctx.translate(W / 2, H);
  ctx.scale(pose.figureScale, pose.figureScale);
  ctx.rotate(pose.torsoRot);
  ctx.translate(-W / 2 + pose.torsoX, -H + pose.bodyY);

  // torso breathes from the bottom edge; arms ride the shoulders; badge / strap swing
  pivot([W / 2, H], () => layer('body'), 0, 1, pose.bodyScaleY);
  const part = (name: string, rot: number, lift = 0) => {
    const pv = P[name];
    if (!pv || !imgs.has(name)) return;
    ctx.save();
    ctx.translate(0, lift);
    pivot(pv, () => layer(name), rot);
    ctx.restore();
  };
  part('arm-l', pose.armRotL, pose.shoulderL);
  part('arm-r', pose.armRotR, pose.shoulderR);
  part('strap-r', pose.strapRot, pose.shoulderR * 0.5);
  part('badge', pose.badgeRot);

  const neckLift = (H - neck[1]) * (pose.bodyScaleY - 1);
  ctx.save();
  ctx.translate(pose.headX, pose.headY - neckLift);
  ctx.translate(neck[0], neck[1]);
  ctx.rotate(pose.headRot);
  ctx.translate(-neck[0], -neck[1]);

  // tint only the head's own pixels (source-atop on scratch canvases)
  tintedLayer('head', 0);
  tintedLayer('crown', 5);
  tintedLayer('face-hd', 1);

  // blush (soft radial gradients on the cheeks)
  if (pose.blush > 0.02 && A.cheekL && A.cheekR) {
    for (const c of [A.cheekL, A.cheekR]) {
      const gr = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 26);
      gr.addColorStop(0, `rgba(255,120,120,${0.38 * pose.blush})`);
      gr.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], 26, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // features ride a little further than the head → parallax depth
  ctx.save();
  ctx.translate(pose.featX, pose.featY);
  const hd = imgs.has('eye-white-l');
  if (hd && rig.eyes?.l && rig.eyes?.r) {
    lidEye('l', rig.eyes.l);
    lidEye('r', rig.eyes.r);
  } else if (pose.eyeVariant === 'happy') {
    if (hd) {
      layer('happy-l');
      layer('happy-r');
    } else layer('eyes-happy');
  } else {
    if (pose.eyeOpen > 0.06) {
      if (!squashEye('l', A.eyeL))
        pivot(A.eyeL, () => layer('eye-l'), 0, pose.eyeScale, pose.eyeOpen * pose.eyeScale);
      if (!squashEye('r', A.eyeR))
        pivot(A.eyeR, () => layer('eye-r'), 0, pose.eyeScale, pose.eyeOpen * pose.eyeScale);
    }
    if (hd) {
      layer('lid-l', pose.lidAlpha);
      layer('lid-r', pose.lidAlpha);
    } else layer('eyes-closed', pose.lidAlpha);
  }
  if (pose.mouthVariant === 'closed' || pose.mouthVariant === 'frown') {
    layer(pose.mouthVariant === 'frown' ? 'mouth-frown' : 'mouth');
  } else {
    const name = pose.mouthVariant === 'o' ? 'mouth-o' : 'mouth-open';
    const open = 0.35 + 0.65 * pose.mouthOpen;
    const wv = pose.mouthWidth ?? 1;
    pivot(
      A.mouth,
      () => layer(name),
      0,
      (pose.mouthVariant === 'o' ? 0.5 + 0.1 * open : 0.85 + 0.15 * open) * wv,
      open * (2 - wv) ** 0.5,
    );
  }
  ctx.restore();

  // fringe sits above the eyes so blinks / iris moves never erase it
  tintedLayer('bangs', 4);
  // secondary motion layers (hang from their roots)
  if (A.hairL) pivot(A.hairL, () => layer('hair-side-l'), pose.hairRotL);
  if (A.hairR) pivot(A.hairR, () => layer('hair-side-r'), pose.hairRotR);
  if (A.ribbon) pivot(A.ribbon, () => layer('ribbon'), pose.ribbonRot);

  // little manga marks
  if (pose.angerMark > 0.05 && A.headTop) {
    const [x, y] = [A.headTop[0] + 120, A.headTop[1] + 40];
    ctx.save();
    ctx.globalAlpha = pose.angerMark;
    ctx.strokeStyle = '#e8432f';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const ang = Math.atan2(-dy, -dx);
      ctx.beginPath();
      ctx.arc(x + dx * 16, y + dy * 16, 10, ang - Math.PI / 2, ang + Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (pose.sweat > 0.05 && A.headTop) {
    const [x, y] = [A.headTop[0] - 140, A.headTop[1] + 120];
    ctx.save();
    ctx.globalAlpha = pose.sweat * 0.85;
    ctx.fillStyle = '#8fd0ff';
    ctx.strokeStyle = '#3d7fb8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.quadraticCurveTo(x + 14, y, x, y + 10);
    ctx.quadraticCurveTo(x - 14, y, x, y - 22);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

/**
 * Bust framing used by the mascot window: rig scaled to the canvas (w × h CSS px) with a
 * little headroom, plus a soft fade at the bottom edge so the cut-off waist never ends hard.
 */
export function paintRigFrame(
  ctx: CanvasRenderingContext2D,
  rig: RigManifest,
  imgs: RigImages,
  pose: RigPose,
  w: number,
  h: number,
): void {
  const [rw, rh] = rig.size;
  const sc = Math.min((w * 0.98) / rw, h / (rh * 0.95));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate((w - rw * sc) / 2, rh * 0.025 * sc);
  ctx.scale(sc, sc);
  drawRig(ctx, rig, imgs, pose);
  ctx.restore();
  const fadeH = h * 0.12;
  const g = ctx.createLinearGradient(0, h - fadeH, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, h - fadeH, w, fadeH);
  ctx.globalCompositeOperation = 'source-over';
}
