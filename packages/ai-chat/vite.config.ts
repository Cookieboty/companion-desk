import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'process.env.MODE': JSON.stringify(mode),
    'process.env.ELECTRON_ENV': JSON.stringify(!!process.env.ELECTRON_ENV),
    'process.env.API_BASE_URL': mode === 'development'
      ? '"http://localhost:3000"'
      : '"https://api.example.com"',
  },
  server: {
    port: 5175,
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