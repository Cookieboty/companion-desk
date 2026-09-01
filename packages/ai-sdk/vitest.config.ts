import { createVitest } from '../../vitest.base';

export default createVitest({
  environment: 'node',
  include: ['tests/**/*.{test,spec}.ts'],
});
