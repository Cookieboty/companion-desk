import { createVitest } from '../../vitest.base.ts';

export default createVitest({
  environment: 'happy-dom',
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
});
