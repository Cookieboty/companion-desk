/**
 * sherpa 模型目录：定位（env / extraResources / 开发态 / userData）、校验大小、
 * 缺失时下载安装（开发启动与 sync 脚本共用；打包产物已有模型则不会走到这里）。
 */
import fs from 'node:fs';
import path from 'node:path';

import { t } from '../../i18n';
import { downloadVerified, type DownloadProgress } from '../../voice/download';

import { extractTarBz2 } from './bz2Extract';
import { SHERPA_MANIFEST, type ModelManifest } from './manifest';

export type ModelSource = 'env' | 'resources' | 'dev' | 'userData';

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
  /** userData/tts-models（运行时自动下载落点之一） */
  userRoot?: string;
  manifest?: ModelManifest;
}

export function locateModel(opts: LocateOptions): { dir: string; source: ModelSource } | null {
  const manifest = opts.manifest ?? SHERPA_MANIFEST;
  const candidates: Array<{ dir: string; source: ModelSource }> = [];
  if (opts.envDir) candidates.push({ dir: opts.envDir, source: 'env' });
  if (opts.resourcesDir) candidates.push({ dir: opts.resourcesDir, source: 'resources' });
  for (const d of opts.devDirs ?? []) candidates.push({ dir: d, source: 'dev' });
  if (opts.userRoot)
    candidates.push({ dir: path.join(opts.userRoot, manifest.id), source: 'userData' });
  for (const c of candidates) {
    if (verifyModelDir(c.dir, manifest).ok) return c;
  }
  return null;
}

export type InstallPhase = 'download' | 'extract';

export interface InstallOptions {
  /**
   * 安装根目录：最终模型在 `<installRoot>/<id>/`。
   * 开发态优先仓库同级 `../models`；打包态回退 `userData/tts-models`。
   */
  installRoot: string;
  manifest?: ModelManifest;
  signal?: AbortSignal;
  onProgress?: (phase: InstallPhase, p: DownloadProgress) => void;
  /** 测试注入 */
  download?: typeof downloadVerified;
  extract?: typeof extractTarBz2;
  fetchImpl?: Parameters<typeof downloadVerified>[0]['fetchImpl'];
}

/**
 * 下载（sha256 校验）→ 解压到 `<id>.partial` → 逐文件校验大小 → 原子改名为 `<id>`。
 * 任一步失败都清理临时文件并抛错（调用方回退系统语音）。
 */
export async function installModel(opts: InstallOptions): Promise<string> {
  const manifest = opts.manifest ?? SHERPA_MANIFEST;
  const download = opts.download ?? downloadVerified;
  const extract = opts.extract ?? extractTarBz2;
  const finalDir = path.join(opts.installRoot, manifest.id);
  const partialDir = `${finalDir}.partial`;
  const archive = path.join(opts.installRoot, '.download', `${manifest.id}.tar.bz2`);

  fs.mkdirSync(opts.installRoot, { recursive: true });
  fs.rmSync(partialDir, { recursive: true, force: true });
  try {
    await download({
      url: manifest.url,
      sha256: manifest.sha256,
      dest: archive,
      expectedBytes: manifest.bytes,
      signal: opts.signal,
      onProgress: (p) => opts.onProgress?.('download', p),
      fetchImpl: opts.fetchImpl,
    });
    opts.onProgress?.('extract', { received: 0, total: 1 });
    await extract(archive, partialDir, { stripTop: manifest.topDir, signal: opts.signal });
    const v = verifyModelDir(partialDir, manifest);
    if (!v.ok) throw new Error(t('模型文件校验失败：{0}', v.bad.slice(0, 3).join(', ')));
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(partialDir, finalDir);
    opts.onProgress?.('extract', { received: 1, total: 1 });
    return finalDir;
  } catch (e) {
    fs.rmSync(partialDir, { recursive: true, force: true });
    throw e;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}
