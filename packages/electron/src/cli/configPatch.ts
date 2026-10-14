/**
 * 对 Claude / Codex 配置做「只改连接字段」的补丁，并支持备份恢复。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ClaudeEnvPatch {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
}

export interface CodexPatch {
  model?: string;
  model_provider?: string;
  /** 写入 auth.json 的 OPENAI_API_KEY */
  OPENAI_API_KEY?: string;
  /** config.toml 里 providers 段用的 name */
  providerName?: string;
  base_url?: string;
  /** 默认 responses（Codex 原生） */
  wire_api?: 'responses' | 'chat';
}

export function claudeSettingsPath(home = os.homedir()): string {
  return path.join(home, '.claude', 'settings.json');
}

export function codexConfigPath(home = os.homedir()): string {
  return path.join(home, '.codex', 'config.toml');
}

export function codexAuthPath(home = os.homedir()): string {
  return path.join(home, '.codex', 'auth.json');
}

export function ensureDir(p: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

export function backupFile(src: string, backupRoot: string, label: string): string | null {
  if (!fs.existsSync(src)) return null;
  const dest = path.join(backupRoot, label);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return dest;
}

/** 合并 Claude settings.json 的 env 字段；保留其余一切 */
export function patchClaudeSettings(raw: string | null, patch: ClaudeEnvPatch): string {
  let obj: Record<string, unknown> = {};
  if (raw) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  const env =
    obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env)
      ? { ...(obj.env as Record<string, unknown>) }
      : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') delete env[k];
    else env[k] = v;
  }
  obj.env = env;
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * 极简 TOML 补丁：设置顶层 model / 并确保 [model_providers.nomi] 段。
 * 不追求完整 TOML 解析；对未知内容尽量保留原文件头部注释与其它段。
 */
export function patchCodexToml(raw: string | null, patch: CodexPatch): string {
  const lines = (raw ?? '').split(/\r?\n/);
  const out: string[] = [];
  let inProvider = false;
  /** 只改写首个表头之前的顶层键；[profiles.*] 等表里的同名键保持原样 */
  let inTable = false;
  let sawModel = false;
  let sawProviderKey = false;
  const provider = patch.providerName ?? 'nomi';
  const providerHeader = `[model_providers.${provider}]`;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      inProvider = t === providerHeader;
      inTable = true;
      // 本段在文件末尾整体重写；保留原标题会导致重复的 TOML 表（Codex 拒绝解析）
      if (!inProvider) out.push(line);
      continue;
    }
    if (!inTable && /^model\s*=/.test(t) && patch.model) {
      out.push(`model = "${escapeToml(patch.model)}"`);
      sawModel = true;
      continue;
    }
    if (!inTable && /^model_provider\s*=/.test(t) && patch.model_provider) {
      out.push(`model_provider = "${escapeToml(patch.model_provider)}"`);
      sawProviderKey = true;
      continue;
    }
    if (inProvider) {
      // 整段稍后重写，跳过旧内容
      continue;
    }
    out.push(line);
  }

  if (!sawModel && patch.model) out.unshift(`model = "${escapeToml(patch.model)}"`);
  if (!sawProviderKey && patch.model_provider)
    out.unshift(`model_provider = "${escapeToml(patch.model_provider)}"`);

  // 去掉文件末尾空行后追加 provider 段
  while (out.length && out[out.length - 1] === '') out.pop();
  out.push('');
  out.push(providerHeader);
  out.push(`name = "${escapeToml(provider)}"`);
  if (patch.base_url) out.push(`base_url = "${escapeToml(patch.base_url)}"`);
  out.push(`wire_api = "${patch.wire_api ?? 'responses'}"`);
  out.push('');
  return out.join('\n');
}

function escapeToml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function patchCodexAuth(raw: string | null, apiKey: string | undefined): string {
  let obj: Record<string, unknown> = {};
  if (raw) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  if (apiKey) obj.OPENAI_API_KEY = apiKey;
  return `${JSON.stringify(obj, null, 2)}\n`;
}
