import { defineConfig } from '@playwright/test';

// Browser tests against the production build, on a landscape phone viewport.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.e2e.ts',
  // The update test rewrites dist/sw.js, so tests run one at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 851, height: 393 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
  },
});
