import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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
