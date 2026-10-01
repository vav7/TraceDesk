import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev/preview proxy target for /api requests. Override with VITE_DEV_API_TARGET
// if your backend runs somewhere other than localhost:3001.
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:3001';
const apiProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as any);
