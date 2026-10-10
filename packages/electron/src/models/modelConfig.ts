import { MODEL_CONFIG_SCHEMA, type ModelConfig, type ModelConfigFile } from '@ig-live/types';

const clamp = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
const NAME_RE = /^[A-Za-z0-9_\-. ]{1,64}$/;

/** 只保留白名单字段与合法取值：配置 JSON 来自用户文件，按不可信数据处理。 */
export function sanitizeModelConfig(raw: unknown): ModelConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  const out: ModelConfig = {};
  if (typeof c.name === 'string' && c.name.trim()) out.name = c.name.trim().slice(0, 80);
  const scale = clamp(c.scale, 0.1, 5);
  if (scale !== undefined) out.scale = scale;
  if (Array.isArray(c.offset) && c.offset.length === 3) {
    const o = c.offset.map((v) => clamp(v, -5, 5));
    if (o.every((v) => v !== undefined)) out.offset = o as [number, number, number];
  }
  if (c.camera && typeof c.camera === 'object') {
    const cam = c.camera as Record<string, unknown>;
    const camera = {
      height: clamp(cam.height, 0, 3),
      distance: clamp(cam.distance, 0.5, 10),
      fov: clamp(cam.fov, 10, 90),
    };
    const kept = Object.fromEntries(Object.entries(camera).filter(([, v]) => v !== undefined));
    if (Object.keys(kept).length) out.camera = kept;
  }
  if (c.expressionMap && typeof c.expressionMap === 'object') {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.expressionMap as Record<string, unknown>).slice(0, 32)) {
      if (NAME_RE.test(k) && typeof v === 'string' && NAME_RE.test(v)) map[k] = v;
    }
    if (Object.keys(map).length) out.expressionMap = map;
  }
  if (Array.isArray(c.motions)) {
    out.motions = c.motions
      .filter((m): m is string => typeof m === 'string' && /^[a-z_]{1,32}$/.test(m))
      .slice(0, 64);
  }
  return out;
}

export function toConfigFile(config: ModelConfig, modelName?: string): ModelConfigFile {
  return { schema: MODEL_CONFIG_SCHEMA, modelName, config: sanitizeModelConfig(config) };
}

export function parseConfigFile(text: string): ModelConfig {
  if (text.length > 64 * 1024) throw new Error('配置文件过大');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('配置文件不是合法 JSON');
  }
  const f = data as Partial<ModelConfigFile>;
  if (f?.schema !== MODEL_CONFIG_SCHEMA || typeof f.config !== 'object') {
    throw new Error(`不是 Companion Desk 模型配置（需要 schema: ${MODEL_CONFIG_SCHEMA}）`);
  }
  return sanitizeModelConfig(f.config);
}
