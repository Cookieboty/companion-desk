#!/usr/bin/env node
/**
 * 生成看板娘动作库 public/assets/motions/motions.json（VRM 1.0 规范化骨骼空间，与具体模型无关）。
 *
 * 1. 重定向 Quaternius「Universal Animation Library」(Standard, CC0) 的片段：
 *      q_vrm = parentRestWorld · q_local · restWorld⁻¹
 *    以 A_TPose 片段第 0 帧作为 T-pose 参考姿态（与 VRM 规范化 rest 一致）。
 * 2. 追加原创的程序化手势（挥手 / 点头 / 摇头 / 思考 / 拍手 / 鞠躬 / 欢呼 / 伸懒腰 / 张望），MIT。
 *
 * 用法：node scripts/build-motions.mjs <AnimationLibrary_Godot_Standard.gltf>
 * 源文件：https://quaternius.com/packs/universalanimationlibrary.html
 *        （CC0 镜像：https://github.com/J-Ponzo/gltf-universal-animation-library）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'public', 'assets', 'motions', 'motions.json');
const FPS = 30;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

const BONE_MAP = {
  'DEF-hips': 'hips',
  'DEF-spine.001': 'spine',
  'DEF-spine.002': 'chest',
  'DEF-spine.003': 'upperChest',
  'DEF-neck': 'neck',
  'DEF-head': 'head',
};
for (const [s, side] of [
  ['L', 'left'],
  ['R', 'right'],
]) {
  Object.assign(BONE_MAP, {
    [`DEF-shoulder.${s}`]: `${side}Shoulder`,
    [`DEF-upper_arm.${s}`]: `${side}UpperArm`,
    [`DEF-forearm.${s}`]: `${side}LowerArm`,
    [`DEF-hand.${s}`]: `${side}Hand`,
    [`DEF-thigh.${s}`]: `${side}UpperLeg`,
    [`DEF-shin.${s}`]: `${side}LowerLeg`,
    [`DEF-foot.${s}`]: `${side}Foot`,
    [`DEF-toe.${s}`]: `${side}Toes`,
    [`DEF-thumb.01.${s}`]: `${side}ThumbMetacarpal`,
    [`DEF-thumb.02.${s}`]: `${side}ThumbProximal`,
    [`DEF-thumb.03.${s}`]: `${side}ThumbDistal`,
  });
  for (const [f, n] of [
    ['index', 'Index'],
    ['middle', 'Middle'],
    ['ring', 'Ring'],
    ['pinky', 'Little'],
  ]) {
    BONE_MAP[`DEF-f_${f}.01.${s}`] = `${side}${n}Proximal`;
    BONE_MAP[`DEF-f_${f}.02.${s}`] = `${side}${n}Intermediate`;
    BONE_MAP[`DEF-f_${f}.03.${s}`] = `${side}${n}Distal`;
  }
}

/** 选用的 Quaternius 片段 → 我们的动作名 */
const UAL_CLIPS = [
  { src: ['Idle_Loop'], name: 'idle', loop: true, tags: ['idle'] },
  { src: ['Idle_Talking_Loop'], name: 'talk', loop: true, tags: ['talk'] },
  { src: ['Dance_Loop'], name: 'dance', loop: true, tags: ['happy'] },
  { src: ['Jump_Start', 'Jump_Loop', 'Jump_Land'], name: 'jump', loop: false, tags: ['happy'] },
  { src: ['Interact'], name: 'interact', loop: false, tags: ['gesture'] },
  { src: ['Hit_Head'], name: 'flinch', loop: false, tags: ['surprised'] },
  { src: ['Hit_Chest'], name: 'poke', loop: false, tags: ['surprised'] },
  // 桌面漫步：原地循环（去掉根运动，窗口本身在主进程里移动）
  { src: ['Walk_Loop'], name: 'walk', loop: true, tags: ['locomotion'], inPlace: true },
];

// ---------------- glTF 读取 ----------------
function loadGltf(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bin = fs.readFileSync(path.join(path.dirname(file), json.buffers[0].uri));
  const read = (accIdx) => {
    const acc = json.accessors[accIdx];
    const bv = json.bufferViews[acc.bufferView];
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
    const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    return new Float32Array(
      bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + acc.count * n * 4),
    );
  };
  return { json, read };
}

function sampler(read, s) {
  const times = read(s.input);
  const values = read(s.output);
  const n = values.length / times.length;
  return {
    times,
    at(t) {
      if (t <= times[0]) return Array.from(values.slice(0, n));
      const last = times.length - 1;
      if (t >= times[last]) return Array.from(values.slice(last * n, last * n + n));
      let i = 0;
      while (times[i + 1] < t) i += 1;
      const a = values.slice(i * n, i * n + n);
      const b = values.slice((i + 1) * n, (i + 1) * n + n);
      if (s.interpolation === 'STEP') return Array.from(a);
      const k = (t - times[i]) / (times[i + 1] - times[i]);
      if (n === 4) {
        const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), k);
        return [q.x, q.y, q.z, q.w];
      }
      return Array.from(a, (v, j) => v + (b[j] - v) * k);
    },
  };
}

function buildRig(json) {
  const objs = json.nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
  const root = objs[json.scenes[0].nodes[0]];
  return { objs, root };
}

function clipChannels(json, read, anim) {
  const ch = {};
  for (const c of anim.channels) {
    (ch[c.target.node] ??= {})[c.target.path] = sampler(read, anim.samplers[c.sampler]);
  }
  return ch;
}

function poseAt(objs, ch, t) {
  for (const [node, paths] of Object.entries(ch)) {
    const o = objs[node];
    if (paths.rotation) o.quaternion.fromArray(paths.rotation.at(t));
    if (paths.translation) o.position.fromArray(paths.translation.at(t));
  }
}

function retargetUal(gltfFile) {
  const { json, read } = loadGltf(gltfFile);
  const { objs, root } = buildRig(json);
  const byName = Object.fromEntries(json.animations.map((a) => [a.name, a]));
  const idx = Object.fromEntries(json.nodes.map((n, i) => [n.name, i]));

  // T-pose 参考
  poseAt(objs, clipChannels(json, read, byName.A_TPose), 0);
  root.updateMatrixWorld(true);
  const restWorld = {};
  const parentRestWorld = {};
  for (const name of Object.keys(BONE_MAP)) {
    const o = objs[idx[name]];
    restWorld[name] = o.getWorldQuaternion(new THREE.Quaternion());
    parentRestWorld[name] = o.parent.getWorldQuaternion(new THREE.Quaternion());
  }
  const hips = objs[idx['DEF-hips']];
  const restHips = hips.getWorldPosition(new THREE.Vector3());
  // 朝向检测：左手应在 +X（VRM 1.0：面向 +Z）；否则绕 Y 转 180°
  const leftHand = objs[idx['DEF-hand.L']].getWorldPosition(new THREE.Vector3());
  const flip = leftHand.x < restHips.x;
  const armDir = objs[idx['DEF-forearm.L']]
    .getWorldPosition(new THREE.Vector3())
    .sub(objs[idx['DEF-upper_arm.L']].getWorldPosition(new THREE.Vector3()))
    .normalize();
  console.info(
    `reference pose: flip=${flip} leftArmDir=${armDir.toArray().map(r4)} hipsY=${r4(restHips.y)}`,
  );

  const clips = [];
  for (const spec of UAL_CLIPS) {
    const tracks = {};
    const hipsPos = [];
    const times = [];
    let offset = 0;
    for (const srcName of spec.src) {
      const anim = byName[srcName];
      const ch = clipChannels(json, read, anim);
      let dur = 0;
      for (const p of Object.values(ch))
        for (const s of Object.values(p)) dur = Math.max(dur, s.times.at(-1));
      const frames = Math.max(1, Math.round(dur * FPS));
      for (let f = 0; f <= frames; f += 1) {
        if (offset > 0 && f === 0) continue;
        const t = (f / frames) * dur;
        poseAt(objs, ch, t);
        root.updateMatrixWorld(true);
        times.push(r4(offset + t));
        for (const [src, dst] of Object.entries(BONE_MAP)) {
          const o = objs[idx[src]];
          const q = o.quaternion
            .clone()
            .premultiply(parentRestWorld[src])
            .multiply(restWorld[src].clone().invert());
          if (flip) {
            q.x = -q.x;
            q.z = -q.z;
          }
          (tracks[dst] ??= []).push(r4(q.x), r4(q.y), r4(q.z), r4(q.w));
        }
        const p = hips.getWorldPosition(new THREE.Vector3()).sub(restHips).divideScalar(restHips.y);
        if (flip) {
          p.x = -p.x;
          p.z = -p.z;
        }
        if (spec.inPlace) {
          p.x = 0;
          p.z = 0;
        }
        hipsPos.push(r4(p.x), r4(p.y), r4(p.z));
      }
      offset += dur;
    }
    clips.push({
      name: spec.name,
      loop: spec.loop,
      tags: spec.tags,
      duration: r4(offset),
      source: `Quaternius Universal Animation Library: ${spec.src.join(' + ')}`,
      license: 'CC0-1.0',
      times,
      tracks,
      hips: hipsPos,
    });
  }
  return clips;
}

// ---------------- 原创程序化手势（MIT） ----------------
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const REST_DIR = {
  leftUpperArm: V(1, 0, 0),
  leftLowerArm: V(1, 0, 0),
  rightUpperArm: V(-1, 0, 0),
  rightLowerArm: V(-1, 0, 0),
};
const PARENT = { leftLowerArm: 'leftUpperArm', rightLowerArm: 'rightUpperArm' };

/** 由「手臂方向」得到局部旋转（规范化骨骼 rest = 单位四元数，世界坐标轴对齐） */
function armPose(dirs) {
  const world = {};
  const out = {};
  for (const bone of ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm']) {
    if (!dirs[bone]) continue;
    const parentWorld = PARENT[bone]
      ? (world[PARENT[bone]] ?? new THREE.Quaternion())
      : new THREE.Quaternion();
    const w = new THREE.Quaternion().setFromUnitVectors(
      REST_DIR[bone],
      dirs[bone].clone().normalize(),
    );
    world[bone] = w;
    out[bone] = parentWorld.clone().invert().multiply(w);
  }
  return out;
}
const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

const ARMS_DOWN = {
  leftUpperArm: V(0.22, -1, 0.04),
  leftLowerArm: V(0.12, -1, 0.18),
  rightUpperArm: V(-0.22, -1, 0.04),
  rightLowerArm: V(-0.12, -1, 0.18),
};

/** keys: [{t, arms?, bones?: {bone: Quaternion}, hipsY?}]，未指定的手臂沿用下垂姿态 */
function gesture(name, tags, keys, loop = false) {
  const times = keys.map((k) => r4(k.t));
  const bones = new Set(['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm']);
  keys.forEach((k) => Object.keys(k.bones ?? {}).forEach((b) => bones.add(b)));
  const tracks = {};
  const hips = [];
  for (const k of keys) {
    const arms = armPose({ ...ARMS_DOWN, ...(k.arms ?? {}) });
    for (const b of bones) {
      const q = k.bones?.[b] ?? arms[b] ?? new THREE.Quaternion();
      (tracks[b] ??= []).push(r4(q.x), r4(q.y), r4(q.z), r4(q.w));
    }
    hips.push(0, r4(k.hipsY ?? 0), 0);
  }
  return {
    name,
    loop,
    tags,
    duration: times.at(-1),
    source: 'Companion Desk (original, procedural)',
    license: 'MIT',
    times,
    tracks,
    hips,
  };
}

function proceduralGestures() {
  const out = [];
  const waveUp = V(-0.55, 0.6, 0.18);
  out.push(
    gesture(
      'wave',
      ['greet', 'happy'],
      [
        { t: 0 },
        { t: 0.35, arms: { rightUpperArm: waveUp, rightLowerArm: V(-0.2, 1, 0.2) } },
        ...[0.6, 0.85, 1.1, 1.35, 1.6].map((t, i) => ({
          t,
          arms: {
            rightUpperArm: waveUp,
            rightLowerArm: i % 2 ? V(-0.2, 1, 0.2) : V(-0.75, 0.75, 0.2),
          },
          bones: { head: euler(0, 0, i % 2 ? 0.08 : 0.04) },
        })),
        { t: 1.9, arms: { rightUpperArm: waveUp, rightLowerArm: V(-0.2, 1, 0.2) } },
        { t: 2.3 },
      ],
    ),
  );
  out.push(
    gesture(
      'nod',
      ['agree'],
      [
        { t: 0, bones: { head: euler(0, 0, 0), neck: euler(0, 0, 0) } },
        ...[0.2, 0.45, 0.7, 0.95].map((t, i) => ({
          t,
          bones: { head: euler(i % 2 ? 0 : 0.28, 0, 0), neck: euler(i % 2 ? 0 : 0.1, 0, 0) },
        })),
        { t: 1.2, bones: { head: euler(0, 0, 0), neck: euler(0, 0, 0) } },
      ],
    ),
  );
  out.push(
    gesture(
      'shake',
      ['disagree'],
      [
        { t: 0, bones: { head: euler(0, 0, 0) } },
        ...[0.18, 0.4, 0.62, 0.84].map((t, i) => ({
          t,
          bones: { head: euler(0.04, i % 2 ? -0.38 : 0.38, 0) },
        })),
        { t: 1.05, bones: { head: euler(0, 0, 0) } },
      ],
    ),
  );
  const thinkArms = {
    rightUpperArm: V(-0.35, -0.75, 0.6),
    rightLowerArm: V(0.3, 0.8, 0.5),
    leftUpperArm: V(0.3, -0.85, 0.35),
    leftLowerArm: V(-0.75, -0.05, 0.65),
  };
  out.push(
    gesture(
      'think',
      ['think'],
      [
        { t: 0 },
        { t: 0.6, arms: thinkArms, bones: { head: euler(0.1, -0.1, 0.14) } },
        { t: 2.4, arms: thinkArms, bones: { head: euler(0.06, 0.08, 0.18) } },
        { t: 3.0, bones: { head: euler(0, 0, 0) } },
      ],
    ),
  );
  const clapOpen = {
    leftUpperArm: V(0.3, -0.5, 0.8),
    rightUpperArm: V(-0.3, -0.5, 0.8),
    leftLowerArm: V(0.35, 0.25, 0.9),
    rightLowerArm: V(-0.35, 0.25, 0.9),
  };
  const clapShut = {
    ...clapOpen,
    leftLowerArm: V(-0.5, 0.25, 0.85),
    rightLowerArm: V(0.5, 0.25, 0.85),
  };
  out.push(
    gesture(
      'clap',
      ['happy'],
      [
        { t: 0 },
        { t: 0.35, arms: clapOpen },
        ...[0.5, 0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.55].map((t, i) => ({
          t,
          arms: i % 2 ? clapOpen : clapShut,
        })),
        { t: 1.95 },
      ],
    ),
  );
  out.push(
    gesture(
      'bow',
      ['greet', 'thanks'],
      [
        { t: 0, bones: { spine: euler(0, 0, 0), chest: euler(0, 0, 0), head: euler(0, 0, 0) } },
        {
          t: 0.7,
          bones: { spine: euler(0.35, 0, 0), chest: euler(0.25, 0, 0), head: euler(0.15, 0, 0) },
        },
        {
          t: 1.3,
          bones: { spine: euler(0.35, 0, 0), chest: euler(0.25, 0, 0), head: euler(0.15, 0, 0) },
        },
        { t: 2.0, bones: { spine: euler(0, 0, 0), chest: euler(0, 0, 0), head: euler(0, 0, 0) } },
      ],
    ),
  );
  const up = {
    leftUpperArm: V(0.4, 0.95, 0.1),
    rightUpperArm: V(-0.4, 0.95, 0.1),
    leftLowerArm: V(0.25, 1, 0.1),
    rightLowerArm: V(-0.25, 1, 0.1),
  };
  out.push(
    gesture(
      'cheer',
      ['happy'],
      [
        { t: 0 },
        { t: 0.3, arms: up, hipsY: -0.04 },
        { t: 0.55, arms: up, hipsY: 0.07 },
        { t: 0.8, arms: up, hipsY: -0.02 },
        { t: 1.05, arms: up, hipsY: 0.07 },
        { t: 1.3, arms: up, hipsY: 0 },
        { t: 1.7 },
      ],
    ),
  );
  const stretch = {
    leftUpperArm: V(0.25, 1, -0.05),
    rightUpperArm: V(-0.25, 1, -0.05),
    leftLowerArm: V(-0.1, 1, 0),
    rightLowerArm: V(0.1, 1, 0),
  };
  out.push(
    gesture(
      'stretch',
      ['idle'],
      [
        { t: 0 },
        { t: 0.8, arms: stretch, bones: { chest: euler(-0.12, 0, 0), head: euler(-0.15, 0, 0) } },
        {
          t: 1.8,
          arms: stretch,
          bones: { chest: euler(-0.15, 0, 0.05), head: euler(-0.18, 0, 0) },
        },
        { t: 2.6, bones: { chest: euler(0, 0, 0), head: euler(0, 0, 0) } },
      ],
    ),
  );
  out.push(
    gesture(
      'look_around',
      ['idle'],
      [
        { t: 0, bones: { head: euler(0, 0, 0), neck: euler(0, 0, 0) } },
        { t: 0.7, bones: { head: euler(0.05, 0.45, 0), neck: euler(0, 0.15, 0) } },
        { t: 1.6, bones: { head: euler(0.05, 0.45, 0), neck: euler(0, 0.15, 0) } },
        { t: 2.3, bones: { head: euler(0.02, -0.45, 0), neck: euler(0, -0.15, 0) } },
        { t: 3.1, bones: { head: euler(0.02, -0.45, 0), neck: euler(0, -0.15, 0) } },
        { t: 3.8, bones: { head: euler(0, 0, 0), neck: euler(0, 0, 0) } },
      ],
    ),
  );
  return out;
}

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-motions.mjs <AnimationLibrary_Godot_Standard.gltf>');
  process.exit(1);
}
const clips = [...retargetUal(src), ...proceduralGestures()];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: 1, space: 'vrm1-normalized', fps: FPS, clips }));
console.info(
  `wrote ${clips.length} clips → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`,
);
