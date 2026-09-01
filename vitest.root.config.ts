import { createVitest } from './vitest.base';

export default createVitest({
  environment: 'node',
  include: ['scripts/__tests__/**/*.{test,spec}.{ts,mts}'],
  overrides: {
    test: {
      name: 'dsh-smoke',
      coverage: {
        enabled: false,
      },
    },
  },
});
