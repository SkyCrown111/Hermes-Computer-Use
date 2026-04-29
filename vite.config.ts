import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-markdown': ['react-markdown', 'rehype-highlight', 'remark-gfm'],
          'vendor-virtual': ['@tanstack/react-virtual'],
          'vendor-utils': ['jszip', 'zustand'],
        },
      },
    },
  },
});
