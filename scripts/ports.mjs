// Single source of truth for Companion Desk dev ports (dev-ports.json + env overrides).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dev-ports.json');
const base = JSON.parse(readFileSync(file, 'utf8'));
const ENV = {
  renderer: 'CD_RENDERER_PORT',
  chat: 'CD_CHAT_PORT',
  demo: 'CD_DEMO_PORT',
};
const pick = (k) => {
  const v = Number(process.env[ENV[k]]);
  return Number.isInteger(v) && v > 0 && v < 65536 ? v : base[k];
};
export const PORTS = Object.fromEntries(Object.keys(ENV).map((k) => [k, pick(k)]));
export const PORT_ENV = ENV;
export const DEV_HOST = '127.0.0.1';
/** env to hand Electron / children so everything agrees on the same ports */
export const portEnv = () =>
  Object.fromEntries(Object.entries(ENV).map(([k, e]) => [e, String(PORTS[k])]));
