import { defineConfig, type UserConfig } from 'vitest/config';

export type VitestEnv = 'node' | 'jsdom' | 'happy-dom';

export interface CreateVitestOptions {
  environment?: VitestEnv;
  setupFiles?: string[];
  include?: string[];
  overrides?: UserConfig;
}

export function createVitest({
  environment = 'node',
  setupFiles = [],
  include = ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  overrides = {},
}: CreateVitestOptions = {}) {
  return defineConfig({
    test: {
      environment,
      setupFiles,
      include,
      globals: false,
      passWithNoTests: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/**/*.{test,spec}.{ts,tsx}',
          'src/**/__mocks__/**',
        ],
      },
      ...(overrides.test ?? {}),
    },
    ...overrides,
  });
}
