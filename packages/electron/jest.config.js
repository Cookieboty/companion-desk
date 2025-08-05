const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  // 基础配置
  preset: 'ts-jest',
  testEnvironment: 'node',

  // 源码目录
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // 测试文件匹配模式
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/src/**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],

  // TypeScript配置
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // 模块路径映射
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths || {}, {
      prefix: '<rootDir>/'
    }),
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // 覆盖率配置
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/main-new.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // 测试设置
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'js', 'json'],

  // 清除模拟
  clearMocks: true,
  restoreMocks: true,

  // 测试超时
  testTimeout: 10000,

  // 详细输出
  verbose: true,

  // Electron特定配置
  testEnvironmentOptions: {
    // 模拟Electron环境
    url: 'file://test'
  },

  // 忽略模式
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],

  // 全局变量
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs'
        }
      }
    }
  }
};