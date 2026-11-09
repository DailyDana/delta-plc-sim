import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v2 arayüzü: kök web/ (index.html), kaynak src/ui + src/core. Çıktı dist/ (Cloudflare önizleme).
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1200 },
  server: { port: 5173, fs: { allow: ['..'] } },
  preview: { port: 4173 },
});
