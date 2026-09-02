import { createVitest } from './vitest.base';

export default createVitest({
  environment: 'node',
  include: ['e2e/tests/**/*.{test,spec}.{ts,mts}'],
  overrides: {
    test: {
      name: 'e2e-headless',
      dir: 'e2e',
      testTimeout: 15_000,
      coverage: {
        enabled: false,
      },
    },
  },
});
