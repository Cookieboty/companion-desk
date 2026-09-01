// @ts-check
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/*.min.js',
      'packages/renderer/public/**',
      'scripts/generate-model-list.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    plugins: { import: importPlugin },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // React / DOM 相关子包
  {
    files: [
      'packages/renderer/**/*.{ts,tsx}',
      'packages/ai-chat/**/*.{ts,tsx}',
      'packages/ai-sdk-client/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  // Renderer / 渲染进程禁止直接引 electron
  {
    files: [
      'packages/renderer/**/*.{ts,tsx}',
      'packages/ai-chat/**/*.{ts,tsx}',
      'packages/ai-sdk-client/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: '渲染进程禁止直接引入 electron，请通过 preload / IPC / ai-sdk-client。',
            },
          ],
        },
      ],
    },
  },

  // 测试文件放宽
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // 遗留 electron 主进程代码（P0 之前既存业务代码，待 P3 迁移时再逐个清理）
  {
    files: ['packages/electron/**/*.{ts,tsx,js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-case-declarations': 'warn',
      'no-async-promise-executor': 'warn',
      'no-control-regex': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-console': 'off',
    },
  },
);
