import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // One retry absorbs transient browser crashes (container memory pressure);
  // real assertion failures fail twice and stay red.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  // Boots the full single-process app (API + built SPA + in-memory DB).
  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
