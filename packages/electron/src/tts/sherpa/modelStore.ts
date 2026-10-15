/**
 * sherpa 模型目录定位与完整性校验（纯 fs，无下载）。
 * 优先级：环境变量 → 安装包 extraResources → 开发态仓库同级 models 目录。
 */
import fs from 'node:fs';
import path from 'node:path';

import { SHERPA_MANIFEST, type ModelManifest } from './manifest';

export type ModelSource = 'env' | 'resources' | 'dev';

export interface VerifyResult {
  ok: boolean;
  /** 缺失或大小不符的相对路径 */
  bad: string[];
}

export function verifyModelDir(
  dir: string,
  manifest: ModelManifest = SHERPA_MANIFEST,
): VerifyResult {
  const bad: string[] = [];
  for (const [rel, bytes] of Object.entries(manifest.files)) {
    try {
      if (fs.statSync(path.join(dir, rel)).size !== bytes) bad.push(rel);
    } catch {
      bad.push(rel);
    }
  }
  return { ok: bad.length === 0, bad };
}

export interface LocateOptions {
  /** 例如 process.env.NOMI_SHERPA_TTS_MODEL_DIR */
  envDir?: string;
  /** 打包后：process.resourcesPath/tts-models/<id> */
  resourcesDir?: string;
  /** 开发态（未打包）候选目录 */
  devDirs?: string[];
  manifest?: ModelManifest;
}

export function locateModel(opts: LocateOptions): { dir: string; source: ModelSource } | null {
  const manifest = opts.manifest ?? SHERPA_MANIFEST;
  const candidates: Array<{ dir: string; source: ModelSource }> = [];
  if (opts.envDir) candidates.push({ dir: opts.envDir, source: 'env' });
  if (opts.resourcesDir) candidates.push({ dir: opts.resourcesDir, source: 'resources' });
  for (const d of opts.devDirs ?? []) candidates.push({ dir: d, source: 'dev' });
  for (const c of candidates) {
    if (verifyModelDir(c.dir, manifest).ok) return c;
  }
  return null;
}
