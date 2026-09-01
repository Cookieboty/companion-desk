import { defineConfig, type Options } from 'tsup';

export type TsupPreset = 'node-lib' | 'react-lib' | 'node-cli';

export interface CreateTsupOptions extends Options {
  preset?: TsupPreset;
}

export function createTsup(overrides: CreateTsupOptions = {}) {
  const { preset = 'node-lib', ...rest } = overrides;

  const base: Options = {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    treeshake: true,
    minify: false,
  };

  const presets: Record<TsupPreset, Partial<Options>> = {
    'node-lib': { platform: 'node' },
    'react-lib': {
      platform: 'browser',
      external: ['react', 'react-dom'],
      format: ['esm'],
    },
    'node-cli': {
      platform: 'node',
      format: ['esm'],
      banner: { js: '#!/usr/bin/env node' },
    },
  };

  return defineConfig({
    ...base,
    ...presets[preset],
    ...rest,
  });
}
