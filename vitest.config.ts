import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.ts';

loadEnv();

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integration tests never touch the development database.
          env: {
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
            DATABASE_URL_ADMIN: process.env.DATABASE_URL_TEST_ADMIN ?? '',
          },
          globalSetup: ['tests/integration/global-setup.ts'],
          // Integration tests share one database; running files in parallel
          // would let one file's truncate wipe another's fixtures.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
