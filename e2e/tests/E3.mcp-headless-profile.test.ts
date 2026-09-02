/**
 * E3 · mcp-headless / 三 profile 装配 · headless smoke
 *
 * 语义对齐：
 * - 复用 dsh-app-boot 的 `loadProfile` + `composeEntries` 对三个 profile
 *   （waifu / chat-only / mcp-headless）各跑一遍装配；
 * - 断言 entries 数量合理、必备 entry 存在、无 skipped warnings；
 * - 对 `mcp-headless` 增加 stdout 校验：`pnpm doctor mcp-headless` 输出 YAML 段落
 *   合法，且末尾出现 `ok: N entries composed, no warnings`。
 *
 * 与 scripts/__tests__/dsh-smoke.test.ts 的差异：本用例站在"E2E 冒烟"视角，
 * 关注 profile 是否能被 headless 装配（对应 P8-8 E3 断言）。
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '..', '..');
const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');

const PROFILES = ['waifu', 'chat-only', 'mcp-headless'] as const;

describe('E3 · 三 profile headless 装配 + mcp-headless doctor 输出', () => {
  for (const profileName of PROFILES) {
    it(`profile "${profileName}" · loadProfile + composeEntries 无 warnings`, () => {
      const profile = loadProfile('e2e-smoke', profileName, installAnchor, projectRoot);
      expect(profile.name).toBe(profileName);
      expect(profile.layers.length).toBeGreaterThan(0);

      const warnings: string[] = [];
      const entries = composeEntries(
        [...profile.layers.map((layer) => layer.patches), profile.patches],
        (message) => warnings.push(message),
      );
      expect(warnings, warnings.join('\n')).toEqual([]);
      expect(entries.length).toBeGreaterThan(50);

      const ids = new Set(entries.map((entry) => entry.id));
      for (const requiredId of ['llm', 'session', 'agent', 'tools']) {
        expect(ids, `entry "${requiredId}" missing in ${profileName}`).toContain(requiredId);
      }
    });
  }

  it('mcp-headless · pnpm doctor 输出合法 entries 段落，且以 "ok" 收尾', () => {
    const stdout = execFileSync('pnpm', ['run', 'doctor', 'mcp-headless'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    expect(stdout).toMatch(/\[dsh-doctor\] profile=mcp-headless/);
    expect(stdout).toMatch(/=== composed entries \((\d+)\) ===/);
    expect(stdout).toMatch(/ok: \d+ entries composed, no warnings/);

    const match = stdout.match(/=== composed entries \((\d+)\) ===/);
    const declared = match ? Number(match[1]) : 0;
    expect(declared).toBeGreaterThan(50);

    const yamlStart = stdout.indexOf('=== composed entries');
    const yamlBlock = stdout.slice(stdout.indexOf('\n', yamlStart) + 1);
    const yamlEnd = yamlBlock.indexOf('\n[dsh-doctor] ok:');
    expect(yamlEnd).toBeGreaterThan(0);
    const yamlText = yamlBlock.slice(0, yamlEnd);

    // 无需 yaml 依赖，直接按顶层 "- id:" 行数校验 entry 数量 + 关键 id 出现
    const topLevelEntries = yamlText.split('\n').filter((line) => /^- id:\s/.test(line));
    expect(topLevelEntries.length).toBe(declared);
    expect(yamlText).toMatch(/^- id:\s+llm(\s|$)/m);
    expect(yamlText).toMatch(/^- id:\s+agent(\s|$)/m);
  }, 60_000);
});
