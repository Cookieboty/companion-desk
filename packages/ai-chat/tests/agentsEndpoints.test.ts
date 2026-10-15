import { describe, expect, it } from 'vitest';

import {
  endpointCounts,
  filterSessions,
  type AgentSessionView,
} from '../src/services/agentsClient';

const s = (over: Partial<AgentSessionView>): AgentSessionView => ({
  id: Math.random().toString(36),
  kind: 'claude',
  label: 'x',
  title: 't',
  status: 'running',
  path: '',
  mtime: 0,
  updatedAt: 0,
  ...over,
});

describe('aggregated monitor helpers', () => {
  const list = [
    s({ kind: 'claude' }),
    s({ kind: 'dsh' }),
    s({ kind: 'dsh', source: 'tab', tabId: 'a' }),
    s({ kind: 'nomi', source: 'tab', tabId: 'main' }),
    s({ kind: 'codex' }),
  ];
  it('counts sessions per endpoint', () => {
    expect(endpointCounts(list)).toEqual([
      ['all', 5],
      ['tabs', 2],
      ['claude', 1],
      ['dsh', 2],
      ['codex', 1],
    ]);
  });
  it('filters by endpoint or tabs', () => {
    expect(filterSessions(list, 'all')).toHaveLength(5);
    expect(filterSessions(list, 'tabs').map((x) => x.tabId)).toEqual(['a', 'main']);
    expect(filterSessions(list, 'dsh')).toHaveLength(2);
  });
});
