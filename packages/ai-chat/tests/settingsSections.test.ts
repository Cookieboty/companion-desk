import { describe, expect, it } from 'vitest';

import { SECTION_TABS, SETTINGS_SECTIONS, tabOf } from '../src/components/SettingsView/sections';

describe('设置分区：编程助手', () => {
  it('「供应商与模型」与「编程助手」合成一个顶层「编程助手」', () => {
    const labels = SETTINGS_SECTIONS.map((s) => s.label);
    expect(labels.filter((l) => l === '编程助手')).toHaveLength(1);
    expect(labels).not.toContain('供应商与模型');
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('agents');
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('providers');
  });
});

describe('设置分区：合并后的菜单', () => {
  it('知识库 + 记忆、日程与提醒 + 日历、桌面权限 + 隐私与数据 各合并成一个分区（高频在前）', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      'general',
      'shortcuts',
      'coding',
      'usage',
      'voice',
      'knowledge',
      'schedule',
      'notify',
      'screen',
      'ext',
      'local',
      'privacy',
      'updates',
    ]);
    const labels = SETTINGS_SECTIONS.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['知识与记忆', '日程与日历', '隐私与权限']));
    for (const old of ['知识库', '记忆', '日程与提醒', '日历', '桌面权限', '隐私与数据'])
      expect(labels).not.toContain(old);
  });

  it('有标签页的分区：标签 id 唯一，tabOf 只认本分区的标签', () => {
    for (const [section, tabs] of Object.entries(SECTION_TABS)) {
      const ids = tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(SETTINGS_SECTIONS.map((s) => s.id as string)).toContain(section);
    }
    expect(tabOf('knowledge', 'memory')).toBe('memory');
    expect(tabOf('knowledge', 'calendar')).toBeUndefined();
    expect(tabOf('schedule', 'calendar')).toBe('calendar');
    expect(tabOf('privacy', 'desktop')).toBe('desktop');
    expect(tabOf('privacy', undefined)).toBeUndefined();
  });
});
