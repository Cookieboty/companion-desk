import { createTsup } from '../../tsup.base';

export default createTsup({
  preset: 'node-lib',
  entry: ['src/index.ts', 'src/types/index.ts', 'src/config/index.ts'],
  external: [
    '@deepseek-ai/dsh',
    '@ig-live/bundle-ig-base',
    '@ig-live/bundle-ig-live2d',
    '@ig-live/bundle-ig-electron-caps',
  ],
});
