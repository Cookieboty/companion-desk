import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS, resolveSection } from '../src/components/SettingsView/sections';

describe('设置分区：编程助手', () => {
  it('旧的「供应商与模型」「编程助手」两个入口合并成一个顶层「编程助手」', () => {
    const labels = SETTINGS_SECTIONS.map((s) => s.label);
    expect(labels.filter((l) => l === '编程助手')).toHaveLength(1);
    expect(labels).not.toContain('供应商与模型');
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('agents');
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('providers');
  });

  it('旧深链接折叠到新分区：providers → coding；agents → coding 的监视标签', () => {
    expect(resolveSection('providers')).toEqual({ section: 'coding' });
    expect(resolveSection('agents')).toEqual({ section: 'coding', tab: 'monitor' });
    expect(resolveSection('coding')).toEqual({ section: 'coding' });
    expect(resolveSection('nope')).toEqual({ section: 'general' });
    expect(resolveSection(undefined)).toEqual({ section: 'general' });
  });
});
