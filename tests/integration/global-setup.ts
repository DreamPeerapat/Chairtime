import { loadEnv } from '@/lib/env';
import { runMigrations } from '@/lib/db/migrate';

/**
 * Bring the test database up to the current schema once per run. The tests
 * themselves clear and rebuild the tenants they need.
 */
export default async function setup() {
  loadEnv();
  const url = process.env.DATABASE_URL_TEST_ADMIN;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST_ADMIN is not set — copy .env.example to .env.local and run `pnpm tsx lib/db/bootstrap.ts`',
    );
  }
  await runMigrations(url);
}
