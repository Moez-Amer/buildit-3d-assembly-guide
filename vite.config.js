import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS so phones on the same Wi-Fi can use the live camera (browsers only allow it on https or localhost).
export default defineConfig({
  root: 'web',
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } }
  },
  build: { outDir: '../dist', emptyOutDir: true }
});
