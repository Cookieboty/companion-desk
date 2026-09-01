import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot';
import { describe, expect, it } from 'vitest';

const BIN_NAME = 'dsh-smoke';
const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');

const PROFILES = ['waifu', 'chat-only', 'mcp-headless'] as const;

describe('dsh kernel smoke: profiles/ compose', () => {
  for (const profileName of PROFILES) {
    it(`loadProfile + composeEntries succeeds for ${profileName}`, () => {
      const profile = loadProfile(BIN_NAME, profileName, installAnchor, projectRoot);

      expect(profile.name).toBe(profileName);
      expect(profile.dir).toBe(path.join(projectRoot, 'profiles', profileName));
      expect(profile.layers.length).toBeGreaterThan(0);

      const baseLayer = profile.layers.find(
        (layer) => layer.packageName === '@deepseek-ai/dsh-base',
      );
      expect(baseLayer).toBeDefined();
      expect(baseLayer!.patches.length).toBeGreaterThan(0);

      const warnings: string[] = [];
      const entries = composeEntries(
        [...profile.layers.map((layer) => layer.patches), profile.patches],
        (message) => warnings.push(message),
      );

      expect(warnings, warnings.join('\n')).toEqual([]);
      expect(entries.length).toBeGreaterThan(50);

      const ids = new Set(entries.map((entry) => entry.id));
      for (const requiredId of [
        'llm',
        'session',
        'agent',
        'tools',
        'system-prompt',
        'agent-loop',
      ]) {
        expect(ids, `entry id "${requiredId}" missing`).toContain(requiredId);
      }
    });
  }

  it('non-existent profile throws a labelled error', () => {
    expect(() => loadProfile(BIN_NAME, 'does-not-exist', installAnchor, projectRoot)).toThrow(
      /dsh-smoke: profile "does-not-exist" does not exist/,
    );
  });
});
