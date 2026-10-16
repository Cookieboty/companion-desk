/**
 * Nomi action library — keyframe actions over the Live2D-style parameters (see params.ts).
 *
 * Authoring rules
 *  - Only action / pose parameters are driven here. Brand layers (hair clips, ribbon, N logo, tag,
 *    choker charm …) are never touched; arms are the master sleeve cut into rigid pieces, hands are the
 *    hand pieces, faces use the master eye / mouth plates plus vector strokes.
 *  - Arm poses are given as [shoulder a°, elbow e°, wrist w°]; they were solved against the real
 *    geometry so hands land in the free space around the head (never off the canvas).
 *  - First / last keys of a one-shot are the rest pose; the manager crossfades the weights.
 */
import type { ActionDef, Ease, Key, Track } from './actionTypes';
import { ARM_POSES } from './armPoses.generated';
import type { ArmPose } from './armPoses.generated';
import { BROW, EYE, HAND, MOUTH } from './params';

type Pose = ArmPose;

const T = (p: string, ...k: Key[]): Track => ({ p, k });

/** hold a discrete code between two times */
const hold = (p: string, from: number, to: number, v: number): Track =>
  from <= 0 ? T(p, [0, v], [to, 0, 's']) : T(p, [0, 0], [from, v, 's'], [to, 0, 's']);

/**
 * One arm as a 2-bone chain: every joint (shoulder a, elbow e, wrist w, reach z) gets its own key
 * list, staggered proximal → distal (the elbow trails the shoulder by ~50 ms, the wrist by ~100 ms),
 * with a small anticipation dip, a touch of overshoot on arrival and a staggered return to rest.
 * The poses are the IK solutions of armTargets.ts (hand centre on a named landmark), so the hand
 * really lands on chin / cheek / hair / chest; `via` chains further targets (e.g. mouth → blow).
 * `rMix`/`lMix` fades the hand piece + sleeve taper in/out continuously (no swap pop).
 */
const JOINT_LAG = [0.06, -0.08, 0.08, 0.02] as const;
/** the elbow folds first (fast start) and unfolds last, so the forearm never sweeps out wide while the arm lifts */
const RISE_EASE = ['io', 'o', 'io', 'io'] as const;
const FALL_EASE = ['o', 'i', 'io', 'io'] as const;
function arm(
  side: 'r' | 'l',
  hand: number,
  pose: Pose,
  t0: number,
  t1: number,
  dur: number,
  opts: ArmOpts = {},
): Track[] {
  const ease = opts.ease ?? 'io';
  const win = opts.win ?? [t0, t1];
  const ret = opts.ret ?? t1 <= dur - 0.3;
  const tAnt = opts.fast ? 0.05 : Math.max(0.08, t0 * 0.35);
  const tArr = Math.max(t0, tAnt + (opts.fast ? 0.28 : 0.45));
  const via = opts.via ?? [];
  const last = via.length ? via[via.length - 1][1] : pose;
  const key = (i: number): Key[] => {
    const lag = JOINT_LAG[i];
    const tLift = Math.max(tAnt + 0.1, tArr + lag);
    const hold1 = Math.max(t1, (via.length ? via[via.length - 1][0] : 0) + 0.2);
    if (i === 3) {
      // reach: while the elbow folds the forearm swings up toward the camera (foreshortened), so the
      // hand never sweeps sideways off the canvas; it settles to the pose's own reach afterwards
      const zb = Math.max(pose[3], 0.62);
      const keys: Key[] = [
        [0, 0],
        [tAnt, 0],
        [tAnt + 0.2, zb, 'o'],
        [tArr + 0.12, pose[3], 'io'],
      ];
      for (const [tv, pv] of via) keys.push([tv, pv[3], 'io']);
      if (ret) {
        const end = dur;
        keys.push(
          [hold1, last[3]],
          [hold1 + 0.12, zb, 'io'],
          [end - 0.12, zb * 0.6, 'io'],
          [end, 0, 'io'],
        );
      } else keys.push([dur, last[3]]);
      return keys;
    }
    // the shoulder first swings IN across the body while the elbow folds (the forearm passes in front
    // of the torso instead of sweeping out past the canvas edge), then abducts to the pose
    const dip = Math.min(26, 5 + Math.abs(pose[1]) * 0.13);
    const ant =
      i === 0
        ? -dip * Math.sign(pose[1] || 1) * (pose[1] < 0 ? 0.35 : 1)
        : -Math.sign(pose[i] || 1) * Math.min(7, 1.5 + Math.abs(pose[i]) * 0.05);
    const over = Math.max(-109, Math.min(109, pose[i] * 1.04));
    const keys: Key[] = [
      [0, 0],
      [i === 0 ? tAnt + 0.12 : tAnt, ant, 'o'],
      [tLift, over, i === 0 || i === 2 ? ease : RISE_EASE[i]],
      [tLift + 0.2, pose[i], 'io'],
    ];
    for (const [tv, pv] of via) keys.push([tv + lag, pv[i], 'io']);
    if (ret) {
      const end = Math.min(dur, dur - 0.04 - lag);
      const tEnd = Math.max(hold1 + 0.2, end);
      keys.push([hold1, last[i]]);
      if (i === 0 && last[1] > 0) keys.push([hold1 + (tEnd - hold1) * 0.55, -dip * 0.8, 'io']);
      keys.push([tEnd, 0, i === 0 ? 'io' : FALL_EASE[i]]);
      if (end < dur) keys.push([dur, 0]);
    } else keys.push([dur, last[i]]);
    return keys;
  };
  const mixKeys: Key[] = ret
    ? [
        [0, 0],
        [tAnt, 0],
        [Math.max(tAnt + 0.1, tArr - 0.1), 1, 'io'],
        [Math.max(t1, dur - 0.3), 1],
        [dur - 0.03, 0, 'io'],
        [dur, 0],
      ]
    : [
        [0, 0],
        [tAnt, 0],
        [Math.max(tAnt + 0.1, tArr - 0.1), 1, 'io'],
        [dur, 1],
      ];
  return [
    T(`${side}On`, [0, 1]),
    T(`${side}Hand`, [0, hand]),
    T(`${side}Mix`, ...mixKeys),
    { p: `${side}A`, k: key(0), osc: opts.oscA, oscWin: win },
    { p: `${side}E`, k: key(1), osc: opts.oscE, oscWin: win },
    { p: `${side}W`, k: key(2), osc: opts.oscW, oscWin: win },
    T(`${side}Z`, ...key(3)),
  ];
}
type Osc = [amp: number, hz: number, phase?: number];
type ArmOpts = {
  oscE?: Osc;
  oscW?: Osc;
  oscA?: Osc;
  win?: [number, number];
  ease?: Ease;
  /** lower the arm again before the action ends (default: when t1 <= dur - 0.3) */
  ret?: boolean;
  /** snappy arrival (surprise, recoil …) */
  fast?: boolean;
  /** further targets after the first: [time the pose is reached, pose] */
  via?: ReadonlyArray<readonly [number, Pose]>;
};
/** both arms with their own solved (mirrored) poses; `o` is shared so oscillations stay mirrored */
const both = (
  hand: number,
  p: { r: Pose; l: Pose },
  t0: number,
  t1: number,
  dur: number,
  o: ArmOpts = {},
) => [...arm('r', hand, p.r, t0, t1, dur, o), ...arm('l', hand, p.l, t0, t1, dur, o)];

/** pulse: 0 → v → 0 over [from, to] */
const pulse = (p: string, from: number, peak: number, to: number, v: number): Track =>
  T(p, [0, 0], [from, 0], [peak, v, 'o'], [to, 0, 'io']);

// --- arm poses: IK solutions (r = screen-right arm = the character's LEFT arm; l = its mirror) ----
const P = ARM_POSES;

export const ACTIONS: readonly ActionDef[] = [
  // ---- greet ---------------------------------------------------------------------------------
  {
    id: 'wave',
    label: '挥手',
    category: 'greet',
    dur: 2.3,
    trigger: '问候 / 早安 / 首次打开 / 用户说“你好”', // i18n-ignore
    tracks: [
      ...arm('r', HAND.wave, P.waveUp.r, 0.45, 1.85, 2.3, {
        oscW: [16, 2.8, 0],
        oscE: [6, 2.8, 1.4],
        win: [0.55, 1.85],
      }),
      pulse('headRot', 0.2, 0.7, 2.2, 7),
      pulse('headNod', 0.1, 0.35, 0.8, 5),
      hold('mouth', 0.3, 1.9, MOUTH.smile),
      pulse('blush', 0.3, 0.8, 2.0, 0.2),
    ],
  },
  {
    id: 'hello',
    label: '打招呼',
    category: 'greet',
    dur: 1.9,
    priority: 1,
    trigger: '界面首次出现的轻招呼（点头 + 小幅挥手）', // i18n-ignore
    tracks: [
      ...arm('r', HAND.wave, P.waveOut.r, 0.35, 1.5, 1.9, {
        oscW: [12, 3.1, 0],
        oscE: [4, 3.1, 1.3],
        win: [0.45, 1.5],
      }),
      T('headNod', [0, 0], [0.3, 8, 'o'], [0.6, 0, 'io'], [0.95, 5, 'o'], [1.4, 0]),
      hold('mouth', 0.25, 1.6, MOUTH.smile),
    ],
  },
  {
    id: 'nod',
    label: '点头',
    category: 'agree',
    dur: 1.2,
    trigger: '回答“好 / 明白了”、确认', // i18n-ignore
    tracks: [
      T('headNod', [0, 0], [0.22, 12, 'o'], [0.45, 0, 'io'], [0.7, 11, 'o'], [1.1, 0, 'io']),
      T('shoulder', [0, 0], [0.25, -2, 'o'], [1.1, 0]),
      hold('eyeL', 0.15, 0.55, EYE.half),
      hold('eyeR', 0.15, 0.55, EYE.half),
      hold('mouth', 0.2, 1.0, MOUTH.smile),
    ],
  },
  {
    id: 'shake_head',
    label: '摇头',
    category: 'agree',
    dur: 1.4,
    trigger: '否定、“不行 / 没有”', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.18, 10, 'o'], [0.42, -10], [0.66, 9], [0.9, -8], [1.2, 0]),
      T('headX', [0, 0], [0.18, 6, 'o'], [0.42, -6], [0.66, 5], [0.9, -4], [1.2, 0]),
      hold('eyeL', 0.1, 1.15, EYE.closed),
      hold('eyeR', 0.1, 1.15, EYE.closed),
      hold('mouth', 0.1, 1.2, MOUTH.wavy),
      hold('brow', 0.1, 1.2, BROW.worried),
    ],
  },
  {
    id: 'bow',
    label: '鞠躬',
    category: 'greet',
    dur: 2.0,
    trigger: '感谢 / 告别 / 道歉的礼貌版', // i18n-ignore
    tracks: [
      T('headNod', [0, 0], [0.5, 20, 'io'], [1.3, 20], [2.0, 0, 'io']),
      T('bodyY', [0, 0], [0.5, 8, 'io'], [1.3, 8], [2.0, 0, 'io']),
      T('torsoRot', [0, 0], [0.5, 2, 'io'], [1.3, 2], [2.0, 0, 'io']),
      hold('eyeL', 0.35, 1.5, EYE.closed),
      hold('eyeR', 0.35, 1.5, EYE.closed),
      hold('mouth', 0.3, 1.6, MOUTH.smile),
    ],
  },
  {
    id: 'salute',
    label: '敬礼',
    category: 'greet',
    dur: 1.9,
    trigger: '收到指令 / “收到！”', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.temple.r, 0.35, 1.4, 1.9, {
        oscW: [3, 1.6, 0],
        win: [0.55, 1.35],
      }),
      T('headRot', [0, 0], [0.4, -3, 'o'], [1.5, -3], [1.9, 0]),
      hold('eyeL', 0.3, 1.5, EYE.determined),
      hold('eyeR', 0.3, 1.5, EYE.determined),
      hold('mouth', 0.3, 1.5, MOUTH.grin),
    ],
  },
  // ---- think / explain -----------------------------------------------------------------------

  {
    id: 'pray',
    label: '合十',
    category: 'emotion',
    dur: 2.8,
    trigger: '感谢 / 拜托 / 祈祷', // i18n-ignore
    tracks: [
      // both arms rise symmetrically; the renderer draws ONE prayer piece at their joint
      ...both(HAND.prayer, P.pray, 0.45, 2.2, 2.8, { ease: 'io' }),
      hold('armFront', 0.35, 99, 1),
      T('headNod', [0, 0], [0.5, 10, 'io'], [2.0, 10], [2.8, 0]),
      hold('eyeL', 0.4, 2.4, EYE.closed),
      hold('eyeR', 0.4, 2.4, EYE.closed),
      hold('mouth', 0.4, 2.4, MOUTH.smile),
      T('fxSparkle', [0, 0], [0.6, 0.6], [2.2, 0.6], [2.8, 0]),
    ],
  },
  {
    id: 'ok_hand',
    label: 'OK 手势',
    category: 'celebrate',
    dur: 2.2,
    trigger: '确认 / 没问题 / OK', // i18n-ignore
    tracks: [
      ...arm('r', HAND.ok, P.okSide.r, 0.35, 1.8, 2.2),
      T('headNod', [0, 0], [0.4, 6, 'o'], [1.6, 6], [2.2, 0]),
      hold('eyeL', 0.3, 1.9, EYE.happy),
      hold('eyeR', 0.3, 1.9, EYE.happy),
      hold('mouth', 0.3, 1.9, MOUTH.smile),
      T('fxSparkle', [0, 0], [0.4, 0.7], [1.8, 0.7], [2.2, 0]),
    ],
  },
  {
    id: 'think',
    label: '托腮思考',
    category: 'think',
    dur: 3.4,
    hold: true,
    maxHold: 14,
    loopFrom: 1.6,
    priority: 1,
    trigger: 'AI 思考中 / 长时间等待', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.chin.r, 0.5, 3.4, 3.4, {
        oscW: [4, 1.1, 0],
        oscE: [2, 0.9, 0.5],
        win: [0.8, 99],
      }),
      hold('armFront', 0.3, 99, 1),
      T('headRot', [0, 0], [0.7, -9, 'io'], [3.4, -9]),
      T('gazeX', [0, 0], [0.7, -0.5, 'io'], [3.4, -0.5]),
      T('gazeY', [0, 0], [0.7, 0.6, 'io'], [3.4, 0.6]),
      hold('eyeL', 0.6, 99, EYE.half),
      hold('eyeR', 0.6, 99, EYE.half),
      hold('mouth', 0.6, 99, MOUTH.pout),
      hold('brow', 0.6, 99, BROW.soft),
      T('fxQuestion', [0, 0], [1.1, 0], [1.6, 0.8, 'o']),
    ],
  },
  {
    id: 'explain',
    label: '讲解',
    category: 'think',
    dur: 2.6,
    trigger: '长回答 / 讲解步骤（竖起食指）', // i18n-ignore
    tracks: [
      ...arm('r', HAND.point, P.point.r, 0.45, 2.2, 2.6, { oscA: [2, 1.4, 0], win: [0.8, 2.2] }),
      T('headRot', [0, 0], [0.5, 5, 'io'], [2.2, 5], [2.6, 0]),
      pulse('headNod', 0.5, 0.8, 2.4, -3),
      hold('mouth', 0.4, 2.3, MOUTH.smile),
      hold('brow', 0.5, 2.3, BROW.up),
    ],
  },
  {
    id: 'eureka',
    label: '灵光一闪',
    category: 'think',
    dur: 2.2,
    trigger: '想到办法 / 找到答案', // i18n-ignore
    tracks: [
      ...arm('r', HAND.point, P.pointUp.r, 0.3, 1.8, 2.2),
      T('headNod', [0, 0], [0.2, -8, 'o'], [0.6, 0, 'io'], [2.2, 0]),
      hold('eyeL', 0.15, 1.7, EYE.wide),
      hold('eyeR', 0.15, 1.7, EYE.wide),
      hold('mouth', 0.2, 1.7, MOUTH.open),
      hold('brow', 0.15, 1.7, BROW.up),
      T('fxExclaim', [0, 0], [0.2, 1, 'b'], [1.7, 1], [2.1, 0]),
      T('fxSparkle', [0, 0], [0.25, 1, 'o'], [1.7, 0.8], [2.2, 0]),
    ],
  },
  {
    id: 'puzzled',
    label: '疑惑歪头',
    category: 'think',
    dur: 2.4,
    trigger: '听不懂 / 需要澄清', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.4, 14, 'b'], [2.0, 14], [2.4, 0]),
      T('torsoRot', [0, 0], [0.5, 1.5], [2.0, 1.5], [2.4, 0]),
      T('gazeX', [0, 0], [0.4, 0.4, 'io'], [2.0, 0.4], [2.4, 0]),
      T('gazeY', [0, 0], [0.4, 0.5], [2.0, 0.5], [2.4, 0]),
      hold('eyeL', 0.3, 2.1, EYE.wide),
      hold('mouth', 0.3, 2.1, MOUTH.wavy),
      hold('brow', 0.3, 2.1, BROW.worried),
      T('fxQuestion', [0, 0], [0.5, 1, 'o'], [2.0, 1], [2.4, 0]),
    ],
  },
  {
    id: 'look_around',
    label: '张望',
    category: 'idle',
    dur: 3.0,
    cooldown: 20,
    idle: true,
    priority: 0,
    trigger: '空闲随机 / 等待用户（手遮额头远眺）', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.visor.r, 0.5, 2.5, 3.0),
      T('headRot', [0, 0], [0.6, -8, 'io'], [1.4, -8], [1.9, 8, 'io'], [2.5, 8], [3.0, 0]),
      T('headX', [0, 0], [0.6, -8, 'io'], [1.4, -8], [1.9, 8, 'io'], [2.5, 8], [3.0, 0]),
      T('gazeX', [0, 0], [0.6, -0.8, 'io'], [1.4, -0.8], [1.9, 0.8, 'io'], [2.5, 0.8], [3.0, 0]),
      hold('eyeL', 0.4, 2.7, EYE.wide),
      hold('eyeR', 0.4, 2.7, EYE.wide),
    ],
  },
  {
    id: 'look_lr',
    label: '左顾右盼',
    category: 'idle',
    dur: 2.6,
    cooldown: 15,
    idle: true,
    priority: 0,
    trigger: '空闲随机', // i18n-ignore
    tracks: [
      T(
        'headRot',
        [0, 0],
        [0.5, -10, 'io'],
        [1.1, -10],
        [1.4, 11, 'io'],
        [2.0, 11],
        [2.6, 0, 'io'],
      ),
      T('torsoX', [0, 0], [0.5, -6, 'io'], [1.1, -6], [1.4, 6, 'io'], [2.0, 6], [2.6, 0, 'io']),
      T('gazeX', [0, 0], [0.45, -0.9, 'io'], [1.1, -0.9], [1.35, 0.9, 'io'], [2.0, 0.9], [2.6, 0]),
      hold('mouth', 0.2, 2.3, MOUTH.o),
    ],
  },
  {
    id: 'peek',
    label: '偷看',
    category: 'emotion',
    dur: 2.6,
    cooldown: 25,
    idle: true,
    priority: 0,
    trigger: '空闲随机（害羞地偷看用户）', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.cheek, 0.45, 2.2, 2.6),
      hold('armFront', 0.3, 99, 1),
      T('headRot', [0, 0], [0.5, 6], [2.2, 6], [2.6, 0]),
      T('gazeX', [0, 0], [0.6, 0.7, 'io'], [1.6, 0.7], [2.0, 0.3], [2.6, 0]),
      hold('eyeL', 0.3, 2.3, EYE.wide),
      hold('eyeR', 0.3, 2.3, EYE.wide),
      T('blush', [0, 0], [0.5, 1, 'o'], [2.2, 1], [2.6, 0]),
      hold('mouth', 0.4, 2.2, MOUTH.cat),
    ],
  },
  // ---- emotion --------------------------------------------------------------------------------
  {
    id: 'heart',
    label: '比心',
    category: 'emotion',
    dur: 2.6,
    trigger: '表达喜欢 / 被夸奖 / 摸头', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.heart.r, 0.45, 2.1, 2.6, {
        oscW: [5, 1.8, 0],
        win: [0.6, 2.0],
      }),
      T('headRot', [0, 0], [0.5, 8, 'b'], [2.1, 8], [2.6, 0]),
      hold('eyeL', 0.3, 2.3, EYE.happy),
      hold('eyeR', 0.3, 2.3, EYE.happy),
      hold('mouth', 0.3, 2.3, MOUTH.smile),
      T('blush', [0, 0], [0.5, 1, 'o'], [2.2, 0.8], [2.6, 0]),
      T('fxHeart', [0, 0], [0.5, 1, 'o'], [2.1, 1], [2.6, 0]),
    ],
  },
  {
    id: 'blow_kiss',
    label: '送飞吻',
    category: 'emotion',
    dur: 2.4,
    trigger: '告别 / 感谢', // i18n-ignore
    tracks: [
      // hand to the lips, then the arm sweeps out as the kiss leaves
      ...arm('r', HAND.rest, P.mouth.r, 0.8, 2.0, 2.4, { via: [[1.45, P.blowOut.r]] }),
      hold('armFront', 0.2, 99, 1),
      T('headRot', [0, 0], [0.6, 9, 'o'], [2.0, 9], [2.4, 0]),
      hold('eyeL', 0.3, 2.0, EYE.happy),
      hold('eyeR', 0.5, 2.0, EYE.closed),
      hold('mouth', 0.3, 1.2, MOUTH.pout),
      hold('mouth', 1.2, 2.0, MOUTH.smile),
      T('fxHeart', [0, 0], [1.2, 0], [1.5, 1, 'o'], [2.1, 1], [2.4, 0]),
    ],
  },
  {
    id: 'shy',
    label: '害羞',
    category: 'emotion',
    dur: 2.8,
    trigger: '被夸奖 / 被摸头太久', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.cheek, 0.5, 2.3, 2.8),
      hold('armFront', 0.3, 99, 1),
      T('headRot', [0, 0], [0.6, -8, 'io'], [2.3, -8], [2.8, 0]),
      T('headNod', [0, 0], [0.6, 6, 'io'], [2.3, 6], [2.8, 0]),
      T('gazeX', [0, 0], [0.6, 0.5], [2.3, 0.5], [2.8, 0]),
      T('gazeY', [0, 0], [0.6, 0.5], [2.3, 0.5], [2.8, 0]),
      hold('eyeL', 0.4, 2.4, EYE.half),
      hold('eyeR', 0.4, 2.4, EYE.half),
      hold('mouth', 0.4, 2.4, MOUTH.wavy),
      hold('brow', 0.4, 2.4, BROW.worried),
      T('blush', [0, 0], [0.5, 1, 'o'], [2.4, 1], [2.8, 0]),
      T('fxBlush', [0, 0], [0.5, 1, 'o'], [2.4, 1], [2.8, 0]),
    ],
  },
  {
    id: 'cover_face',
    label: '捂脸',
    category: 'emotion',
    dur: 2.6,
    trigger: '尴尬 / 出错后的不好意思', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.coverFace, 0.4, 2.2, 2.6),
      hold('armFront', 0.25, 99, 1),
      T('headNod', [0, 0], [0.5, 10, 'io'], [2.2, 10], [2.6, 0]),
      hold('eyeL', 0.3, 2.3, EYE.closed),
      hold('eyeR', 0.3, 2.3, EYE.closed),
      hold('mouth', 0.3, 2.3, MOUTH.wavy),
      T('fxBlush', [0, 0], [0.5, 1, 'o'], [2.3, 1], [2.6, 0]),
      T('fxSweat', [0, 0], [0.6, 0.8], [2.3, 0.8], [2.6, 0]),
    ],
  },
  {
    id: 'sorry',
    label: '道歉',
    category: 'emotion',
    dur: 2.8,
    priority: 3,
    trigger: '任务失败 / 出错（双手交叠在身前，轻轻低头）', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.sorry, 0.45, 2.3, 2.8),
      hold('armFront', 0.3, 99, 1),
      T('headNod', [0, 0], [0.55, 14, 'io'], [2.3, 14], [2.8, 0]),
      T('bodyY', [0, 0], [0.55, 4, 'io'], [2.3, 4], [2.8, 0]),
      hold('eyeL', 0.4, 2.4, EYE.sad),
      hold('eyeR', 0.4, 2.4, EYE.sad),
      hold('brow', 0.4, 2.4, BROW.worried),
      hold('mouth', 0.4, 2.4, MOUTH.frown),
      T('fxSweat', [0, 0], [0.7, 1], [2.3, 1], [2.8, 0]),
    ],
  },
  {
    id: 'surprise',
    label: '惊讶',
    category: 'react',
    dur: 1.8,
    priority: 2,
    trigger: '拖入文件 / 突然的事件', // i18n-ignore
    tracks: [
      ...both(HAND.wave, P.surprise, 0.2, 1.4, 1.8, { fast: true }),
      T('bodyY', [0, 0], [0.12, -8, 'o'], [0.5, 0, 'io'], [1.8, 0]),
      T('headNod', [0, 0], [0.12, -10, 'o'], [0.6, 0], [1.8, 0]),
      T('scale', [0, 0], [0.12, -0.02, 'o'], [0.5, 0], [1.8, 0]),
      hold('eyeL', 0.05, 1.5, EYE.wide),
      hold('eyeR', 0.05, 1.5, EYE.wide),
      hold('mouth', 0.05, 1.5, MOUTH.o),
      hold('brow', 0.05, 1.5, BROW.up),
      T('fxExclaim', [0, 0], [0.12, 1, 'b'], [1.3, 1], [1.8, 0]),
    ],
  },
  {
    id: 'sigh',
    label: '叹气',
    category: 'emotion',
    dur: 3.0,
    trigger: '长时间失败 / 无聊', // i18n-ignore
    tracks: [
      ...arm('r', HAND.chest, P.chest.r, 0.6, 2.5, 3.0),
      hold('armFront', 0.4, 99, 1),
      T('headNod', [0, 0], [0.8, 8, 'io'], [2.0, 12, 'io'], [3.0, 0]),
      T('shoulder', [0, 0], [0.6, -6, 'o'], [1.6, 4, 'io'], [3.0, 0]),
      hold('eyeL', 0.6, 2.6, EYE.half),
      hold('eyeR', 0.6, 2.6, EYE.half),
      hold('mouth', 0.6, 2.6, MOUTH.o),
      hold('brow', 0.5, 2.6, BROW.worried),
      T('fxGloom', [0, 0], [0.9, 0.9], [2.5, 0.9], [3.0, 0]),
    ],
  },
  {
    id: 'smug',
    label: '得意',
    category: 'emotion',
    dur: 2.4,
    trigger: '做对难题 / 任务一次成功', // i18n-ignore
    tracks: [
      ...arm('r', HAND.thumbsup, P.thumbChest.r, 0.4, 2.0, 2.4),
      T('headNod', [0, 0], [0.4, -8, 'io'], [2.0, -8], [2.4, 0]),
      T('headRot', [0, 0], [0.4, -6], [2.0, -6], [2.4, 0]),
      hold('eyeL', 0.3, 2.1, EYE.half),
      hold('eyeR', 0.3, 2.1, EYE.half),
      hold('mouth', 0.3, 2.1, MOUTH.cat),
      hold('brow', 0.3, 2.1, BROW.up),
      T('fxSparkle', [0, 0], [0.5, 0.8], [2.0, 0.8], [2.4, 0]),
    ],
  },
  {
    id: 'aggrieved',
    label: '委屈',
    category: 'emotion',
    dur: 3.0,
    trigger: '被批评 / 反复失败', // i18n-ignore
    tracks: [
      ...both(HAND.fist, P.cheekPaw, 0.5, 2.5, 3.0),
      hold('armFront', 0.3, 99, 1),
      T('headNod', [0, 0], [0.6, 9, 'io'], [2.5, 9], [3.0, 0]),
      T('headRot', [0, 0], [0.6, 5], [2.5, 5], [3.0, 0]),
      hold('eyeL', 0.4, 2.6, EYE.sad),
      hold('eyeR', 0.4, 2.6, EYE.sad),
      hold('mouth', 0.4, 2.6, MOUTH.frown),
      hold('brow', 0.4, 2.6, BROW.worried),
      T('fxTear', [0, 0], [0.8, 1], [2.6, 1], [3.0, 0]),
      T('blush', [0, 0], [0.6, 0.6], [2.6, 0.6], [3.0, 0]),
    ],
  },
  {
    id: 'tears',
    label: '流泪',
    category: 'emotion',
    dur: 3.0,
    trigger: '感动 / 很难过', // i18n-ignore
    tracks: [
      T('headNod', [0, 0], [0.6, 7, 'io'], [2.5, 7], [3.0, 0]),
      hold('eyeL', 0.3, 2.7, EYE.sad),
      hold('eyeR', 0.3, 2.7, EYE.sad),
      hold('mouth', 0.3, 2.7, MOUTH.wavy),
      hold('brow', 0.3, 2.7, BROW.worried),
      T('fxTear', [0, 0], [0.5, 1], [2.6, 1], [3.0, 0]),
    ],
  },
  {
    id: 'angry',
    label: '生气（轻微）',
    category: 'emotion',
    dur: 2.2,
    trigger: '被打断 / 连续失败', // i18n-ignore
    tracks: [
      T('torsoX', [0, 0], [0.1, 3], [0.2, -3], [0.3, 2], [0.4, -2], [0.5, 0], [2.2, 0]),
      T('headNod', [0, 0], [0.4, 5, 'o'], [1.9, 5], [2.2, 0]),
      hold('eyeL', 0.15, 2.0, EYE.determined),
      hold('eyeR', 0.15, 2.0, EYE.determined),
      hold('mouth', 0.15, 2.0, MOUTH.pout),
      hold('brow', 0.15, 2.0, BROW.angry),
      T('fxAnger', [0, 0], [0.25, 1, 'b'], [1.9, 1], [2.2, 0]),
      T('blush', [0, 0], [0.4, 0.6], [1.9, 0.6], [2.2, 0]),
    ],
  },
  {
    id: 'cold_sweat',
    label: '冷汗',
    category: 'emotion',
    dur: 2.4,
    trigger: '紧张 / 尴尬 / 超时', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.4, -5], [2.0, -5], [2.4, 0]),
      hold('eyeL', 0.2, 2.1, EYE.wide),
      hold('eyeR', 0.2, 2.1, EYE.wide),
      hold('mouth', 0.2, 2.1, MOUTH.wavy),
      hold('brow', 0.2, 2.1, BROW.worried),
      T('fxSweat', [0, 0], [0.3, 1], [2.1, 1], [2.4, 0]),
      T('fxGloom', [0, 0], [0.5, 0.6], [2.0, 0.6], [2.4, 0]),
    ],
  },
  {
    id: 'daze',
    label: '发呆',
    category: 'idle',
    dur: 3.4,
    cooldown: 40,
    idle: true,
    priority: 0,
    trigger: '空闲随机', // i18n-ignore
    tracks: [
      T('headNod', [0, 0], [0.8, 4, 'io'], [3.0, 4], [3.4, 0]),
      T('gazeX', [0, 0], [0.8, 0.2], [3.0, 0.2], [3.4, 0]),
      T('gazeY', [0, 0], [0.8, 0.3], [3.0, 0.3], [3.4, 0]),
      hold('eyeL', 0.5, 3.0, EYE.half),
      hold('eyeR', 0.5, 3.0, EYE.half),
      hold('mouth', 0.6, 3.0, MOUTH.o),
    ],
  },
  // ---- celebrate ------------------------------------------------------------------------------
  {
    id: 'cheer',
    label: '加油握拳',
    category: 'celebrate',
    dur: 2.2,
    trigger: '鼓励用户 / 开始新任务', // i18n-ignore
    tracks: [
      ...arm('r', HAND.fist, P.fistUp.r, 0.3, 1.8, 2.2, { oscE: [5, 3, 0], win: [0.5, 1.8] }),
      T('bodyY', [0, 0], [0.25, 3, 'io'], [0.4, -6, 'o'], [0.7, 0, 'io'], [2.2, 0]),
      T('headRot', [0, 0], [0.45, 5, 'io'], [1.75, 5], [2.2, 0, 'io']),
      hold('eyeL', 0.2, 1.9, EYE.determined),
      hold('eyeR', 0.2, 1.9, EYE.determined),
      hold('mouth', 0.2, 1.9, MOUTH.grin),
      hold('brow', 0.2, 1.9, BROW.up),
      T('fxSparkle', [0, 0], [0.5, 0.7], [1.8, 0.7], [2.2, 0]),
    ],
  },
  {
    id: 'thumbs_up',
    label: '点赞',
    category: 'celebrate',
    dur: 2.2,
    priority: 3,
    trigger: '任务完成 / 用户做得好', // i18n-ignore
    tracks: [
      ...arm('r', HAND.thumbsup, P.thumb.r, 0.35, 1.8, 2.2),
      T('bodyY', [0, 0], [0.35, -4, 'o'], [0.7, 0, 'io'], [2.2, 0]),
      T('headRot', [0, 0], [0.4, 5], [1.8, 5], [2.2, 0]),
      hold('eyeL', 0.3, 1.9, EYE.happy),
      hold('eyeR', 0.3, 1.9, EYE.happy),
      hold('mouth', 0.3, 1.9, MOUTH.grin),
      T('fxSparkle', [0, 0], [0.5, 0.9], [1.8, 0.9], [2.2, 0]),
    ],
  },
  {
    id: 'peace',
    label: '剪刀手',
    category: 'celebrate',
    dur: 2.2,
    trigger: '拍照 / 自拍 / 开心', // i18n-ignore
    tracks: [
      ...arm('r', HAND.peace, P.peaceUp.r, 0.35, 1.8, 2.2),
      T('headRot', [0, 0], [0.4, -8, 'b'], [1.8, -8], [2.2, 0]),
      hold('eyeL', 0.3, 1.9, EYE.happy),
      hold('eyeR', 0.5, 1.9, EYE.closed),
      hold('mouth', 0.3, 1.9, MOUTH.tongue),
      T('fxSparkle', [0, 0], [0.5, 1], [1.8, 1], [2.2, 0]),
    ],
  },
  {
    id: 'celebrate',
    label: '庆祝（双手举高）',
    category: 'celebrate',
    dur: 2.6,
    priority: 3,
    trigger: '任务全部完成 / 里程碑', // i18n-ignore
    tracks: [
      ...both(HAND.wave, P.waveHigh, 0.3, 2.2, 2.6, {
        oscW: [10, 3.2, 0],
        win: [0.6, 2.2],
      }),
      T(
        'bodyY',
        [0, 0],
        [0.22, 3, 'io'],
        [0.42, -9, 'o'],
        [0.68, 1.5, 'io'],
        [0.95, -8, 'o'],
        [1.25, 0.8, 'io'],
        [1.55, -6, 'o'],
        [1.85, 0, 'io'],
        [2.6, 0],
      ),
      hold('eyeL', 0.2, 2.3, EYE.happy),
      hold('eyeR', 0.2, 2.3, EYE.happy),
      hold('mouth', 0.2, 2.3, MOUTH.grin),
      T('fxStar', [0, 0], [0.3, 1], [2.2, 1], [2.6, 0]),
      T('fxSparkle', [0, 0], [0.3, 1], [2.2, 1], [2.6, 0]),
    ],
  },
  {
    id: 'clap',
    label: '鼓掌',
    category: 'celebrate',
    dur: 2.4,
    trigger: '夸奖 / 用户完成目标', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.clap.r, 0.35, 2.0, 2.4, {
        oscE: [9, 3.6, 0],
        oscW: [8, 3.6, 0.2],
        win: [0.5, 2.0],
      }),
      ...arm('l', HAND.rest, P.clap.l, 0.35, 2.0, 2.4, {
        oscE: [9, 3.6, 0],
        oscW: [8, 3.6, 0.2],
        win: [0.5, 2.0],
      }),
      hold('armFront', 0.25, 99, 1),
      T(
        'bodyY',
        [0, 0],
        [0.5, -2, 'io'],
        [0.75, 1, 'io'],
        [1.0, -2, 'io'],
        [1.25, 1, 'io'],
        [1.5, -2, 'io'],
        [1.75, 0, 'io'],
        [2.4, 0],
      ),
      hold('eyeL', 0.2, 2.1, EYE.happy),
      hold('eyeR', 0.2, 2.1, EYE.happy),
      hold('mouth', 0.2, 2.1, MOUTH.smile),
      T('fxSparkle', [0, 0], [0.5, 0.7], [2.0, 0.7], [2.4, 0]),
    ],
  },
  {
    id: 'hop',
    label: '开心跳动',
    category: 'celebrate',
    dur: 1.6,
    trigger: '被点击 / 高兴', // i18n-ignore
    tracks: [
      T(
        'bodyY',
        [0, 0],
        [0.12, 3, 'io'],
        [0.32, -12, 'o'],
        [0.52, 1.5, 'io'],
        [0.72, -8, 'o'],
        [0.95, 0.8, 'io'],
        [1.15, -3, 'o'],
        [1.35, 0, 'io'],
        [1.6, 0],
      ),
      T('shoulder', [0, 0], [0.28, -6, 'o'], [0.6, 0], [1.6, 0]),
      T('headRot', [0, 0], [0.3, 5], [0.7, -5], [1.1, 3], [1.5, 0]),
      hold('eyeL', 0.1, 1.4, EYE.happy),
      hold('eyeR', 0.1, 1.4, EYE.happy),
      hold('mouth', 0.1, 1.4, MOUTH.grin),
      T('fxHeart', [0, 0], [0.3, 0.7], [1.3, 0.7], [1.6, 0]),
    ],
  },
  {
    id: 'wink',
    label: '眨眼',
    category: 'emotion',
    dur: 1.6,
    trigger: '俏皮 / 彩蛋', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.3, 8, 'b'], [1.3, 8], [1.6, 0]),
      hold('eyeR', 0.15, 1.2, EYE.happy),
      hold('mouth', 0.15, 1.3, MOUTH.cat),
      T('fxSparkle', [0, 0], [0.25, 1, 'o'], [1.2, 0.8], [1.6, 0]),
    ],
  },
  {
    id: 'tongue',
    label: '吐舌',
    category: 'emotion',
    dur: 1.8,
    trigger: '调皮 / 小失误后的卖萌', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.3, -9, 'b'], [1.5, -9], [1.8, 0]),
      hold('eyeL', 0.15, 1.5, EYE.happy),
      hold('eyeR', 0.15, 1.5, EYE.closed),
      hold('mouth', 0.15, 1.5, MOUTH.tongue),
      T('blush', [0, 0], [0.3, 0.8], [1.5, 0.8], [1.8, 0]),
    ],
  },
  {
    id: 'cute',
    label: '卖萌',
    category: 'emotion',
    dur: 2.4,
    trigger: '被摸头 / 撒娇', // i18n-ignore
    tracks: [
      ...both(HAND.fist, P.cheekPaw, 0.4, 2.0, 2.4),
      hold('armFront', 0.25, 99, 1),
      T('headRot', [0, 0], [0.4, 10, 'b'], [1.2, -8, 'io'], [2.0, 10, 'io'], [2.4, 0]),
      hold('eyeL', 0.2, 2.1, EYE.happy),
      hold('eyeR', 0.2, 2.1, EYE.happy),
      hold('mouth', 0.2, 2.1, MOUTH.cat),
      T('fxBlush', [0, 0], [0.4, 1], [2.1, 1], [2.4, 0]),
      T('fxHeart', [0, 0], [0.5, 0.6], [2.0, 0.6], [2.4, 0]),
    ],
  },
  // ---- work / rest ----------------------------------------------------------------------------
  {
    id: 'work',
    label: '打字工作',
    category: 'work',
    dur: 2.4,
    hold: true,
    maxHold: 15,
    loopFrom: 1.0,
    priority: 1,
    trigger: '工具运行中 / 正在写代码', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.type, 0.5, 2.4, 2.4, {
        oscW: [8, 4.2, 0],
        oscE: [3, 5.1, 1],
        win: [0.6, 99],
      }),
      hold('armFront', 0.3, 99, 1),
      T('headNod', [0, 0], [0.6, 6, 'io'], [2.4, 6]),
      T('gazeY', [0, 0], [0.6, 0.5], [2.4, 0.5]),
      hold('eyeL', 0.4, 99, EYE.determined),
      hold('eyeR', 0.4, 99, EYE.determined),
      hold('mouth', 0.4, 99, MOUTH.pout),
    ],
  },
  {
    id: 'yawn',
    label: '打哈欠',
    category: 'rest',
    dur: 3.0,
    cooldown: 60,
    idle: true,
    priority: 0,
    trigger: '夜间 / 长时间空闲', // i18n-ignore
    tracks: [
      T('headNod', [0, 0], [0.8, -10, 'io'], [1.6, -10], [2.4, 6, 'io'], [3.0, 0]),
      T('shoulder', [0, 0], [0.8, -9, 'io'], [1.8, -9], [2.6, 0]),
      hold('eyeL', 0.5, 2.5, EYE.closed),
      hold('eyeR', 0.5, 2.5, EYE.closed),
      hold('mouth', 0.7, 2.2, MOUTH.yawn),
      T('fxSweat', [0, 0], [3.0, 0]),
    ],
  },
  {
    id: 'stretch',
    label: '伸懒腰',
    category: 'rest',
    dur: 3.2,
    cooldown: 60,
    idle: true,
    priority: 0,
    trigger: '长时间空闲 / 久坐提醒', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.stretchUp, 0.9, 2.3, 3.2),
      T('bodyY', [0, 0], [0.9, 4], [1.6, -6, 'io'], [2.3, -6], [3.2, 0]),
      T('headNod', [0, 0], [0.9, -9, 'io'], [2.3, -9], [3.2, 0]),
      hold('eyeL', 0.7, 2.6, EYE.closed),
      hold('eyeR', 0.7, 2.6, EYE.closed),
      hold('mouth', 0.8, 2.5, MOUTH.yawn),
    ],
  },
  {
    id: 'goodnight',
    label: '晚安',
    category: 'rest',
    dur: 3.4,
    hold: true,
    maxHold: 25,
    loopFrom: 1.8,
    priority: 1,
    trigger: '深夜 / 长时间无操作 / 说晚安', // i18n-ignore
    tracks: [
      ...arm('r', HAND.wave, P.waveOut.r, 0.5, 1.8, 3.4, {
        oscW: [10, 2.2, 0],
        win: [0.8, 1.8],
        ret: false,
      }),
      T('headNod', [0, 0], [1.4, 12, 'io'], [3.4, 12]),
      T('headRot', [0, 0], [1.4, 6], [3.4, 6]),
      T('bodyY', [0, 0], [1.4, 3], [3.4, 3]),
      hold('eyeL', 1.0, 99, EYE.sleepy),
      hold('eyeR', 1.0, 99, EYE.sleepy),
      hold('mouth', 0.4, 99, MOUTH.smile),
      T('fxZzz', [0, 0], [1.6, 0], [2.2, 1, 'o']),
    ],
  },
  {
    id: 'listen',
    label: '倾听',
    category: 'think',
    dur: 2.6,
    hold: true,
    maxHold: 20,
    loopFrom: 1.0,
    priority: 1,
    trigger: '用户正在输入 / 语音录入', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.6, 6, 'io'], [2.6, 6]),
      T('headNod', [0, 0], [0.6, -2, 'io'], [2.6, -2]),
      hold('eyeL', 0.3, 99, EYE.wide),
      hold('eyeR', 0.3, 99, EYE.wide),
      hold('mouth', 0.3, 99, MOUTH.smile),
      hold('brow', 0.3, 99, BROW.up),
    ],
  },
  {
    id: 'peek_note',
    label: '哼歌',
    category: 'idle',
    dur: 3.0,
    cooldown: 40,
    idle: true,
    priority: 0,
    trigger: '空闲随机 / 播放音乐', // i18n-ignore
    tracks: [
      T('headRot', [0, 0], [0.5, 6], [1.0, -6], [1.5, 6], [2.0, -6], [2.5, 4], [3.0, 0]),
      T('torsoRot', [0, 0], [0.5, 1.2], [1.0, -1.2], [1.5, 1.2], [2.0, -1.2], [3.0, 0]),
      hold('eyeL', 0.3, 2.7, EYE.happy),
      hold('eyeR', 0.3, 2.7, EYE.happy),
      hold('mouth', 0.3, 2.7, MOUTH.smile),
      T('fxNote', [0, 0], [0.4, 1], [2.6, 1], [3.0, 0]),
    ],
  },
  // ---- layered-rig batch: waist bend (`spine`), hair-tail follow-through, anticipation + overshoot ----
  {
    id: 'lean_in',
    label: '倾身聆听',
    category: 'think',
    dur: 2.6,
    hold: true,
    maxHold: 20,
    loopFrom: 1.4,
    priority: 1,
    trigger: '用户正在说话 / 输入长内容 — 身体前倾', // i18n-ignore
    tracks: [
      // tiny lean-back anticipation, then the whole upper body swings in with overshoot
      T('spine', [0, 0], [0.18, -1.4, 'o'], [0.85, 4.2, 'b'], [1.4, 3.4, 'io'], [2.6, 3.4]),
      T('scale', [0, 0], [0.18, -0.006, 'o'], [0.85, 0.045, 'b'], [1.4, 0.04, 'io'], [2.6, 0.04]),
      T('bodyY', [0, 0], [0.85, 5, 'b'], [2.6, 5]),
      T('headRot', [0, 0], [0.3, 1, 'o'], [1.0, 7, 'b'], [1.6, 6, 'io'], [2.6, 6]),
      T('headNod', [0, 0], [0.9, -3, 'io'], [2.6, -3]),
      T('gazeX', [0, 0], [0.9, 0.15], [2.6, 0.15]),
      hold('eyeL', 0.5, 99, EYE.wide),
      hold('eyeR', 0.5, 99, EYE.wide),
      hold('mouth', 0.5, 99, MOUTH.smile),
      hold('brow', 0.5, 99, BROW.up),
    ],
  },
  {
    id: 'curious_tilt',
    label: '好奇歪头',
    category: 'react',
    dur: 2.4,
    trigger: '听到有趣 / 不确定的内容', // i18n-ignore
    tracks: [
      T(
        'headRot',
        [0, 0],
        [0.12, -2.5, 'o'],
        [0.55, 15, 'b'],
        [1.5, 13, 'io'],
        [2.0, 0, 'io'],
        [2.4, 0],
      ),
      T(
        'spine',
        [0, 0],
        [0.12, 1, 'o'],
        [0.6, -4.5, 'b'],
        [1.5, -3.5, 'io'],
        [2.1, 0, 'io'],
        [2.4, 0],
      ),
      T('headNod', [0, 0], [0.6, -3, 'io'], [1.5, -3], [2.2, 0]),
      T('bodyY', [0, 0], [0.55, -3, 'o'], [0.9, 0, 'io'], [2.4, 0]),
      T('gazeX', [0, 0], [0.5, 0.35, 'o'], [1.5, 0.35], [2.1, 0]),
      T('gazeY', [0, 0], [0.5, -0.25], [1.5, -0.25], [2.1, 0]),
      hold('eyeL', 0.25, 1.9, EYE.wide),
      hold('eyeR', 0.25, 1.9, EYE.wide),
      hold('mouth', 0.3, 1.9, MOUTH.o),
      hold('brow', 0.25, 1.9, BROW.up),
      T('fxQuestion', [0, 0], [0.45, 0], [0.8, 0.9, 'o'], [1.9, 0.9], [2.3, 0]),
    ],
  },
  {
    id: 'shy_hair_touch',
    label: '害羞捋发',
    category: 'emotion',
    dur: 3.4,
    trigger: '被夸奖 / 被问到私人问题', // i18n-ignore
    tracks: [
      // right hand rises beside the cheek (armFront), fingers fidget on the hair, head dips toward it
      ...arm('r', HAND.rest, P.hairTouch.r, 0.7, 2.7, 3.4, {
        oscW: [9, 1.7, 0],
        oscE: [4, 1.7, 1.2],
        win: [1.2, 2.6],
      }),
      // the lock stirs with the fingers (in phase with the wrist)
      {
        p: 'tailR',
        k: [
          [0, 0],
          [1.1, 0],
          [2.7, 0],
          [3.4, 0],
        ],
        osc: [9, 1.7, 0.4],
        oscWin: [1.2, 2.6],
      },
      hold('armFront', 0.45, 99, 1),
      T('headRot', [0, 0], [0.25, 2, 'o'], [0.9, -9, 'b'], [2.6, -9, 'io'], [3.4, 0]),
      T('headNod', [0, 0], [0.9, 5, 'io'], [2.6, 5], [3.4, 0]),
      T('spine', [0, 0], [0.9, -3.2, 'b'], [2.6, -3.2], [3.4, 0, 'io']),
      T('shoulder', [0, 0], [0.9, -4, 'io'], [2.6, -4], [3.4, 0]),
      T('gazeX', [0, 0], [0.9, 0.6], [2.6, 0.6], [3.2, 0]),
      T('gazeY', [0, 0], [0.9, 0.35], [2.6, 0.35], [3.2, 0]),
      hold('eyeL', 0.6, 2.9, EYE.half),
      hold('eyeR', 0.6, 2.9, EYE.half),
      hold('mouth', 0.6, 2.9, MOUTH.wavy),
      hold('brow', 0.6, 2.9, BROW.worried),
      T('blush', [0, 0], [0.8, 1, 'o'], [2.9, 1], [3.4, 0]),
      T('fxBlush', [0, 0], [0.8, 1, 'o'], [2.9, 1], [3.4, 0]),
    ],
  },
  {
    id: 'shrug',
    label: '耸肩摊手',
    category: 'react',
    dur: 2.2,
    trigger: '不确定 / 无能为力', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.shrug, 0.35, 1.7, 2.2),
      T('shoulder', [0, 0], [0.15, 3, 'o'], [0.5, -16, 'b'], [1.5, -14, 'io'], [2.1, 0, 'io']),
      T('headRot', [0, 0], [0.5, 7, 'b'], [1.5, 6, 'io'], [2.1, 0]),
      T('headNod', [0, 0], [0.5, 4], [1.5, 3], [2.1, 0]),
      T('spine', [0, 0], [0.5, 2.2, 'b'], [1.5, 1.8], [2.1, 0, 'io']),
      T('bodyY', [0, 0], [0.5, -4, 'b'], [1.5, -3], [2.1, 0]),
      hold('eyeL', 0.3, 1.8, EYE.half),
      hold('eyeR', 0.3, 1.8, EYE.half),
      hold('mouth', 0.3, 1.8, MOUTH.wavy),
      hold('brow', 0.3, 1.8, BROW.worried),
    ],
  },
  {
    id: 'wave_both',
    label: '双手挥舞',
    category: 'greet',
    dur: 2.8,
    trigger: '热情欢迎 / 久别重逢', // i18n-ignore
    tracks: [
      ...both(HAND.wave, P.waveUp, 0.45, 2.3, 2.8, {
        oscW: [18, 3, 0],
        oscE: [6, 3, 1.4],
        win: [0.8, 2.3],
      }),
      // the sway rides the waves (same 1.5 Hz half-beat) so the whole body greets, not just the arms
      {
        p: 'spine',
        k: [
          [0, 0],
          [0.5, 0],
          [2.4, 0],
          [2.8, 0],
        ],
        osc: [4.2, 1.5, 0],
        oscWin: [0.6, 2.4],
      },
      {
        p: 'headRot',
        k: [
          [0, 0],
          [2.8, 0],
        ],
        osc: [5, 1.5, 0.9],
        oscWin: [0.6, 2.4],
      },
      T('bodyY', [0, 0], [0.4, -3, 'o'], [0.7, 0, 'io'], [2.8, 0]),
      hold('eyeL', 0.3, 2.5, EYE.happy),
      hold('eyeR', 0.3, 2.5, EYE.happy),
      hold('mouth', 0.3, 2.5, MOUTH.grin),
      T('fxSparkle', [0, 0], [0.6, 0.6], [2.3, 0.6], [2.8, 0]),
    ],
  },
  {
    id: 'ponder_lean',
    label: '倚手沉思',
    category: 'think',
    dur: 3.6,
    hold: true,
    maxHold: 16,
    loopFrom: 2.0,
    priority: 1,
    trigger: '深度思考 / 规划任务中', // i18n-ignore
    tracks: [
      ...arm('r', HAND.rest, P.chinThink.r, 0.6, 3.6, 3.6, {
        oscW: [3, 0.8, 0],
        win: [1.2, 99],
      }),
      hold('armFront', 0.35, 99, 1),
      // weight shifts onto the resting elbow: waist bends toward the hand, head settles on it
      T('spine', [0, 0], [0.3, 1.2, 'o'], [1.3, -4.5, 'b'], [3.6, -4]),
      T('headRot', [0, 0], [1.3, -11, 'io'], [3.6, -11]),
      T('headNod', [0, 0], [1.3, 2], [3.6, 2]),
      T('bodyY', [0, 0], [1.3, 3, 'io'], [3.6, 3]),
      T('gazeX', [0, 0], [1.2, -0.5, 'io'], [2.2, -0.35], [3.0, -0.55], [3.6, -0.45]),
      T('gazeY', [0, 0], [1.2, -0.45, 'io'], [3.6, -0.35]),
      hold('eyeL', 0.8, 99, EYE.half),
      hold('eyeR', 0.8, 99, EYE.half),
      hold('mouth', 0.8, 99, MOUTH.pout),
      hold('brow', 0.8, 99, BROW.soft),
      T('fxQuestion', [0, 0], [1.6, 0], [2.2, 0.7, 'o']),
    ],
  },
  {
    id: 'sleepy_nod',
    label: '打瞌睡',
    category: 'rest',
    dur: 4.6,
    cooldown: 90,
    idle: true,
    priority: 0,
    trigger: '深夜 / 长时间无操作', // i18n-ignore
    tracks: [
      // droop → micro-jerk awake → droop deeper → startle up → settle
      T(
        'headNod',
        [0, 0],
        [1.0, 12, 'io'],
        [1.2, -2, 'o'],
        [2.3, 15, 'io'],
        [2.5, 3, 'o'],
        [2.8, -5, 'o'],
        [3.5, 4, 'io'],
        [4.6, 0, 'io'],
      ),
      T(
        'spine',
        [0, 0],
        [1.0, 3.2, 'io'],
        [1.2, 0.6, 'o'],
        [2.3, 4.5, 'io'],
        [2.55, 0, 'o'],
        [3.5, 2, 'io'],
        [4.6, 0, 'io'],
      ),
      T('headRot', [0, 0], [1.0, 3, 'io'], [2.3, -4, 'io'], [3.5, 2], [4.6, 0]),
      T('bodyY', [0, 0], [1.0, 3, 'io'], [2.3, 5, 'io'], [2.55, -2, 'o'], [4.6, 0, 'io']),
      hold('eyeL', 0.2, 4.0, EYE.sleepy),
      hold('eyeR', 0.2, 4.0, EYE.sleepy),
      hold('mouth', 0.4, 4.0, MOUTH.yawn),
      T('fxZzz', [0, 0], [0.8, 0], [1.4, 1, 'o'], [3.9, 1], [4.6, 0]),
    ],
  },
  {
    id: 'recoil',
    label: '受惊后仰',
    category: 'react',
    dur: 2.4,
    priority: 2,
    trigger: '突发错误 / 被吓到', // i18n-ignore
    tracks: [
      // snap away from the "threat": waist bends back hard, hair tails whip, then wobbles to rest
      T('spine', [0, 0], [0.09, -9.5, 'o'], [0.45, -5.5, 'io'], [1.5, -5, 'io'], [2.1, 0, 'io']),
      T('scale', [0, 0], [0.1, -0.04, 'o'], [0.6, -0.025, 'io'], [2.2, 0]),
      T('headNod', [0, 0], [0.1, -10, 'o'], [0.6, -5], [1.5, -3], [2.2, 0]),
      T('bodyY', [0, 0], [0.09, -7, 'o'], [0.4, 2, 'io'], [2.4, 0]),
      ...both(HAND.rest, P.surprise, 0.12, 1.5, 2.4, { fast: true }),
      hold('armFront', 0.12, 99, 1),
      hold('eyeL', 0.05, 1.7, EYE.wide),
      hold('eyeR', 0.05, 1.7, EYE.wide),
      hold('mouth', 0.05, 1.7, MOUTH.o),
      hold('brow', 0.05, 1.7, BROW.up),
      T('fxExclaim', [0, 0], [0.12, 1, 'o'], [1.5, 1], [2.0, 0]),
      T('fxSweat', [0, 0], [0.4, 0], [0.8, 0.8], [1.7, 0.8], [2.2, 0]),
    ],
  },
  {
    id: 'happy_bounce',
    label: '开心弹跳',
    category: 'celebrate',
    dur: 2.6,
    trigger: '任务成功 / 收到好消息', // i18n-ignore
    tracks: [
      // crouch (anticipation) → spring up → land with squash-free sag → second smaller bounce
      T(
        'bodyY',
        [0, 0],
        [0.18, 7, 'o'],
        [0.45, -16, 'o'],
        [0.75, 4, 'i'],
        [0.9, 3, 'o'],
        [1.2, -10, 'o'],
        [1.5, 2, 'i'],
        [1.62, 3],
        [2.1, 0, 'io'],
        [2.6, 0],
      ),
      T(
        'scale',
        [0, 0],
        [0.18, -0.012, 'o'],
        [0.45, 0.02, 'o'],
        [0.8, 0, 'io'],
        [1.2, 0.012, 'o'],
        [1.6, 0],
        [2.6, 0],
      ),
      T(
        'spine',
        [0, 0],
        [0.2, 0, 'o'],
        [0.5, 3.5, 'o'],
        [0.95, -3.2, 'io'],
        [1.3, 2.6, 'o'],
        [1.75, -1.4, 'io'],
        [2.2, 0, 'io'],
      ),
      T('headRot', [0, 0], [0.5, -6, 'o'], [0.95, 6, 'io'], [1.3, -4, 'o'], [1.8, 2], [2.3, 0]),
      ...both(HAND.fist, P.fistUp, 0.3, 1.9, 2.6, {
        oscE: [6, 3.2, 0],
        win: [0.6, 1.9],
      }),
      hold('eyeL', 0.2, 2.1, EYE.happy),
      hold('eyeR', 0.2, 2.1, EYE.happy),
      hold('mouth', 0.2, 2.1, MOUTH.grin),
      T('blush', [0, 0], [0.5, 0.6], [2.0, 0.6], [2.6, 0]),
      T('fxSparkle', [0, 0], [0.4, 1, 'o'], [2.0, 1], [2.6, 0]),
      T('fxStar', [0, 0], [0.45, 0.8, 'o'], [1.6, 0.4], [2.2, 0]),
    ],
  },
  {
    id: 'groove_sway',
    label: '跟着节拍摇摆',
    category: 'idle',
    dur: 4.0,
    cooldown: 40,
    idle: true,
    priority: 0,
    trigger: '播放音乐 / 心情好', // i18n-ignore
    tracks: [
      // S-curve: waist swings one way while the head counter-tilts; hair tails trail the beat
      {
        p: 'spine',
        k: [
          [0, 0],
          [0.6, 0],
          [3.4, 0],
          [4.0, 0],
        ],
        osc: [9, 0.8, 0],
        oscWin: [0.4, 3.6],
      },
      {
        p: 'headRot',
        k: [
          [0, 0],
          [4.0, 0],
        ],
        osc: [7, 0.8, 2.4],
        oscWin: [0.4, 3.6],
      },
      {
        p: 'torsoX',
        k: [
          [0, 0],
          [4.0, 0],
        ],
        osc: [14, 0.8, -1.2],
        oscWin: [0.4, 3.6],
      },
      {
        p: 'bodyY',
        k: [
          [0, 0],
          [4.0, 0],
        ],
        osc: [3, 1.6, 0.4],
        oscWin: [0.4, 3.6],
      },
      T('shoulder', [0, 0], [0.5, -2], [3.4, -2], [4.0, 0]),
      hold('eyeL', 0.3, 3.7, EYE.happy),
      hold('eyeR', 0.3, 3.7, EYE.happy),
      hold('mouth', 0.3, 3.7, MOUTH.smile),
      T('fxNote', [0, 0], [0.5, 1, 'o'], [3.5, 1], [4.0, 0]),
    ],
  },
  {
    id: 'stretch_side',
    label: '侧腰伸展',
    category: 'rest',
    dur: 4.0,
    cooldown: 60,
    idle: true,
    priority: 0,
    trigger: '久坐提醒 / 长时间空闲', // i18n-ignore
    tracks: [
      ...both(HAND.rest, P.stretchUp, 0.8, 3.0, 4.0),
      // arms up, then bend through the waist to one side, back through center, to the other, and rest
      T(
        'spine',
        [0, 0],
        [0.5, -1.5, 'o'],
        [1.5, 8.5, 'io'],
        [2.0, 8.5],
        [2.8, -7.5, 'io'],
        [3.2, -7],
        [3.9, 0, 'io'],
      ),
      T('headRot', [0, 0], [1.5, 4, 'io'], [2.8, -4, 'io'], [3.9, 0]),
      T('bodyY', [0, 0], [0.8, 3, 'o'], [1.4, -5, 'io'], [3.0, -5], [4.0, 0, 'io']),
      T('headNod', [0, 0], [0.9, -6, 'io'], [3.0, -6], [4.0, 0]),
      hold('eyeL', 0.7, 3.4, EYE.closed),
      hold('eyeR', 0.7, 3.4, EYE.closed),
      hold('mouth', 0.9, 3.2, MOUTH.yawn),
    ],
  },
  {
    id: 'smirk_lean',
    label: '得意歪靠',
    category: 'emotion',
    dur: 2.8,
    trigger: '任务完成得漂亮 / 小得意', // i18n-ignore
    tracks: [
      T('spine', [0, 0], [0.2, -1.6, 'o'], [0.8, 5.2, 'b'], [2.2, 4.6, 'io'], [2.8, 0, 'io']),
      T('headRot', [0, 0], [0.8, -7, 'b'], [2.2, -6, 'io'], [2.8, 0]),
      T('headNod', [0, 0], [0.8, -4], [2.2, -4], [2.8, 0]),
      T('torsoX', [0, 0], [0.8, 8, 'io'], [2.2, 8], [2.8, 0]),
      T('gazeX', [0, 0], [0.7, 0.4], [2.2, 0.4], [2.8, 0]),
      hold('eyeL', 0.5, 2.4, EYE.half),
      hold('eyeR', 0.5, 2.4, EYE.determined),
      hold('mouth', 0.5, 2.4, MOUTH.cat),
      hold('brow', 0.5, 2.4, BROW.up),
      T('fxSparkle', [0, 0], [0.9, 0.7, 'o'], [2.2, 0.7], [2.8, 0]),
    ],
  },
  {
    id: 'fight_on',
    label: '握拳加油',
    category: 'celebrate',
    dur: 2.6,
    trigger: '鼓励用户 / 开始大任务', // i18n-ignore
    tracks: [
      ...arm('r', HAND.fist, P.fistUp.r, 0.4, 2.0, 2.6, {
        oscE: [5, 4, 0],
        win: [0.9, 1.6],
      }),
      T('spine', [0, 0], [0.15, 2, 'o'], [0.55, -5.5, 'b'], [1.9, -4.5, 'io'], [2.6, 0, 'io']),
      T('headRot', [0, 0], [0.55, 5, 'b'], [1.9, 4], [2.6, 0]),
      T('headNod', [0, 0], [0.15, 4, 'o'], [0.6, -3, 'b'], [1.9, -2], [2.6, 0]),
      T('bodyY', [0, 0], [0.15, 4, 'o'], [0.5, -5, 'o'], [0.9, 0, 'io'], [2.6, 0]),
      hold('eyeL', 0.3, 2.2, EYE.determined),
      hold('eyeR', 0.3, 2.2, EYE.determined),
      hold('mouth', 0.3, 2.2, MOUTH.grin),
      hold('brow', 0.3, 2.2, BROW.angry),
      T('fxStar', [0, 0], [0.55, 0.9, 'o'], [1.9, 0.5], [2.6, 0]),
    ],
  },
];

/** id → Chinese label (menu) */
export const ACTION_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a.label]),
);
