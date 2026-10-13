import { createTsup } from '../../tsup.base';

export default createTsup({
  preset: 'node-lib',
  entry: ['src/index.ts'],
  external: [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-app-boot',
    '@nomi-ai/ai-sdk',
    '@nomi-ai/bundle-ig-base',
    '@nomi-ai/bundle-ig-electron-caps',
    'electron',
  ],
});
