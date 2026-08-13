/**
 * One-off cluster bootstrap: create the application role and the databases.
 *
 * Run as a superuser. In production you would do this by hand with a real
 * password; this script exists so a fresh checkout is usable in one command.
 *
 *   pnpm tsx lib/db/bootstrap.ts
 */
import postgres from 'postgres';

const superUrl = process.env.DATABASE_SUPERUSER_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
const appRole = process.env.APP_DB_ROLE ?? 'chairtime';
const appPassword = process.env.APP_DB_PASSWORD ?? 'chairtime';
const databases = (process.env.APP_DB_NAMES ?? 'chairtime,chairtime_test').split(',');

async function main() {
  const admin = postgres(superUrl, { max: 1, onnotice: () => {} });
  try {
    const [existing] = await admin`SELECT 1 FROM pg_roles WHERE rolname = ${appRole}`;
    if (existing) {
      await admin.unsafe(`ALTER ROLE "${appRole}" WITH LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS`);
      console.log(`role ${appRole}: updated`);
    } else {
      await admin.unsafe(`CREATE ROLE "${appRole}" WITH LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS`);
      console.log(`role ${appRole}: created`);
    }

    for (const raw of databases) {
      const name = raw.trim();
      if (!name) continue;
      const [db] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
      if (!db) {
        await admin.unsafe(`CREATE DATABASE "${name}"`);
        console.log(`database ${name}: created`);
      } else {
        console.log(`database ${name}: exists`);
      }
      await admin.unsafe(`GRANT ALL ON DATABASE "${name}" TO "${appRole}"`);
    }
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
