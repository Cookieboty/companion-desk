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
      mode === 'development' ? JSON.stringify(`http://${DEV_HOST}:${PORTS.renderer}`) : '"https://api.example.com"',
  },
  server: {
    host: DEV_HOST,
    port: PORTS.chat,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    rollupOptions: {
      input: 'index.html',
    },
  },
}));
