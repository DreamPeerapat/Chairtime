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
  use: { baseURL, trace: 'on-first-retry' },
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
