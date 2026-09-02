import type { LegacyAppConfig, LegacyChatSetting } from './types';

// 直接对齐 packages/bundle-ig-base/src/types/UserProfile.ts 的字段结构；这里
// 单独复刻一份，避免把 workspace 依赖拉进 scripts/。若源类型演进，请同步更新。
export type PreferenceSource = 'user' | 'inferred' | 'distilled';

export interface PreferenceValue<T = string> {
  value: T;
  source: PreferenceSource;
  updatedAt: number;
  confidence?: number;
}

export interface UserIdentity {
  displayName?: string;
  nickname?: string;
  timezone?: string;
  locale?: string;
}

export interface UserPreferences {
  replyLanguage?: PreferenceValue<string>;
  replyStyle?: PreferenceValue<'concise' | 'detailed' | 'bullet' | 'stepwise'>;
  tone?: PreferenceValue<'formal' | 'casual' | 'cute' | 'strict'>;
  ttsVoiceId?: PreferenceValue<string>;
  autoAcceptTools?: string[];
  privacy?: {
    allowScreenCapture?: boolean;
    allowClipboardRead?: boolean;
    allowFileWrite?: boolean;
  };
}

export interface UserHabits {
  activeHours?: number[];
  avgSessionLen?: number;
  stopGenerationRate?: number;
  regenRate?: number;
  updatedAt?: number;
}

export interface UserProfile {
  version: number;
  identity: UserIdentity;
  preferences: UserPreferences;
  habits: UserHabits;
  dislikes: string[];
  createdAt: number;
  updatedAt: number;
}

export const CURRENT_USER_PROFILE_VERSION = 1;

export function makeDefaultUserProfile(now: number): UserProfile {
  return {
    version: CURRENT_USER_PROFILE_VERSION,
    identity: {},
    preferences: {},
    habits: {},
    dislikes: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function mapLanguage(lang: LegacyChatSetting['language']): string | undefined {
  if (lang === 'zh-CN') return 'zh-CN';
  if (lang === 'en-US') return 'en-US';
  return undefined;
}

export interface MigrateProfileOptions {
  /** 用于 createdAt/updatedAt 与 PreferenceValue.updatedAt；默认 Date.now() */
  now?: number;
  /** 合并旧 profile；缺失字段用旧值补齐 */
  base?: UserProfile;
}

/**
 * 将旧 AppConfig.chat（+ 可能的 ttsVoiceId）转换为 UserProfile 初始快照。
 *
 * 规则：
 * - `language` → preferences.replyLanguage（source: 'user'）
 * - `ttsVoiceId` → preferences.ttsVoiceId（source: 'user'）
 * - `theme` / `fontSize` 不落进 UserProfile（是 UI 偏好，走 renderer 本地存储），
 *   但我们把它们保留在 identity.locale? 之外，避免丢信息 —— 具体做法：
 *   仅当 legacy locale 存在时把 language 也写到 identity.locale，兼顾"母语"这个语义。
 */
export function migrateLegacyUserProfile(
  config: LegacyAppConfig,
  opts: MigrateProfileOptions = {},
): UserProfile {
  const now = opts.now ?? Date.now();
  const base = opts.base ?? makeDefaultUserProfile(now);
  const chat = config.chat ?? {};

  const identity: UserIdentity = { ...base.identity };
  const preferences: UserPreferences = {
    ...base.preferences,
    privacy: base.preferences.privacy ? { ...base.preferences.privacy } : undefined,
    autoAcceptTools: base.preferences.autoAcceptTools
      ? [...base.preferences.autoAcceptTools]
      : undefined,
  };

  const language = mapLanguage(chat.language);
  if (language) {
    preferences.replyLanguage = { value: language, source: 'user', updatedAt: now };
    if (!identity.locale) identity.locale = language;
  }

  if (isNonEmptyString(chat.ttsVoiceId)) {
    preferences.ttsVoiceId = { value: chat.ttsVoiceId, source: 'user', updatedAt: now };
  }

  return {
    ...base,
    identity,
    preferences,
    createdAt: base.createdAt || now,
    updatedAt: now,
  };
}
