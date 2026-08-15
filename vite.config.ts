import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      base: mode === 'production' ? '/cinegen-personal-study/' : '/',
      server: {
        port: 3000,
        host: '127.0.0.1',
        proxy: {
          '/api': 'http://127.0.0.1:8787',
        },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
