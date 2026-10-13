import { defineConfig } from '@playwright/test';

// e2e 断言使用中文原文：固定界面语言（各用例启动 Electron 时透传 process.env）
process.env.CD_LOCALE ||= 'zh-CN';
// 首次启动引导默认不弹出（引导自己的用例里显式开启）
process.env.CD_ONBOARDING ||= 'off';
// 应用只内置 2D Nomi；3D 用例改用「用户导入」的测试夹具（CC0，仅位于 e2e-headed/fixtures，不随应用打包）。
// CD_SEED_USER_VRM 让主进程在未打包运行时按正常导入流程把它导入为固定 id 的用户模型。
process.env.CD_SEED_USER_VRM ||= `${process.cwd()}/e2e-headed/fixtures/models/test-avatar-cc0.vrm`;
process.env.CD_DEFAULT_MODEL ||= 'user-e2e-avatar-000000';

export default defineConfig({
  testDir: './e2e-headed/tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
});
