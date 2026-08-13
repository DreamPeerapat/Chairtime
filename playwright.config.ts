import { defineConfig } from '@playwright/test';
import { loadEnv } from './lib/env.ts';

loadEnv();

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Some environments ship a Chromium build that does not match this
    // Playwright version's expected revision. PLAYWRIGHT_CHROMIUM_PATH points
    // at the one that is actually installed; CI runs `playwright install` and
    // leaves it unset.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    // The e2e run books against the seeded development database.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
