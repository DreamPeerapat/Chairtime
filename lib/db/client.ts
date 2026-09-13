import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';
import * as schema from './schema';

/**
 * Read .env.local here rather than leaving it to each entry point.
 *
 * ESM hoists every import above the first statement, so a script that calls
 * loadEnv() before importing this module still gets the throw below first —
 * the CLI scripts run by tsx (`db:seed`, `lib/line/connect.ts`) only worked
 * when the shell happened to export DATABASE_URL already.
 *
 * loadEnv never overwrites a variable that is already set, so Next.js, Vercel
 * and CI keep supplying their own values exactly as before; on a machine with
 * no .env.local it does nothing at all.
 */
loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

/**
 * A single postgres.js pool for the process.
 * Next.js hot-reloads modules in dev, so cache the pool on globalThis to avoid
 * leaking a new pool on every reload.
 */
const globalForDb = globalThis as unknown as { __chairtimeSql?: postgres.Sql };

export const sqlClient =
  globalForDb.__chairtimeSql ??
  postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Business time arithmetic is done with Luxon on `timestamptz` values;
    // the session timezone only affects how postgres.js parses bare timestamps.
    types: {},
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__chairtimeSql = sqlClient;
}

export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });

export type Db = typeof db;
export { schema };
