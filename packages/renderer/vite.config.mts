import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  // 插件配置
  plugins: [react()],

  // 基础公共路径
  base: './',

  // 开发服务器配置
  server: {
    port: 3000,
    open: false,
  },

  // 构建配置
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    minify: 'terser',
    rollupOptions: {
      output: {
        // 稳定的 vendor 拆分：react 常驻；three/VRM 仅 3D 模式懒加载时请求
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](three|@pixiv|@react-three|three-stdlib|troika-[^\\/]+|maath|camera-controls)[\\/]/.test(id)) return 'vendor-three';
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },

  // CSS配置
  css: {
    modules: {
      // CSS Modules配置
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  },

  // 解析配置
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  }
}); 