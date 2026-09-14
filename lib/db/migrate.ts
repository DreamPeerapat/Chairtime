/**
 * Apply pending migrations from drizzle/.
 * Runs as the owner role (DATABASE_URL_ADMIN), not the app role.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';
import { findSqlState } from '@/lib/booking/errors';

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

  // Never print credentials, but do say which role is about to run: pointing
  // this at the app role instead of the owner is the mistake below.
  const user = safeUser(url);
  console.log(`migrating as "${user}" (grants -> role "${appRole ?? 'chairtime'}")`);

  await runMigrations(url, appRole);
  console.log('migrations applied');
}

function safeUser(url: string): string {
  try {
    return new URL(url).username || '?';
  } catch {
    return '?';
  }
}

/**
 * Turn the two failures that actually happen into instructions.
 *
 * Both have been hit here already, and postgres's own wording names neither
 * cause: "permission denied for schema public" does not mention that the URL
 * is the application's role rather than the owner's.
 */
function explain(error: unknown): string | null {
  // Drizzle wraps driver errors, so the SQLSTATE sits on `cause`, not on the
  // error itself — the same walk lib/booking/errors.ts already does.
  const code = findSqlState(error);
  const message = (error as { message?: string }).message ?? '';

  if (code === '42501') {
    return [
      'DATABASE_URL_ADMIN ชี้ไปที่ role ที่ไม่มีสิทธิ์สร้างตาราง',
      'migration ต้องรันด้วย role เจ้าของฐานข้อมูล ไม่ใช่ role ที่แอปใช้',
      '',
      'Neon: Console > Connection Details > เลือก role "neondb_owner"',
      '      และเอาเครื่องหมายถูกออกจาก "Pooled connection" (migration ใช้ direct)',
      '',
      '  APP_DB_ROLE=<role ที่แอปใช้> DATABASE_URL_ADMIN="<direct URL ของ owner>" pnpm db:migrate',
    ].join('\n');
  }

  if (code === '28P01') return 'รหัสผ่านใน DATABASE_URL_ADMIN ไม่ถูกต้อง';
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
    return 'ต่อฐานข้อมูลไม่ได้ — ตรวจ host ใน DATABASE_URL_ADMIN';
  }
  return null;
}

const invokedDirectly = process.argv[1]?.endsWith('migrate.ts');
if (invokedDirectly) {
  main().catch((err) => {
    const hint = explain(err);
    if (hint) {
      console.error(`\n${hint}\n`);
      console.error(`(${(err as Error).message})`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
