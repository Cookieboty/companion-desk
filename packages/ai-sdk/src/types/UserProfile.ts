/**
 * UserProfile —— 直接 re-export 自 [@ig-live/bundle-ig-base](file:///../../bundle-ig-base/src/types/UserProfile.ts)
 * 以避免类型漂移（P5 计划 §P5-2 明确要求）。
 */

export type {
  UserProfile,
  UserIdentity,
  UserPreferences,
  UserHabits,
  CodeStylePreference,
  PreferenceSource,
  PreferenceValue,
} from '@ig-live/bundle-ig-base';
