/**
 * Built-in Fish voice references shipped under packages/electron/assets/tts/references/<id>/.
 * Prefer embedding sample.wav + sample.lab into /v1/tts as reference_audio (base64) + reference_text
 * so users do not manually copy files into the fish-speech server.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BuiltinFishReference {
  id: string;
  /** Absolute path to sample.wav */
  wavPath: string;
  /** Absolute path to sample.lab */
  labPath: string;
  audioBase64: string;
  referenceText: string;
}

const cache = new Map<string, BuiltinFishReference | null>();

/** Safe id segment for references/<id>/ */
export function sanitizeReferenceId(id: string): string {
  const cleaned = id.trim();
  if (!/^[a-zA-Z0-9\-_ ]{1,64}$/.test(cleaned)) return 'nomi';
  return cleaned;
}

/**
 * Candidate roots for `assets/` (dev compile output, packaged asar, extraResources).
 * Pure helper — injectable for tests.
 */
export function builtinAssetsRoots(opts?: {
  dirname?: string;
  resourcesPath?: string;
  appPath?: string;
  cwd?: string;
}): string[] {
  const dirname = opts?.dirname ?? __dirname;
  const roots: string[] = [];
  // dist/tts/fish → ../../../assets = packages/electron/assets
  roots.push(path.join(dirname, '..', '..', '..', 'assets'));
  if (opts?.appPath) roots.push(path.join(opts.appPath, 'assets'));
  if (opts?.resourcesPath) roots.push(path.join(opts.resourcesPath, 'assets'));
  const cwd = opts?.cwd ?? process.cwd();
  roots.push(path.join(cwd, 'packages', 'electron', 'assets'));
  roots.push(path.join(cwd, 'assets'));
  // de-dupe while preserving order
  const seen = new Set<string>();
  return roots.filter((r) => {
    const n = path.normalize(r);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

export function resolveBuiltinReferencePaths(
  id: string,
  opts?: {
    roots?: string[];
    existsSync?: (p: string) => boolean;
  },
): { wavPath: string; labPath: string } | null {
  const safeId = sanitizeReferenceId(id);
  const exists = opts?.existsSync ?? fs.existsSync;
  const roots = opts?.roots ?? builtinAssetsRoots();
  for (const root of roots) {
    const dir = path.join(root, 'tts', 'references', safeId);
    const wavPath = path.join(dir, 'sample.wav');
    const labPath = path.join(dir, 'sample.lab');
    if (exists(wavPath) && exists(labPath)) {
      return { wavPath, labPath };
    }
  }
  return null;
}

/**
 * Load built-in reference audio+transcript. Cached per id.
 * Returns null when the preset folder is missing (e.g. tests without assets).
 */
export function loadBuiltinReference(
  id: string,
  opts?: {
    roots?: string[];
    readFileSync?: (p: string, enc?: BufferEncoding) => Buffer | string;
    existsSync?: (p: string) => boolean;
    /** Skip cache (tests) */
    noCache?: boolean;
  },
): BuiltinFishReference | null {
  const safeId = sanitizeReferenceId(id);
  if (!opts?.noCache && cache.has(safeId)) return cache.get(safeId) ?? null;

  const paths = resolveBuiltinReferencePaths(safeId, {
    roots: opts?.roots,
    existsSync: opts?.existsSync,
  });
  if (!paths) {
    if (!opts?.noCache) cache.set(safeId, null);
    return null;
  }

  const read = opts?.readFileSync ?? ((p: string, enc?: BufferEncoding) => fs.readFileSync(p, enc));
  try {
    const wav = read(paths.wavPath) as Buffer;
    const labRaw = read(paths.labPath, 'utf8') as string;
    const referenceText = String(labRaw).trim();
    if (!wav?.length || !referenceText) {
      if (!opts?.noCache) cache.set(safeId, null);
      return null;
    }
    const ref: BuiltinFishReference = {
      id: safeId,
      wavPath: paths.wavPath,
      labPath: paths.labPath,
      audioBase64: Buffer.from(wav).toString('base64'),
      referenceText,
    };
    if (!opts?.noCache) cache.set(safeId, ref);
    return ref;
  } catch {
    if (!opts?.noCache) cache.set(safeId, null);
    return null;
  }
}

/** Clear in-memory cache (tests / hot reload). */
export function clearBuiltinReferenceCache(): void {
  cache.clear();
}
