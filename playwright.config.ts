import { defineConfig } from '@playwright/test';

// e2e 断言使用中文原文：固定界面语言（各用例启动 Electron 时透传 process.env）
process.env.CD_LOCALE ||= 'zh-CN';

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
