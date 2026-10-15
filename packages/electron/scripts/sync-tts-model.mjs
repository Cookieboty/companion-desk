#!/usr/bin/env node
/**
 * Stage the offline sherpa TTS model into packages/electron/resources/tts-models/
 * for electron-builder extraResources. Weights are NOT committed to git (~133MB).
 *
 * Resolution order for the source directory:
 *   1. NOMI_SHERPA_TTS_MODEL_DIR
 *   2. <repo>/../models/vits-zh-hf-theresa  (sibling of this monorepo, e.g. /workspace/models)
 *   3. <repo>/models/vits-zh-hf-theresa
 * If none exist, download the official archive into <repo>/../models/<id> (or NOMI_SHERPA_TTS_DOWNLOAD_DIR).
 *
 * Usage:
 *   node scripts/sync-tts-model.mjs          # copy if missing / incomplete; fetch if no source
 *   node scripts/sync-tts-model.mjs --force  # always re-copy (re-fetch if needed)
 *   node scripts/sync-tts-model.mjs --check  # exit 1 if staged model is incomplete
 *   node scripts/sync-tts-model.mjs --fetch-only  # ensure source dir exists (download), do not stage
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ELECTRON_ROOT, '../..');
const MODEL_ID = 'vits-zh-hf-theresa';
const DEST = path.join(ELECTRON_ROOT, 'resources', 'tts-models', MODEL_ID);
const MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-hf-theresa.tar.bz2';
const MODEL_SHA256 = 'f337638c49689e1d87135c4e224daa1aacc0109e784b1cf78eafb1b14a1d9e92';
const MODEL_BYTES = 120596617;

/** Required relative paths → exact byte sizes (must match src/tts/sherpa/manifest.ts). */
const REQUIRED = Object.freeze({
  'theresa.onnx': 121913906,
  'lexicon.txt': 2764076,
  'tokens.txt': 268,
  'phone.fst': 88630,
  'date.fst': 59154,
  'number.fst': 64482,
  'new_heteronym.fst': 21974,
  'dict/jieba.dict.utf8': 5071204,
  'dict/hmm_model.utf8': 519739,
  'dict/user.dict.utf8': 49,
  'dict/idf.utf8': 5998717,
  'dict/stop_words.utf8': 8974,
  'dict/pos_dict/prob_start.utf8': 4347,
  'dict/pos_dict/char_state_tab.utf8': 327139,
  'dict/pos_dict/prob_emit.utf8': 1687686,
  'dict/pos_dict/prob_trans.utf8': 124159,
});

function verify(dir) {
  const bad = [];
  for (const [rel, bytes] of Object.entries(REQUIRED)) {
    try {
      if (fs.statSync(path.join(dir, rel)).size !== bytes) bad.push(rel);
    } catch {
      bad.push(rel);
    }
  }
  return bad;
}

function defaultFetchRoot() {
  return process.env.NOMI_SHERPA_TTS_DOWNLOAD_DIR?.trim() || path.resolve(REPO_ROOT, '../models');
}

function findSource() {
  const candidates = [
    process.env.NOMI_SHERPA_TTS_MODEL_DIR?.trim(),
    path.resolve(REPO_ROOT, '../models', MODEL_ID),
    path.resolve(REPO_ROOT, 'models', MODEL_ID),
  ].filter(Boolean);
  for (const c of candidates) {
    if (verify(c).length === 0) return c;
  }
  return null;
}

function copyTree(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadArchive(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const res = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
  const out = fs.createWriteStream(tmp);
  const hash = createHash('sha256');
  let received = 0;
  let lastPct = -1;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.byteLength;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once('drain', r));
      }
      const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
      if (pct >= lastPct + 10 || received === total) {
        lastPct = pct;
        console.log(
          `[sync-tts-model] download ${pct}% (${formatBytes(received)} / ${formatBytes(total)})`,
        );
      }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const actual = hash.digest('hex');
    if (actual !== MODEL_SHA256) {
      throw new Error(`sha256 mismatch: expected ${MODEL_SHA256}, got ${actual}`);
    }
    fs.renameSync(tmp, dest);
  } catch (e) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

async function extractWithNodeModules(archive, destDir) {
  // Prefer the same streaming extract as the main process (unbzip2-stream + tar-stream).
  const require = createRequire(path.join(ELECTRON_ROOT, 'package.json'));
  const tar = require('tar-stream');
  const unbzip2 = require('unbzip2-stream');
  const extract = tar.extract();
  fs.mkdirSync(destDir, { recursive: true });
  const root = path.resolve(destDir);
  const prefix = `${MODEL_ID}/`;
  const written = [];
  extract.on('entry', (header, stream, next) => {
    let rel = header.name.replace(/\\/g, '/');
    if (rel.startsWith(prefix)) rel = rel.slice(prefix.length);
    else if (rel === MODEL_ID) rel = '';
    const abs = rel ? path.resolve(root, rel) : null;
    const ok =
      header.type === 'file' &&
      rel &&
      !rel.startsWith('/') &&
      !rel.includes('..') &&
      abs &&
      (abs === root || abs.startsWith(root + path.sep));
    if (!ok) {
      stream.resume();
      stream.on('end', next);
      return;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const out = fs.createWriteStream(abs, { mode: 0o644 });
    pipeline(stream, out).then(
      () => {
        written.push(rel);
        next();
      },
      (err) => next(err),
    );
  });
  await pipeline(fs.createReadStream(archive), unbzip2(), extract);
  return written;
}

async function fetchModelTo(installRoot) {
  const finalDir = path.join(installRoot, MODEL_ID);
  if (verify(finalDir).length === 0) {
    console.log(`[sync-tts-model] source already present: ${finalDir}`);
    return finalDir;
  }
  const partial = `${finalDir}.partial`;
  const archive = path.join(installRoot, '.download', `${MODEL_ID}.tar.bz2`);
  fs.mkdirSync(installRoot, { recursive: true });
  fs.rmSync(partial, { recursive: true, force: true });
  try {
    console.log(`[sync-tts-model] fetching ${MODEL_URL}`);
    await downloadArchive(archive);
    console.log(`[sync-tts-model] extracting → ${partial}`);
    await extractWithNodeModules(archive, partial);
    const bad = verify(partial);
    if (bad.length) {
      throw new Error(`extracted model incomplete: ${bad.slice(0, 3).join(', ')}`);
    }
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(partial, finalDir);
    console.log(`[sync-tts-model] fetched ${finalDir}`);
    return finalDir;
  } catch (e) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw e;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const checkOnly = args.has('--check');
const fetchOnly = args.has('--fetch-only');

if (checkOnly) {
  const bad = verify(DEST);
  if (bad.length) {
    console.error(
      `[sync-tts-model] staged model incomplete at ${DEST}: ${bad.slice(0, 3).join(', ')}`,
    );
    process.exit(1);
  }
  console.log(`[sync-tts-model] ok ${DEST}`);
  process.exit(0);
}

if (fetchOnly) {
  try {
    await fetchModelTo(defaultFetchRoot());
    process.exit(0);
  } catch (e) {
    console.error(`[sync-tts-model] fetch failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

if (!force && verify(DEST).length === 0) {
  console.log(`[sync-tts-model] already staged: ${DEST}`);
  process.exit(0);
}

let src = findSource();
if (!src) {
  try {
    src = await fetchModelTo(defaultFetchRoot());
  } catch (e) {
    console.error(
      `[sync-tts-model] source model not found and fetch failed: ${
        e instanceof Error ? e.message : e
      }\n` +
        `  Set NOMI_SHERPA_TTS_MODEL_DIR or place files at:\n` +
        `  ${path.resolve(REPO_ROOT, '../models', MODEL_ID)}\n` +
        `  ${path.resolve(REPO_ROOT, 'models', MODEL_ID)}`,
    );
    process.exit(1);
  }
}

console.log(`[sync-tts-model] ${src} → ${DEST}`);
copyTree(src, DEST);
const bad = verify(DEST);
if (bad.length) {
  console.error(`[sync-tts-model] copy failed verification: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`[sync-tts-model] done`);
