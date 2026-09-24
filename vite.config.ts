import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'workbench-csp',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'self'",
            `script-src 'self' 'wasm-unsafe-eval'${command === 'serve' ? " 'unsafe-inline'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            `connect-src 'self' wb-pdf:${command === 'serve' ? ' ws://localhost:5174' : ''}`,
            "worker-src 'self' blob:",
            "frame-src 'self' http: https:",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; '),
        },
        injectTo: 'head-prepend',
      }];
    },
  }],
  server: {
    port: 5174,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  clearScreen: false,
}));
