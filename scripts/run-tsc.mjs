#!/usr/bin/env node
/** @deprecated Prefer `node ../../scripts/run-bin.mjs tsc ...` — kept as a short alias. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(
  process.execPath,
  [path.join(here, 'run-bin.mjs'), 'tsc', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: process.cwd(), env: process.env, windowsHide: true },
);
process.exit(r.status ?? 1);
