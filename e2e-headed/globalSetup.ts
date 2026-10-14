import { ensureTestAvatar, TEST_AVATAR_CACHE } from './fixtures/testAvatar';

/** 3D 用例使用「用户导入」的测试模型：未显式指定时下载（带缓存）CC0 夹具。 */
export default async function globalSetup(): Promise<void> {
  if (process.env.CD_SEED_USER_VRM && process.env.CD_SEED_USER_VRM !== TEST_AVATAR_CACHE) return;
  process.env.CD_SEED_USER_VRM = await ensureTestAvatar();
}
