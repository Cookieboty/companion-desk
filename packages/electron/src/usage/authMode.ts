/**
 * 判断每个工具「当前是订阅 / 账号登录，还是 API 计费」，额度卡只对订阅登录的工具展示。
 *
 * 原则（与 quota.ts 一致）：不读取任何凭据内容。
 * - Claude Code：官方命令 `claude auth status`（JSON，只取 authMethod 字段；输出里的邮箱等一律丢弃）。
 * - Codex：官方命令 `codex login status`（只看是 ChatGPT 还是 API Key；输出里的 Key 片段一律丢弃）。
 *   这两个命令由官方 CLI 自己读它的凭据，Nomi 只看到「登录方式」这一个结论。
 * - CLI 不可用 / 超时时的本地兜底，只检查「配置里有没有出现某个键名 / 字段」，不读取值：
 *   Claude：~/.claude/settings.json 的 env 里有 ANTHROPIC_API_KEY / AUTH_TOKEN / BASE_URL / 云厂商开关 → API；
 *   Codex：config.toml 的 forced_login_method / 自定义 model_provider；日志里有带套餐的 rate_limits → 订阅。
 * - dsh（DeepSeek 官方接口 / 自配供应商）与 Nomi 对话都走 API Key：固定 API。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolveCliBinAsync, withCliPath } from '../cli/detect';

import type { QuotaEntry } from './quota';

const execFileP = promisify(execFile);

/** subscription = 账号 / 订阅登录；api = API Key / 第三方供应商 / 本地路由；unknown = 没登录或判断不了 */
export type AuthMode = 'subscription' | 'api' | 'unknown';

/** `claude auth status` 的 JSON：只认 authMethod（官方 CLI 参考列出的取值） */
export function parseClaudeAuthStatus(text: string): AuthMode | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const m = (o as { authMethod?: unknown } | null)?.authMethod;
  if (typeof m !== 'string') return null;
  if (m === 'claude.ai' || m === 'oauth_token') return 'subscription';
  if (m === 'api_key' || m === 'api_key_helper' || m === 'third_party') return 'api';
  if (m === 'none') return 'unknown';
  return null;
}

/** `codex login status` 的输出：Logged in using ChatGPT / Logged in using an API key - … / Not logged in */
export function parseCodexLoginStatus(text: string): AuthMode | null {
  const s = text.toLowerCase();
  if (/not logged in/.test(s)) return 'unknown';
  if (/using an? api key/.test(s)) return 'api';
  if (/using chatgpt/.test(s)) return 'subscription';
  return null;
}

const CLAUDE_API_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

/** 兜底：settings.json 的 env 块里出现 API 相关键名 → API（只看键名，不看值） */
export function claudeAuthFromConfig(home: string, env: NodeJS.ProcessEnv): AuthMode | null {
  if (CLAUDE_API_KEYS.some((k) => !!env[k])) return 'api';
  try {
    const o = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')) as {
      env?: Record<string, unknown>;
    };
    const e = o && typeof o.env === 'object' && o.env ? o.env : {};
    if (CLAUDE_API_KEYS.some((k) => k in e)) return 'api';
  } catch {
    /* 没有 / 不是合法 JSON */
  }
  return null;
}

/** 兜底：config.toml 里的 forced_login_method / 自定义 model_provider（只看这两个字段，不碰 auth.json） */
export function codexAuthFromConfig(home: string, env: NodeJS.ProcessEnv): AuthMode | null {
  let toml: string;
  try {
    toml = fs.readFileSync(
      path.join(env.CODEX_HOME || path.join(home, '.codex'), 'config.toml'),
      'utf8',
    );
  } catch {
    return null;
  }
  // 只看顶层键（第一个 [table] 之前）
  const top = toml.split(/^\s*\[/m)[0] ?? '';
  const forced = /^\s*forced_login_method\s*=\s*"(\w+)"/m.exec(top)?.[1];
  if (forced === 'api') return 'api';
  if (forced === 'chatgpt') return 'subscription';
  const prov = /^\s*model_provider\s*=\s*"([^"]+)"/m.exec(top)?.[1];
  if (prov && prov !== 'openai') return 'api';
  return null;
}

export interface AuthDeps {
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** 运行官方「登录状态」命令，返回 stdout+stderr；没有 CLI / 超时 / 出错返回 null。可注入（测试）。 */
  run?: (kind: 'claude' | 'codex') => Promise<string | null>;
  /** 兜底之外的本地线索：来源里已经有带套餐的额度快照 */
  hasSubscriptionData?: (id: 'claude' | 'codex') => boolean;
}

const TTL_MS = 5 * 60_000;

async function runStatus(kind: 'claude' | 'codex'): Promise<string | null> {
  const bin = await resolveCliBinAsync(kind);
  if (!bin) return null;
  const args = kind === 'claude' ? ['auth', 'status'] : ['login', 'status'];
  try {
    const r = await execFileP(bin, args, {
      encoding: 'utf8',
      timeout: 6000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin),
      env: { ...withCliPath(), NO_COLOR: '1' },
    });
    return `${r.stdout}\n${r.stderr}`;
  } catch (e) {
    // 未登录时 CLI 以退出码 1 结束，但 stdout / stderr 里仍有状态
    const x = e as { stdout?: unknown; stderr?: unknown };
    const out = `${typeof x.stdout === 'string' ? x.stdout : ''}\n${typeof x.stderr === 'string' ? x.stderr : ''}`;
    return out.trim() ? out : null;
  }
}

export class AuthModeDetector {
  private readonly cache = new Map<string, { at: number; mode: AuthMode }>();
  private readonly inflight = new Map<string, Promise<AuthMode>>();

  constructor(private readonly d: AuthDeps = {}) {}

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  /** nomi / dsh 固定 API；claude / codex 先问官方命令，再用本地配置兜底 */
  detect(id: string): Promise<AuthMode> {
    if (id === 'nomi' || id === 'dsh') return Promise.resolve('api');
    if (id !== 'claude' && id !== 'codex') return Promise.resolve('unknown');
    const hit = this.cache.get(id);
    if (hit && this.now() - hit.at < TTL_MS) return Promise.resolve(hit.mode);
    const pending = this.inflight.get(id);
    if (pending) return pending;
    const p = this.probe(id)
      .then((mode) => {
        this.cache.set(id, { at: this.now(), mode });
        return mode;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, p);
    return p;
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async probe(id: 'claude' | 'codex'): Promise<AuthMode> {
    const home = this.d.home ?? os.homedir();
    const env = this.d.env ?? process.env;
    const text: string | null = await (this.d.run ?? runStatus)(id).catch(() => null);
    const fromCli = text
      ? id === 'claude'
        ? parseClaudeAuthStatus(text)
        : parseCodexLoginStatus(text)
      : null;
    // 官方命令说「没登录」时，仍允许下面的兜底再判断（例如只用环境变量的 API Key）
    if (fromCli && fromCli !== 'unknown') return fromCli;
    const cfg = id === 'claude' ? claudeAuthFromConfig(home, env) : codexAuthFromConfig(home, env);
    if (cfg) return cfg;
    if (this.d.hasSubscriptionData?.(id)) return 'subscription';
    return 'unknown';
  }
}

/**
 * 把「按来源汇总的额度」按登录方式过滤：
 * - 订阅登录：有数据 → ok；没数据 → unavailable（显示「暂未返回可用额度」）
 * - API 计费：status = api（显示「API 计费，无订阅额度」）；Nomi 对话不出现在额度卡里
 * - 判断不了：有数据才展示，没有数据就不出现（不对没登录的工具乱报「暂未返回」）
 */
export function applyAuthModes(
  entries: QuotaEntry[],
  modes: Record<string, AuthMode>,
  detected: ReadonlySet<string>,
): QuotaEntry[] {
  const out: QuotaEntry[] = [];
  for (const e of entries) {
    const auth = modes[e.id] ?? 'unknown';
    if (e.id === 'nomi') continue;
    // 没检测到这个工具的本机痕迹，也没有额度数据：不出现
    if (e.status !== 'ok' && !detected.has(e.id)) continue;
    if (auth === 'api') out.push({ ...e, status: 'api', windows: [], auth });
    else if (auth === 'subscription') out.push({ ...e, auth });
    else if (e.status === 'ok') out.push({ ...e, auth });
  }
  return out;
}
