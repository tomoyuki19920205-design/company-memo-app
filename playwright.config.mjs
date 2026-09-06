import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/mobile', testMatch: '**/*.spec.mjs', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  webServer: { command: 'node tests/mobile/server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
