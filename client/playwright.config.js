import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  workers: 1,
  reporter: 'list',
  use: { browserName: 'chromium', channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, trace: 'off' },
});
