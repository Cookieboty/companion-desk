/**
 * 生成极小但可被 three-vrm 加载的 VRM（0.x 或 1.0）：一个方块网格 + 完整人形骨骼节点 + 预设表情 + PNG 缩略图。
 * 单测与 e2e（模型商店 / 本地导入）共用；不依赖任何外部模型文件。
 */
import { deflateSync } from 'node:zlib';

export interface TinyVrmOptions {
  version?: '0.x' | '1.0';
  title?: string;
  author?: string;
  /** 0.x licenseName；1.0 licenseUrl */
  license?: string;
  allowRedistribution?: boolean;
  /** 填充字节，让文件变大（下载进度 / 续传测试） */
  padBytes?: number;
  color?: [number, number, number];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 纯色 PNG（RGB） */
export function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x += 1) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// [名字, 父节点名, 相对位置]
const BONES: Array<[string, string | null, [number, number, number]]> = [
  ['hips', null, [0, 0.9, 0]],
  ['spine', 'hips', [0, 0.1, 0]],
  ['chest', 'spine', [0, 0.15, 0]],
  ['upperChest', 'chest', [0, 0.1, 0]],
  ['neck', 'upperChest', [0, 0.12, 0]],
  ['head', 'neck', [0, 0.08, 0]],
  ['leftShoulder', 'upperChest', [0.04, 0.08, 0]],
  ['leftUpperArm', 'leftShoulder', [0.1, 0, 0]],
  ['leftLowerArm', 'leftUpperArm', [0.22, 0, 0]],
  ['leftHand', 'leftLowerArm', [0.22, 0, 0]],
  ['rightShoulder', 'upperChest', [-0.04, 0.08, 0]],
  ['rightUpperArm', 'rightShoulder', [-0.1, 0, 0]],
  ['rightLowerArm', 'rightUpperArm', [-0.22, 0, 0]],
  ['rightHand', 'rightLowerArm', [-0.22, 0, 0]],
  ['leftUpperLeg', 'hips', [0.08, -0.05, 0]],
  ['leftLowerLeg', 'leftUpperLeg', [0, -0.4, 0]],
  ['leftFoot', 'leftLowerLeg', [0, -0.4, 0]],
  ['rightUpperLeg', 'hips', [-0.08, -0.05, 0]],
  ['rightLowerLeg', 'rightUpperLeg', [0, -0.4, 0]],
  ['rightFoot', 'rightLowerLeg', [0, -0.4, 0]],
];

function boxGeometry(): { pos: Buffer; idx: Buffer; min: number[]; max: number[] } {
  const [x, y0, y1, z] = [0.2, 0.05, 1.6, 0.12];
  const v = [
    [-x, y0, -z],
    [x, y0, -z],
    [x, y1, -z],
    [-x, y1, -z],
    [-x, y0, z],
    [x, y0, z],
    [x, y1, z],
    [-x, y1, z],
  ];
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ];
  const pos = Buffer.alloc(v.length * 12);
  v.forEach((p, i) => p.forEach((c, j) => pos.writeFloatLE(c, i * 12 + j * 4)));
  const idx = Buffer.alloc(faces.length * 2);
  faces.forEach((f, i) => idx.writeUInt16LE(f, i * 2));
  return { pos, idx, min: [-x, y0, -z], max: [x, y1, z] };
}

const pad4 = (b: Buffer, fill = 0) =>
  b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b;

export function makeTinyVrm(opts: TinyVrmOptions = {}): Buffer {
  const version = opts.version ?? '0.x';
  const geo = boxGeometry();
  const png = solidPng(8, 8, opts.color ?? [240, 160, 200]);
  const filler = Buffer.alloc(opts.padBytes ?? 0, 7);
  const parts = [geo.pos, geo.idx, png, filler].map((b) => pad4(b));
  const offsets: number[] = [];
  let off = 0;
  for (const p of parts) {
    offsets.push(off);
    off += p.length;
  }
  const bin = Buffer.concat(parts);

  const nodes: Array<Record<string, unknown>> = [{ name: 'Body', mesh: 0 }];
  const index = new Map<string, number>();
  for (const [name, , t] of BONES) {
    index.set(name, nodes.length);
    nodes.push({ name: `J_${name}`, translation: t, children: [] });
  }
  for (const [name, parent] of BONES) {
    if (parent) (nodes[index.get(parent)!]!.children as number[]).push(index.get(name)!);
  }
  for (const n of nodes) if (Array.isArray(n.children) && !n.children.length) delete n.children;

  const presets0 = ['a', 'i', 'u', 'e', 'o', 'blink', 'joy', 'angry', 'sorrow', 'fun', 'neutral'];
  const presets1 = [
    'aa',
    'ih',
    'ou',
    'ee',
    'oh',
    'blink',
    'happy',
    'angry',
    'sad',
    'relaxed',
    'surprised',
    'neutral',
  ];

  const extensions: Record<string, unknown> =
    version === '0.x'
      ? {
          VRM: {
            exporterVersion: 'companion-desk-test',
            specVersion: '0.0',
            meta: {
              title: opts.title ?? 'Tiny Test',
              version: '1.0',
              author: opts.author ?? 'Companion Desk tests',
              texture: 0,
              allowedUserName: 'Everyone',
              violentUssageName: 'Disallow',
              sexualUssageName: 'Disallow',
              commercialUssageName: 'Allow',
              licenseName: opts.license ?? 'CC0',
            },
            humanoid: {
              humanBones: BONES.map(([bone]) => ({
                bone,
                node: index.get(bone),
                useDefaultValues: true,
              })),
            },
            blendShapeMaster: {
              blendShapeGroups: presets0.map((p) => ({
                name: p.toUpperCase(),
                presetName: p,
                binds: [],
                materialValues: [],
              })),
            },
            firstPerson: { firstPersonBone: index.get('head'), meshAnnotations: [] },
            secondaryAnimation: { boneGroups: [], colliderGroups: [] },
            materialProperties: [],
          },
        }
      : {
          VRMC_vrm: {
            specVersion: '1.0',
            meta: {
              name: opts.title ?? 'Tiny Test',
              authors: [opts.author ?? 'Companion Desk tests'],
              licenseUrl: opts.license ?? 'https://vrm.dev/licenses/1.0/',
              avatarPermission: 'everyone',
              commercialUsage: 'personalNonProfit',
              allowRedistribution: opts.allowRedistribution ?? false,
              thumbnailImage: 0,
            },
            humanoid: {
              humanBones: Object.fromEntries(
                BONES.map(([bone]) => [bone, { node: index.get(bone) }]),
              ),
            },
            expressions: { preset: Object.fromEntries(presets1.map((p) => [p, {}])) },
          },
        };

  const gltf = {
    asset: { version: '2.0', generator: 'companion-desk tinyVrm' },
    extensionsUsed: Object.keys(extensions),
    extensions,
    scene: 0,
    scenes: [{ nodes: [0, index.get('hips')] }],
    nodes,
    meshes: [
      { name: 'Body', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
    ],
    materials: [
      {
        name: 'Body',
        pbrMetallicRoughness: { baseColorFactor: [0.95, 0.7, 0.8, 1], metallicFactor: 0 },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: geo.min, max: geo.max },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: geo.pos.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: geo.idx.length, target: 34963 },
      { buffer: 0, byteOffset: offsets[2], byteLength: png.length },
      ...(filler.length ? [{ buffer: 0, byteOffset: offsets[3], byteLength: filler.length }] : []),
    ],
    images: [{ name: 'thumbnail', bufferView: 2, mimeType: 'image/png' }],
    textures: [{ source: 0 }],
    buffers: [{ byteLength: bin.length }],
  };

  const json = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + json.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}
