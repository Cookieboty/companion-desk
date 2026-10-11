#!/usr/bin/env node
/**
 * Resolve TypeScript from the workspace root and run its CLI.
 *
 * Why: on Windows, pnpm's package-local `.bin/tsc.cmd` often points at
 * `packages/<pkg>/node_modules/typescript/bin/tsc` even when TypeScript is
 * only hoisted to the repo root. That yields:
 *   Error: Cannot find module '...\packages\types\node_modules\typescript\bin\tsc'
 *
 * Package scripts should call this helper instead of bare `tsc`.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));

let tscJs;
try {
  tscJs = requireFromRoot.resolve('typescript/lib/tsc.js');
} catch (err) {
  console.error(
    '[run-tsc] Cannot resolve typescript from the workspace root.\n' +
      '  → From the repo root run: pnpm install\n' +
      '  → Or: corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm install',
  );
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

// Make tsc.js see: node <tsc.js> ...args  (it reads process.argv.slice(2))
process.argv = [process.argv[0], tscJs, ...process.argv.slice(2)];
requireFromRoot(tscJs);
