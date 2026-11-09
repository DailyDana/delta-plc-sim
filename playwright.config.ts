import { defineConfig } from '@playwright/test';

// Uçtan uca testler: derlenmiş uygulama (vite preview) + Edge (headless). npm run e2e
export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/', channel: 'msedge', headless: true, viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 60000 },
});
