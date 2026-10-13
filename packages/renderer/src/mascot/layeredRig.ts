/**
 * Pseudo-3D layered 2D rig (Live2D-like feel without Live2D or WebGL).
 *
 * A rig is a handful of transparent PNG layers cut from one illustration
 * (body, head, side hair, ribbon, eyes, mouth + painted variants). The
 * animator below turns mascot state (expression / mouth / blink / look)
 * into per-layer transforms; `drawRig` paints them with Canvas2D only.
 */

export interface RigManifest {
  /** Rig canvas size in px (all anchors/offsets live in this space). */
  size: [number, number];
  /** Named pivots, e.g. neck, eyeL, eyeR, mouth, hairL, hairR, ribbon, cheekL, cheekR, headTop. */
  anchors: Record<string, [number, number]>;
  /** Layer name → top-left offset of its (trimmed) PNG in rig space. Files are `${dir}${name}.png`. */
  layers: Record<string, [number, number]>;
  /** Folder (relative to manifest) holding the layer PNGs. */
  dir?: string;
}

export type EyeVariant = 'open' | 'happy';
export type MouthVariant = 'closed' | 'open' | 'o' | 'frown';

export interface RigInput {
  expression: string;
  /** 0..1 from lip sync (RMS) */
  mouth: number;
  talking: boolean;
  /** 0 = eyes open, 1 = fully closed (blink envelope) */
  blink: number;
  lookX: number;
  lookY: number;
  reducedMotion?: boolean;
}

export interface RigPose {
  bodyY: number;
  bodyScaleY: number;
  headX: number;
  headY: number;
  headRot: number;
  featX: number;
  featY: number;
  hairRotL: number;
  hairRotR: number;
  ribbonRot: number;
  /** vertical eye scale, 1 open … 0 closed */
  eyeOpen: number;
  eyeScale: number;
  eyeVariant: EyeVariant;
  /** alpha of the painted closed-lid line */
  lidAlpha: number;
  mouthVariant: MouthVariant;
  mouthOpen: number;
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
  shake: number;
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
  shake: 0,
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
    breathRate: 1.35,
  },
  relaxed: { ...BASE, eyeOpen: 0.55, tilt: -2.5, headY: 2, blush: 0.35, breathRate: 0.7 },
  sad: {
    ...BASE,
    eyeOpen: 0.7,
    mouth: 'frown',
    tilt: -3,
    headY: 7,
    blush: 0,
    tint: [70, 110, 200, 0.09],
    breathRate: 0.6,
    sweat: 1,
  },
  angry: {
    ...BASE,
    eyeOpen: 0.78,
    mouth: 'frown',
    tilt: 1.5,
    headY: -1,
    blush: 0.55,
    tint: [230, 60, 40, 0.1],
    breathRate: 1.6,
    anger: 1,
    shake: 1,
  },
  surprised: {
    ...BASE,
    eyeScale: 1.14,
    mouth: 'o',
    mouthBase: 0.7,
    tilt: 0,
    headY: -8,
    blush: 0.25,
    breathRate: 1.4,
  },
};

export function expressionStyle(name: string): ExprStyle {
  return EXPRESSION_STYLES[name] ?? BASE;
}

function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/** Damped spring for secondary (hair / ribbon) motion. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private damp: number,
  ) {}
  step(target: number, dt: number): number {
    const a = (target - this.x) * this.k - this.v * this.damp;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

const DEG = Math.PI / 180;

/**
 * Stateful animator: call `step(dt, t, input)` once per frame.
 * Everything is smoothed so expression switches blend instead of popping.
 */
export class RigAnimator {
  private s = {
    eyeOpen: 1,
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
    mouth: 0,
    lookX: 0,
    lookY: 0,
  };
  private hairL = new Spring(60, 6);
  private hairR = new Spring(55, 5.5);
  private ribbon = new Spring(40, 4);
  private prevHeadRot = 0;
  private prevHeadX = 0;
  private bounce = 0;
  private lastExpr = 'neutral';

  step(dt: number, t: number, input: RigInput): RigPose {
    const st = expressionStyle(input.expression);
    const rm = !!input.reducedMotion;
    const s = this.s;
    const motion = rm ? 0 : 1;
    if (input.expression !== this.lastExpr) {
      if (input.expression === 'surprised' || input.expression === 'happy') this.bounce = 1;
      this.lastExpr = input.expression;
    }
    this.bounce = approach(this.bounce, 0, 5, dt);

    s.eyeOpen = approach(s.eyeOpen, st.eyeOpen, 10, dt);
    s.eyeScale = approach(s.eyeScale, st.eyeScale, 12, dt);
    s.tilt = approach(s.tilt, st.tilt, 4, dt);
    s.headY = approach(s.headY, st.headY, 5, dt);
    s.blush = approach(s.blush, st.blush, 4, dt);
    s.tr = approach(s.tr, st.tint[0], 6, dt);
    s.tg = approach(s.tg, st.tint[1], 6, dt);
    s.tb = approach(s.tb, st.tint[2], 6, dt);
    s.ta = approach(s.ta, st.tint[3], 4, dt);
    s.anger = approach(s.anger, st.anger, 6, dt);
    s.sweat = approach(s.sweat, st.sweat, 3, dt);
    s.happy = approach(s.happy, st.eyeVariant === 'happy' ? 1 : 0, 12, dt);
    s.lookX = approach(s.lookX, input.lookX, 6, dt);
    s.lookY = approach(s.lookY, input.lookY, 6, dt);

    const speaking = input.talking || input.mouth > 0.04;
    const mouthTarget = speaking ? Math.max(input.mouth, 0.12) : st.mouthBase;
    s.mouth = approach(s.mouth, mouthTarget, 18, dt);

    const br = st.breathRate;
    const breath = Math.sin(t * 1.6 * br) * motion;
    const sway = Math.sin(t * 0.55 + 0.7) * motion;
    const shake = st.shake ? Math.sin(t * 38) * 0.6 * s.anger * motion : 0;
    const talkNod = speaking
      ? Math.sin(t * 7.5) * 0.7 * Math.min(1, input.mouth * 2 + 0.2) * motion
      : 0;

    const headRot = (s.tilt + sway * 1.6 + s.lookX * 3.2 + talkNod * 0.4 + shake) * DEG;
    const headX = s.lookX * 10 + sway * 2 + shake * 2;
    const headY = s.headY - s.lookY * 6 + talkNod - this.bounce * 10 * motion;
    const bodyY = breath * 2.2 - this.bounce * 4 * motion;
    const bodyScaleY = 1 + breath * 0.006;

    // secondary motion: hair lags head angular/linear velocity + its own gentle drift
    const dRot = dt > 0 ? (headRot - this.prevHeadRot) / dt : 0;
    const dX = dt > 0 ? (headX - this.prevHeadX) / dt : 0;
    this.prevHeadRot = headRot;
    this.prevHeadX = headX;
    const drive = -dRot * 0.09 - dX * 0.0016;
    const drift = Math.sin(t * 1.3) * 0.9 * DEG * motion;
    const hairRotL = this.hairL.step(drive + drift, dt);
    const hairRotR = this.hairR.step(drive - drift * 0.8, dt);
    const ribbonRot = this.ribbon.step(drive * 1.6 + Math.sin(t * 1.9 + 1) * 3 * DEG * motion, dt);

    let eyeOpen = s.eyeOpen * (1 - input.blink);
    const happy = s.happy;
    const lidAlpha = Math.max(0, Math.min(1, (0.45 - eyeOpen) / 0.3)) * (1 - happy);
    eyeOpen = Math.max(0.02, eyeOpen);
    if (rm) {
      // keep blink + lip sync, damp all positional motion
      return this.finish(
        {
          bodyY: 0,
          bodyScaleY: 1,
          headX: s.lookX * 4,
          headY: s.headY * 0.5,
          headRot: s.tilt * 0.5 * DEG,
          hairRotL: 0,
          hairRotR: 0,
          ribbonRot: 0,
        },
        eyeOpen,
        lidAlpha,
        happy,
      );
    }
    return this.finish(
      { bodyY, bodyScaleY, headX, headY, headRot, hairRotL, hairRotR, ribbonRot },
      eyeOpen,
      lidAlpha,
      happy,
    );
  }

  private finish(
    m: Pick<
      RigPose,
      'bodyY' | 'bodyScaleY' | 'headX' | 'headY' | 'headRot' | 'hairRotL' | 'hairRotR' | 'ribbonRot'
    >,
    eyeOpen: number,
    lidAlpha: number,
    happy: number,
  ): RigPose {
    const s = this.s;
    const st = expressionStyle(this.lastExpr);
    let mouthVariant: MouthVariant = 'closed';
    if (s.mouth > 0.06) mouthVariant = st.mouth === 'o' ? 'o' : 'open';
    else if (st.mouth === 'frown') mouthVariant = 'frown';
    return {
      ...m,
      featX: s.lookX * 4,
      featY: -s.lookY * 3,
      eyeOpen: happy > 0.5 ? 1 : eyeOpen,
      eyeScale: s.eyeScale,
      eyeVariant: happy > 0.5 ? 'happy' : 'open',
      lidAlpha,
      mouthVariant,
      mouthOpen: Math.min(1, s.mouth),
      blush: s.blush,
      tint: { r: s.tr, g: s.tg, b: s.tb, a: s.ta },
      angerMark: s.anger,
      sweat: s.sweat,
    };
  }
}

export type RigImages = Map<string, CanvasImageSource & { width: number; height: number }>;

/** Layers a rig needs for the full feature set (missing ones are skipped). */
export const RIG_LAYERS = [
  'body',
  'head',
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
] as const;

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
function scratchCanvas(w: number, h: number) {
  if (!scratch) {
    scratch =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
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
  const layer = (name: string, alpha = 1) => {
    const img = imgs.get(name);
    const off = L[name];
    if (!img || !off || alpha <= 0.003) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, off[0], off[1]);
    if (alpha < 1) ctx.globalAlpha = 1;
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
  const [W, H] = rig.size;
  const neck = A.neck;

  // body breathes from the bottom edge
  ctx.save();
  ctx.translate(0, pose.bodyY);
  pivot([W / 2, H], () => layer('body'), 0, 1, pose.bodyScaleY);
  ctx.restore();

  const neckLift = (H - neck[1]) * (pose.bodyScaleY - 1) - pose.bodyY;
  ctx.save();
  ctx.translate(pose.headX, pose.headY - neckLift);
  ctx.translate(neck[0], neck[1]);
  ctx.rotate(pose.headRot);
  ctx.translate(-neck[0], -neck[1]);

  const tinted = pose.tint.a > 0.004;
  const head = imgs.get('head');
  const hOff = L.head;
  if (tinted && head && hOff) {
    // tint only the head's own pixels (source-atop on a scratch canvas)
    const c = scratchCanvas(head.width, head.height);
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (g) {
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(head, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${pose.tint.r | 0},${pose.tint.g | 0},${pose.tint.b | 0},${pose.tint.a})`;
      g.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(c as CanvasImageSource, hOff[0], hOff[1]);
    }
  } else {
    layer('head');
  }

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
  if (pose.eyeVariant === 'happy') {
    layer('eyes-happy');
  } else {
    if (pose.eyeOpen > 0.06) {
      pivot(A.eyeL, () => layer('eye-l'), 0, pose.eyeScale, pose.eyeOpen * pose.eyeScale);
      pivot(A.eyeR, () => layer('eye-r'), 0, pose.eyeScale, pose.eyeOpen * pose.eyeScale);
    }
    layer('eyes-closed', pose.lidAlpha);
  }
  if (pose.mouthVariant === 'closed' || pose.mouthVariant === 'frown') {
    layer(pose.mouthVariant === 'frown' ? 'mouth-frown' : 'mouth');
  } else {
    const name = pose.mouthVariant === 'o' ? 'mouth-o' : 'mouth-open';
    const open = 0.35 + 0.65 * pose.mouthOpen;
    pivot(
      A.mouth,
      () => layer(name),
      0,
      pose.mouthVariant === 'o' ? 0.8 + 0.2 * open : 0.85 + 0.15 * open,
      open,
    );
  }
  ctx.restore();

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
}
