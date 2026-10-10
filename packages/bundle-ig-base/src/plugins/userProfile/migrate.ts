import {
  CURRENT_USER_PROFILE_VERSION,
  makeDefaultUserProfile,
  type UserProfile,
} from '../../types/UserProfile';

/**
 * UserProfile 版本迁移。
 * v0 -> v1：附加 dislikes 空数组 & habits 空对象。
 * 未来新增字段时向上追加 case，禁止破坏历史字段。
 */
export function migrateUserProfile(raw: unknown): UserProfile {
  if (raw == null || typeof raw !== 'object') return makeDefaultUserProfile();
  const r = raw as Partial<UserProfile> & Record<string, unknown>;
  const version = typeof r.version === 'number' ? r.version : 0;

  let profile: UserProfile = {
    ...makeDefaultUserProfile(),
    ...r,
    version: CURRENT_USER_PROFILE_VERSION,
  };

  if (version < 1) {
    profile = {
      ...profile,
      dislikes: Array.isArray(r.dislikes) ? (r.dislikes as string[]) : [],
      habits: r.habits && typeof r.habits === 'object' ? (r.habits as UserProfile['habits']) : {},
    };
  }

  return profile;
}
