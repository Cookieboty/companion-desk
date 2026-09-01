import { createVitest } from '../../vitest.base';

export default createVitest({
  environment: 'node',
  include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
});
