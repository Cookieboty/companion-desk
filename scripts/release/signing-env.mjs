#!/usr/bin/env node
/* eslint-disable no-console -- CI 脚本 */
/**
 * 发布签名 / 公证环境变量门控（CI tag 构建用）。
 *
 * 从仓库 secret 映射到 electron-builder 识别的环境变量，只在「整组凭证齐全」时才导出：
 * - macOS 签名：MAC_CSC_LINK + MAC_CSC_KEY_PASSWORD → CSC_LINK / CSC_KEY_PASSWORD
 * - macOS 公证：签名可用且 APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID 齐全 → 导出这三项
 *   （electron-builder 26 检测到它们即自动 notarize；只给一部分会直接报错，所以这里整组门控）
 * - Windows 签名：WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD → 原名导出（electron-builder 的 Windows 专用变量）
 * - Linux：不签名
 * 缺失时降级为未签名构建并打印原因，不让发布失败。
 *
 * 用法：node scripts/release/signing-env.mjs <mac|win|linux>（输出追加到 $GITHUB_ENV）
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SECRET_NAMES = {
  mac: ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD'],
  notarize: ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  win: ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'],
};

const has = (env, names) => names.every((n) => typeof env[n] === 'string' && env[n].trim() !== '');
const partial = (env, names) => names.some((n) => env[n]?.trim()) && !has(env, names);

/** @returns {{ vars: Record<string,string>, notes: string[], signed: boolean, notarize: boolean }} */
export function resolveSigningEnv(platform, env) {
  const vars = {};
  const notes = [];
  let signed = false;
  let notarize = false;
  if (platform === 'mac') {
    if (has(env, SECRET_NAMES.mac)) {
      vars.CSC_LINK = env.MAC_CSC_LINK;
      vars.CSC_KEY_PASSWORD = env.MAC_CSC_KEY_PASSWORD;
      vars.CSC_IDENTITY_AUTO_DISCOVERY = 'true';
      signed = true;
    } else {
      vars.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
      notes.push(
        partial(env, SECRET_NAMES.mac)
          ? 'mac: MAC_CSC_LINK / MAC_CSC_KEY_PASSWORD incomplete — building unsigned'
          : 'mac: no signing secrets — building unsigned',
      );
    }
    if (signed && has(env, SECRET_NAMES.notarize)) {
      for (const n of SECRET_NAMES.notarize) vars[n] = env[n];
      notarize = true;
    } else if (signed) {
      notes.push(
        partial(env, SECRET_NAMES.notarize)
          ? 'mac: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID incomplete — notarization skipped'
          : 'mac: no notarization secrets — notarization skipped',
      );
    } else if (has(env, SECRET_NAMES.notarize)) {
      notes.push('mac: notarization requires a signed build — skipped');
    }
  } else if (platform === 'win') {
    vars.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    if (has(env, SECRET_NAMES.win)) {
      vars.WIN_CSC_LINK = env.WIN_CSC_LINK;
      vars.WIN_CSC_KEY_PASSWORD = env.WIN_CSC_KEY_PASSWORD;
      signed = true;
    } else {
      notes.push('win: no WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD — building unsigned');
    }
  } else if (platform !== 'linux') {
    throw new Error(`unknown platform: ${platform}`);
  }
  return { vars, notes, signed, notarize };
}

function toGithubEnv(vars) {
  // 证书 base64 可能很长但不含换行；仍用 heredoc 语法以防万一
  return Object.entries(vars)
    .map(([k, v]) => `${k}<<__NOMI_EOF__\n${v}\n__NOMI_EOF__\n`)
    .join('');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const platform = process.argv[2];
  const { vars, notes, signed, notarize } = resolveSigningEnv(platform, process.env);
  for (const n of notes) console.log(`::notice::${n}`);
  console.log(`[signing] ${platform}: signed=${signed} notarize=${notarize}`);
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, toGithubEnv(vars));
}
