import { createTsup } from '../../tsup.base';

export default createTsup({
  preset: 'node-lib',
  entry: ['src/index.ts'],
  external: [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-app-boot',
    '@ig-live/ai-sdk',
    '@ig-live/bundle-ig-base',
    '@ig-live/bundle-ig-electron-caps',
    'electron',
  ],
});
