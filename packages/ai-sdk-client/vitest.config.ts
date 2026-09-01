import { createVitest } from '../../vitest.base';

export default createVitest({
  environment: 'happy-dom',
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
});
