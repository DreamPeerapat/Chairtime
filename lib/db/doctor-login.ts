/**
 * Preflight for the login path, run as the APP role.
 *
 * `db:check` answers "can this database host Chairtime at all" and connects as
 * the owner. This one answers a narrower question that the owner connection
 * cannot: does the role in `DATABASE_URL` actually reach everything
 * `/auth/callback/{provider}` touches. The two failures it separates look
 * identical from the browser (a failed login) but need opposite fixes:
 *
 *   - table/function missing   -> `pnpm db:migrate` was never run here
 *   - present but no privilege -> the grants in drizzle/0004 §7 skipped this
 *     role, because that DO block only grants to the role named by
 *     `chairtime.app_role` (default `chairtime`) and a managed provider's
 *     role is usually called something else
 *
 *   pnpm db:check-login                    # checks DATABASE_URL
 *   pnpm db:check-login "postgres://..."   # checks a specific URL
 *
 * Reads catalogs only — it writes nothing and creates nothing.
 */
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';

loadEnv();

interface LoginCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Every table the callback reads or writes, with the privileges it needs. */
const TABLES: { table: string; privileges: string[] }[] = [
  { table: 'auth_identity', privileges: ['SELECT', 'INSERT'] },
  { table: 'staff_user', privileges: ['SELECT', 'INSERT'] },
  { table: 'staff_auth_identity', privileges: ['SELECT', 'INSERT'] },
  { table: 'staff_tenant', privileges: ['SELECT'] },
  { table: 'tenant', privileges: ['SELECT'] },
  { table: 'subscription_plan', privileges: ['SELECT'] },
  { table: 'business_type_template', privileges: ['SELECT'] },
];

/** The one SECURITY DEFINER read the callback makes before a tenant is known. */
const LOOKUP_FUNCTION = 'staff_tenant_lookup(uuid)';

export async function runLoginChecks(url: string): Promise<LoginCheck[]> {
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  const checks: LoginCheck[] = [];

  try {
    const [role] = await sql<{ name: string; is_super: boolean; can_bypass: boolean }[]>`
      SELECT rolname AS name, rolsuper AS is_super, rolbypassrls AS can_bypass
        FROM pg_roles WHERE rolname = current_user
    `;
    const bypassesRls = Boolean(role?.is_super || role?.can_bypass);
    checks.push({
      name: 'role ที่แอปใช้',
      ok: !bypassesRls,
      detail: bypassesRls
        ? `${role?.name ?? '?'} ข้าม RLS ได้ — ข้อมูลรั่วข้ามร้าน ห้ามใช้เป็น DATABASE_URL`
        : `${role?.name ?? '?'}`,
    });

    // Existence is asked first and separately every time: `has_*_privilege`
    // raises "relation/function does not exist" rather than returning false,
    // so folding the two into one query would turn the un-migrated case — the
    // one most worth reporting clearly — into a crash.
    for (const { table, privileges } of TABLES) {
      const name = `ตาราง ${table} (${privileges.join(', ')})`;
      const qualified = `public.${table}`;

      const exists = await sql<{ ok: boolean }[]>`
        SELECT to_regclass(${qualified}::text) IS NOT NULL AS ok
      `.then((rows) => Boolean(rows[0]?.ok));
      if (!exists) {
        checks.push({
          name,
          ok: false,
          detail: 'ไม่มีตารางนี้ — ยังไม่ได้รัน pnpm db:migrate กับฐานข้อมูลนี้',
        });
        continue;
      }

      const granted = await sql<{ ok: boolean }[]>`
        SELECT bool_and(has_table_privilege(current_user, ${qualified}::text, p)) AS ok
          FROM unnest(${privileges}::text[]) AS p
      `.then((rows) => Boolean(rows[0]?.ok));
      checks.push({
        name,
        ok: granted,
        detail: granted
          ? 'เข้าถึงได้'
          : 'มีตารางแต่ role นี้ไม่มีสิทธิ์ — ต้อง GRANT ให้ role ที่แอปใช้',
      });
    }

    const fnExists = await sql<{ ok: boolean }[]>`
      SELECT to_regprocedure(${LOOKUP_FUNCTION}::text) IS NOT NULL AS ok
    `.then((rows) => Boolean(rows[0]?.ok));
    if (!fnExists) {
      checks.push({
        name: `ฟังก์ชัน ${LOOKUP_FUNCTION}`,
        ok: false,
        detail: 'ไม่มีฟังก์ชันนี้ — ยังไม่ได้รัน drizzle/0004',
      });
    } else {
      const canExecute = await sql<{ ok: boolean }[]>`
        SELECT has_function_privilege(current_user, ${LOOKUP_FUNCTION}::text, 'EXECUTE') AS ok
      `.then((rows) => Boolean(rows[0]?.ok));
      checks.push({
        name: `ฟังก์ชัน ${LOOKUP_FUNCTION}`,
        ok: canExecute,
        detail: canExecute
          ? 'เรียกใช้ได้'
          : 'มีฟังก์ชันแต่ role นี้ไม่มีสิทธิ์ EXECUTE — ล็อกอินแล้วจะพังตรงนี้',
      });
    }
  } finally {
    await sql.end();
  }

  return checks;
}

/** Environment variables the callback needs beyond the database. */
function envChecks(): LoginCheck[] {
  const required: { key: string; why: string }[] = [
    { key: 'SESSION_SECRET', why: 'ใช้เซ็น cookie session — ไม่มีแล้วล็อกอินสำเร็จก็ออก 500' },
    { key: 'NEXT_PUBLIC_APP_URL', why: 'ใช้ประกอบ redirect_uri ต้องตรงกับที่ลงทะเบียนไว้กับ LINE/Google' },
  ];

  return required.map(({ key, why }) => ({
    name: key,
    ok: Boolean(process.env[key]),
    detail: process.env[key] ? 'ตั้งแล้ว' : `ยังไม่ได้ตั้ง — ${why}`,
  }));
}

async function main() {
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('ต้องระบุ connection string หรือตั้ง DATABASE_URL');
    process.exit(1);
  }

  // Never print credentials.
  console.log(`ตรวจเส้นทางล็อกอินบน ${url.replace(/\/\/[^@]*@/, '//***@')}\n`);

  let checks: LoginCheck[];
  try {
    checks = await runLoginChecks(url);
  } catch (error) {
    console.error(`เชื่อมต่อไม่ได้: ${(error as Error).message}`);
    process.exit(1);
  }

  checks.push(...envChecks());

  for (const check of checks) {
    console.log(`${check.ok ? '✔' : '✘'} ${check.name}\n    ${check.detail}`);
  }

  const failures = checks.filter((c) => !c.ok);
  console.log('');
  if (failures.length === 0) {
    console.log('เส้นทางล็อกอินพร้อมใช้งาน');
  } else {
    console.log(`ล็อกอินจะพัง — ติด ${failures.length} ข้อ: ${failures.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('doctor-login.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
