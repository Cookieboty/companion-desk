/** 设置分区（纯数据，App 首屏也要用，不随设置页懒加载）。 */
export type SettingsSection =
  | 'general'
  | 'shortcuts'
  | 'providers'
  | 'voice'
  | 'kb'
  | 'memory'
  | 'schedule'
  | 'calendar'
  | 'notify'
  | 'agents'
  | 'screen'
  | 'ext'
  | 'desktop'
  | 'local'
  | 'privacy'
  | 'updates';

export const SETTINGS_SECTIONS: Array<{ id: SettingsSection; icon: string; label: string }> = [
  { id: 'general', icon: '⚙️', label: '通用' },
  { id: 'shortcuts', icon: '⌨️', label: '快捷键' },
  { id: 'providers', icon: '🔑', label: '供应商与模型' },
  { id: 'voice', icon: '🎙', label: '语音' },
  { id: 'kb', icon: '📚', label: '知识库' },
  { id: 'memory', icon: '🧠', label: '记忆' },
  { id: 'schedule', icon: '🗓', label: '日程与提醒' },
  { id: 'calendar', icon: '📅', label: '日历' },
  { id: 'notify', icon: '🔔', label: '通知 / 灵动岛' },
  { id: 'agents', icon: '🤖', label: '编程助手' },
  { id: 'screen', icon: '🖥', label: '屏幕' },
  { id: 'ext', icon: '🧩', label: '扩展 / MCP' },
  { id: 'desktop', icon: '📁', label: '桌面权限' },
  { id: 'local', icon: '🏠', label: '本机小模型（辅助）' },
  { id: 'privacy', icon: '🔒', label: '隐私与数据' },
  { id: 'updates', icon: '⬆️', label: '更新' },
];
