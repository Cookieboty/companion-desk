import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { DEV_HOST, PORTS } from '../../scripts/ports.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 相对路径：生产环境由 Electron 通过 file:// 加载，绝对路径 /assets/* 会指向文件系统根目录
  base: './',
  define: {
    'process.env.MODE': JSON.stringify(mode),
    'process.env.ELECTRON_ENV': JSON.stringify(!!process.env.ELECTRON_ENV),
    'process.env.API_BASE_URL':
      mode === 'development'
        ? JSON.stringify(`http://${DEV_HOST}:${PORTS.renderer}`)
        : '"https://api.example.com"',
  },
  server: {
    host: DEV_HOST,
    port: PORTS.chat,
    strictPort: true,
    cors: true,
  },
  build: {
    // AudioWorklet 等 .js 资源不能内联成 data: URL（CSP 只允许 'self' 脚本）
    assetsInlineLimit: (file: string) => (file.endsWith('.js') ? false : undefined),
    outDir: 'dist',
    sourcemap: mode === 'development',
    rollupOptions: {
      input: 'index.html',
    },
  },
}));
