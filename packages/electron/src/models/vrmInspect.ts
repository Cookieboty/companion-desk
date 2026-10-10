/**
 * VRM（glTF 2.0 二进制）静态解析：只读 JSON 块与缩略图字节，不执行任何代码。
 * 支持 VRM 0.x（extensions.VRM）与 VRM 1.0（extensions.VRMC_vrm）。
 */

export type VrmVersion = '0.x' | '1.0';

export interface VrmMetaInfo {
  version: VrmVersion;
  title?: string;
  /** 作者（0.x: author；1.0: authors 合并） */
  author?: string;
  /** 许可原文（0.x: licenseName / otherLicenseUrl；1.0: licenseUrl） */
  license?: string;
  /** 0.x allowedUserName / 1.0 avatarPermission */
  allowedUser?: string;
  /** 0.x commercialUssageName / 1.0 commercialUsage */
  commercialUsage?: string;
  /** 1.0 allowRedistribution；0.x 无对应字段（undefined） */
  allowRedistribution?: boolean;
  /** 0.x violentUssageName 等其余字段原样保留，便于 UI 展示 */
  raw: Record<string, unknown>;
  /** 预设表情 / 自定义表情名 */
  expressions: string[];
}

export interface VrmInspection {
  meta: VrmMetaInfo;
  thumbnail?: { bytes: Buffer; mime: string };
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export class VrmFormatError extends Error {}

interface GltfJson {
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  textures?: Array<{ source?: number }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
}

export function inspectVrm(buf: Buffer): VrmInspection {
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC)
    throw new VrmFormatError('不是 glTF 二进制（.glb/.vrm）文件');
  if (buf.readUInt32LE(4) !== 2) throw new VrmFormatError('仅支持 glTF 2.0');
  const total = Math.min(buf.readUInt32LE(8), buf.length);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset + 8 <= total) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + len);
    if (type === CHUNK_JSON && !json) {
      try {
        json = JSON.parse(body.toString('utf8')) as GltfJson;
      } catch {
        throw new VrmFormatError('glTF JSON 块无法解析');
      }
    } else if (type === CHUNK_BIN && !bin) {
      bin = body;
    }
    offset += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new VrmFormatError('缺少 glTF JSON 块');

  const ext = json.extensions ?? {};
  const v1 = ext.VRMC_vrm as
    | { meta?: Record<string, unknown>; expressions?: Record<string, Record<string, unknown>> }
    | undefined;
  const v0 = ext.VRM as
    | {
        meta?: Record<string, unknown>;
        blendShapeMaster?: { blendShapeGroups?: Array<{ name?: string; presetName?: string }> };
      }
    | undefined;

  let meta: VrmMetaInfo;
  let thumbImage: number | undefined;
  if (v1) {
    const m = v1.meta ?? {};
    const authors = Array.isArray(m.authors) ? (m.authors as unknown[]).map(String) : [];
    meta = {
      version: '1.0',
      title: str(m.name),
      author: authors.join(', ') || undefined,
      license: str(m.licenseUrl),
      allowedUser: str(m.avatarPermission),
      commercialUsage: str(m.commercialUsage),
      allowRedistribution:
        typeof m.allowRedistribution === 'boolean' ? m.allowRedistribution : undefined,
      raw: m,
      expressions: [
        ...Object.keys(v1.expressions?.preset ?? {}),
        ...Object.keys(v1.expressions?.custom ?? {}),
      ],
    };
    thumbImage = typeof m.thumbnailImage === 'number' ? m.thumbnailImage : undefined;
  } else if (v0) {
    const m = v0.meta ?? {};
    meta = {
      version: '0.x',
      title: str(m.title),
      author: str(m.author),
      license:
        str(m.licenseName) === 'Other' ? (str(m.otherLicenseUrl) ?? 'Other') : str(m.licenseName),
      allowedUser: str(m.allowedUserName),
      commercialUsage: str(m.commercialUssageName),
      allowRedistribution: undefined,
      raw: m,
      expressions: (v0.blendShapeMaster?.blendShapeGroups ?? [])
        .map((g) => (g.presetName && g.presetName !== 'unknown' ? g.presetName : g.name))
        .filter((n): n is string => !!n),
    };
    const tex = typeof m.texture === 'number' ? json.textures?.[m.texture] : undefined;
    thumbImage = tex?.source;
  } else {
    throw new VrmFormatError('文件没有 VRM / VRMC_vrm 扩展，不是 VRM 模型');
  }

  let thumbnail: VrmInspection['thumbnail'];
  const img = thumbImage !== undefined ? json.images?.[thumbImage] : undefined;
  const view = img?.bufferView !== undefined ? json.bufferViews?.[img.bufferView] : undefined;
  if (img && view && bin && /^image\/(png|jpeg)$/.test(img.mimeType ?? '')) {
    const start = view.byteOffset ?? 0;
    if (start + view.byteLength <= bin.length) {
      thumbnail = {
        bytes: Buffer.from(bin.subarray(start, start + view.byteLength)),
        mime: img.mimeType!,
      };
    }
  }
  return { meta, thumbnail };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** 从文件读取：withThumbnail=false 时只读 GLB 头 + JSON 块（大文件不整读） */
export async function inspectVrmFile(file: string, withThumbnail = false): Promise<VrmInspection> {
  const { promises: fsp } = await import('node:fs');
  if (withThumbnail) return inspectVrm(await fsp.readFile(file));
  const fh = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(20);
    await fh.read(head, 0, 20, 0);
    if (head.readUInt32LE(0) !== GLB_MAGIC)
      throw new VrmFormatError('不是 glTF 二进制（.glb/.vrm）文件');
    const jsonLen = head.readUInt32LE(12);
    if (jsonLen > 64 * 1024 * 1024) throw new VrmFormatError('glTF JSON 块过大');
    const buf = Buffer.alloc(20 + jsonLen);
    await fh.read(buf, 0, buf.length, 0);
    return inspectVrm(buf);
  } finally {
    await fh.close();
  }
}
