/** 设置分区（纯数据，App 首屏也要用，不随设置页懒加载）。 */
export type SettingsSection =
  | 'general'
  | 'shortcuts'
  | 'coding'
  | 'voice'
  | 'kb'
  | 'memory'
  | 'schedule'
  | 'calendar'
  | 'notify'
  | 'screen'
  | 'ext'
  | 'desktop'
  | 'local'
  | 'privacy'
  | 'updates';

export const SETTINGS_SECTIONS: Array<{ id: SettingsSection; icon: string; label: string }> = [
  { id: 'general', icon: '⚙️', label: '通用' },
  { id: 'shortcuts', icon: '⌨️', label: '快捷键' },
  { id: 'coding', icon: '🤖', label: '编程助手' },
  { id: 'voice', icon: '🎙', label: '语音' },
  { id: 'kb', icon: '📚', label: '知识库' },
  { id: 'memory', icon: '🧠', label: '记忆' },
  { id: 'schedule', icon: '🗓', label: '日程与提醒' },
  { id: 'calendar', icon: '📅', label: '日历' },
  { id: 'notify', icon: '🔔', label: '通知 / 灵动岛' },
  { id: 'screen', icon: '🖥', label: '屏幕' },
  { id: 'ext', icon: '🧩', label: '扩展 / MCP' },
  { id: 'desktop', icon: '📁', label: '桌面权限' },
  { id: 'local', icon: '🏠', label: '本机小模型（辅助）' },
  { id: 'privacy', icon: '🔒', label: '隐私与数据' },
  { id: 'updates', icon: '⬆️', label: '更新' },
];

/**
 * 旧入口 → 新分区：
 * - `providers`（旧「供应商与模型」）→ `coding`；
 * - `agents`（旧「日程与提醒」里的「编程助手」标签 / 旧顶层「编程助手」）→ `coding` 的「监视与会话」标签。
 */
export function resolveSection(sec: string | undefined): {
  section: SettingsSection;
  tab?: 'monitor';
} {
  if (sec === 'agents') return { section: 'coding', tab: 'monitor' };
  if (sec === 'providers') return { section: 'coding' };
  const hit = SETTINGS_SECTIONS.find((s) => s.id === sec);
  return { section: hit ? hit.id : 'general' };
}
