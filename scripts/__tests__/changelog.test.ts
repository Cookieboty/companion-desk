import { describe, expect, it } from 'vitest';

import {
  buildChangelog,
  classify,
  parseChangeset,
  release,
  renderUnreleased,
} from '../release/changelog.mjs';

describe('root CHANGELOG from changesets', () => {
  it('parses frontmatter packages and summary', () => {
    const c = parseChangeset("---\n'@nomi-ai/ai-sdk': minor\n---\n\nfeat(sdk): streaming\n");
    expect(c).toEqual({
      packages: { '@nomi-ai/ai-sdk': 'minor' },
      summary: 'feat(sdk): streaming',
    });
    expect(parseChangeset('---\n---\n\nfix: x\n')?.packages).toEqual({});
  });

  it('classifies by conventional prefix and flags breaking', () => {
    expect(classify('fix(security): a')).toEqual({
      section: 'Fixes',
      line: '**security:** a',
      breaking: false,
    });
    expect(classify('refactor!: drop dsh').breaking).toBe(true);
    expect(classify('plain text').section).toBe('Other');
  });

  it('renders grouped sections and keeps released history', () => {
    const u = renderUnreleased([
      { packages: {}, summary: 'fix: b' },
      { packages: { '@nomi-ai/ai-sdk': 'patch' }, summary: 'feat: a' },
    ]);
    expect(u.indexOf('### Features')).toBeLessThan(u.indexOf('### Fixes'));
    expect(u).toContain('- a (`@nomi-ai/ai-sdk` patch)');
    const old = '# Changelog\n\n## Unreleased\n\n- stale\n\n## 1.0.0 — 2026-01-01\n\n- first\n';
    const next = buildChangelog(old, u);
    expect(next).not.toContain('stale');
    expect(next).toContain('## 1.0.0 — 2026-01-01\n\n- first');
    expect(buildChangelog(next, u)).toBe(next);
  });

  it('release turns Unreleased into a version heading', () => {
    const t = release('# C\n\n## Unreleased\n\n### Fixes\n\n- x\n', '1.1.0', '2026-10-14');
    expect(t).toMatch(
      /## Unreleased\n\n_No pending changesets._\n\n## 1.1.0 — 2026-10-14\n\n### Fixes/,
    );
  });
});
