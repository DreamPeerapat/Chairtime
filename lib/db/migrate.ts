/**
 * Apply pending migrations from drizzle/.
 * Runs as the owner role (DATABASE_URL_ADMIN), not the app role.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';

loadEnv();

/**
 * The migrations GRANT to whichever role this names (drizzle/0004 §7 and
 * friends), defaulting to `chairtime`. Managed providers hand out a role with
 * a name of their own choosing, and a grant aimed at a role that does not
 * exist is skipped in silence — the migration reports success and the app then
 * cannot read `auth_identity`, so the first login after deploy returns a 500.
 * Set APP_DB_ROLE to the role in DATABASE_URL whenever it is not `chairtime`.
 */
export async function runMigrations(url: string, appRole = process.env.APP_DB_ROLE) {
  // max: 1 so the SET below and the migrations share one session.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (appRole) await client`SELECT set_config('chairtime.app_role', ${appRole}, false)`;
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_ADMIN or DATABASE_URL must be set');
  const appRole = process.env.APP_DB_ROLE;
  await runMigrations(url, appRole);
  console.log(`migrations applied (grants -> role "${appRole ?? 'chairtime'}")`);
}

const invokedDirectly = process.argv[1]?.endsWith('migrate.ts');
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
