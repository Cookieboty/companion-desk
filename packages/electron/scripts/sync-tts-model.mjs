#!/usr/bin/env node
/**
 * Stage the offline sherpa TTS model into packages/electron/resources/tts-models/
 * for electron-builder extraResources. Weights are NOT committed to git (~133MB).
 *
 * Resolution order for the source directory:
 *   1. NOMI_SHERPA_TTS_MODEL_DIR
 *   2. <repo>/../models/vits-zh-hf-theresa  (sibling of this monorepo, e.g. /workspace/models)
 *   3. <repo>/models/vits-zh-hf-theresa
 *
 * Usage:
 *   node scripts/sync-tts-model.mjs          # copy if missing / incomplete
 *   node scripts/sync-tts-model.mjs --force  # always re-copy
 *   node scripts/sync-tts-model.mjs --check  # exit 1 if staged model is incomplete
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ELECTRON_ROOT, '../..');
const MODEL_ID = 'vits-zh-hf-theresa';
const DEST = path.join(ELECTRON_ROOT, 'resources', 'tts-models', MODEL_ID);

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

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const checkOnly = args.has('--check');

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

if (!force && verify(DEST).length === 0) {
  console.log(`[sync-tts-model] already staged: ${DEST}`);
  process.exit(0);
}

const src = findSource();
if (!src) {
  console.error(
    `[sync-tts-model] source model not found. Set NOMI_SHERPA_TTS_MODEL_DIR or place files at:\n` +
      `  ${path.resolve(REPO_ROOT, '../models', MODEL_ID)}\n` +
      `  ${path.resolve(REPO_ROOT, 'models', MODEL_ID)}`,
  );
  process.exit(1);
}

console.log(`[sync-tts-model] ${src} → ${DEST}`);
copyTree(src, DEST);
const bad = verify(DEST);
if (bad.length) {
  console.error(`[sync-tts-model] copy failed verification: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`[sync-tts-model] done`);
