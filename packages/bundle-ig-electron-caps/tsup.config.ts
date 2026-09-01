import { createTsup } from '../../tsup.base';

export default createTsup({
  preset: 'node-lib',
  entry: ['src/index.ts', 'src/seams/index.ts'],
  external: [
    '@deepseek-ai/dsh',
    '@ig-live/bundle-ig-base',
    'electron',
    '@picovoice/porcupine-node',
    'nodejs-whisper',
  ],
});
