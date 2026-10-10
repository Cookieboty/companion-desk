import { test, expect } from '../fixtures/electronApp';

/**
 * E4 · waifu profile · profile write-read headed 复刻
 *
 * 语义对齐 e2e/tests/E4.waifu-profile-write-read.test.ts：
 * - renderer 调 window.aiIPC.invoke('ai:userProfile:set', patch) 更新 nickname；
 * - 主进程 UserProfileService 落盘 + 触发 userProfile/changed dsh 事件；
 * - EventBroadcaster 广播 `ai:event { evt:'userProfile:changed' }` 给全部窗口；
 * - renderer 通过 window.aiIPC.invoke('ai:userProfile:get') 拉到最新值。
 */
test.describe('E4 · waifu · userProfile:set → 广播 + get 一致', () => {
  test('nickname 修改后 renderer 收到 userProfile:changed 广播且 get 返回新值', async ({
    launchHeaded,
  }) => {
    const { page } = await launchHeaded({ profile: 'waifu' });
    expect(page).not.toBeNull();
    await page!.waitForFunction(() => typeof (window as any).aiIPC !== 'undefined');
    await page!.evaluate(() => (window as any).__e2eProbe.clear());

    const NEW_NICK = 'HeadedNick_' + Date.now();

    await page!.evaluate(async (nick) => {
      await (window as any).aiIPC.invoke('ai:userProfile:set', {
        patch: { identity: { nickname: nick } },
      });
    }, NEW_NICK);

    // 等待广播落到 renderer buffer
    await expect
      .poll(() => page!.evaluate(() => (window as any).__e2eProbe.getProfileChanged().length))
      .toBeGreaterThanOrEqual(1);

    const changes = await page!.evaluate(
      () => (window as any).__e2eProbe.getProfileChanged() as any[],
    );
    const nicknameInEvent = changes[changes.length - 1]?.profile?.identity?.nickname;
    expect(nicknameInEvent).toBe(NEW_NICK);

    // 再拉一次确认落盘
    const readBack = await page!.evaluate(async () => {
      const profile = (await (window as any).aiIPC.invoke('ai:userProfile:get')) as {
        identity?: { nickname?: string };
      };
      return profile?.identity?.nickname;
    });
    expect(readBack).toBe(NEW_NICK);
  });
});
