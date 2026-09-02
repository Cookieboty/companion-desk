import { describe, expect, it } from 'vitest';

import {
  CURRENT_USER_PROFILE_VERSION,
  makeDefaultUserProfile,
  migrateLegacyUserProfile,
} from '../lib/migrate/userProfile';

const now = 1_700_000_000_000;

describe('migrateLegacyUserProfile', () => {
  it('把 chat.language 与 ttsVoiceId 映射到 preferences 且带 source=user', () => {
    const profile = migrateLegacyUserProfile(
      { chat: { language: 'zh-CN', ttsVoiceId: 'zh-CN-XiaoxiaoNeural' } },
      { now },
    );
    expect(profile.version).toBe(CURRENT_USER_PROFILE_VERSION);
    expect(profile.preferences.replyLanguage).toEqual({
      value: 'zh-CN',
      source: 'user',
      updatedAt: now,
    });
    expect(profile.preferences.ttsVoiceId).toEqual({
      value: 'zh-CN-XiaoxiaoNeural',
      source: 'user',
      updatedAt: now,
    });
    expect(profile.identity.locale).toBe('zh-CN');
    expect(profile.createdAt).toBe(now);
    expect(profile.updatedAt).toBe(now);
  });

  it('未知 language 与空 ttsVoiceId 时不落 preferences', () => {
    const profile = migrateLegacyUserProfile(
      // @ts-expect-error 故意不合法
      { chat: { language: 'jp-JP', ttsVoiceId: '' } },
      { now },
    );
    expect(profile.preferences.replyLanguage).toBeUndefined();
    expect(profile.preferences.ttsVoiceId).toBeUndefined();
    expect(profile.identity.locale).toBeUndefined();
  });

  it('传入 base 时应保留旧字段并只更新 updatedAt', () => {
    const base = makeDefaultUserProfile(now - 10_000);
    base.identity.displayName = 'Alice';
    base.identity.locale = 'en-US';
    base.dislikes = ['spam'];

    const profile = migrateLegacyUserProfile({ chat: { language: 'zh-CN' } }, { now, base });
    expect(profile.identity.displayName).toBe('Alice');
    // 已有 locale 不被覆盖
    expect(profile.identity.locale).toBe('en-US');
    expect(profile.dislikes).toEqual(['spam']);
    expect(profile.createdAt).toBe(now - 10_000);
    expect(profile.updatedAt).toBe(now);
    expect(profile.preferences.replyLanguage?.value).toBe('zh-CN');
  });

  it('缺 chat 时产出一个"仅时间戳变更"的默认 profile', () => {
    const profile = migrateLegacyUserProfile({}, { now });
    expect(profile).toEqual({
      version: CURRENT_USER_PROFILE_VERSION,
      identity: {},
      preferences: {},
      habits: {},
      dislikes: [],
      createdAt: now,
      updatedAt: now,
    });
  });
});
