import { defineConfig } from 'rollup';
import terser from '@rollup/plugin-terser';
import alias from '@rollup/plugin-alias';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  input: {
    main: 'dist/main.js',
    preload: 'dist/preload.js',
    renderer: 'dist/renderer.js'
  },
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true
  },
  external: [
    'electron',
    'fs',
    'path',
    'url'
  ],
  plugins: [
    alias({
      entries: [
        { find: '@', replacement: path.resolve(__dirname, 'src') }
      ]
    }),
    terser()
  ]
}); 