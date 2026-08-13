/**
 * Preflight check for a Postgres connection.
 *
 * Chairtime leans on things not every managed Postgres exposes — `btree_gist`
 * for the anti-double-booking constraint above all. Finding that out during a
 * migration on a Friday evening is not the plan, so run this against a
 * candidate database first:
 *
 *   pnpm db:check                          # checks DATABASE_URL_ADMIN
 *   pnpm db:check "postgres://..."         # checks a specific URL
 *
 * Exits non-zero if anything required is missing.
 */
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';

loadEnv();

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

const MIN_MAJOR_VERSION = 14;

export async function runChecks(url: string): Promise<CheckResult[]> {
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  const results: CheckResult[] = [];

  try {
    const [version] = await sql<{ v: string; num: string }[]>`
      SELECT version() AS v, current_setting('server_version_num') AS num
    `;
    const major = Math.floor(Number(version?.num ?? 0) / 10000);
    results.push({
      name: `PostgreSQL ${MIN_MAJOR_VERSION}+`,
      ok: major >= MIN_MAJOR_VERSION,
      detail: major > 0 ? `พบเวอร์ชัน ${major}` : 'อ่านเวอร์ชันไม่ได้',
      required: true,
    });

    // The two extensions docs/schema.sql opens with.
    for (const extension of ['pgcrypto', 'btree_gist']) {
      const [available] = await sql<{ installed: boolean; offered: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = ${extension}) AS installed,
               EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = ${extension}) AS offered
      `;
      const installed = available?.installed ?? false;
      const offered = available?.offered ?? false;
      results.push({
        name: `extension ${extension}`,
        ok: installed || offered,
        detail: installed
          ? 'ติดตั้งแล้ว'
          : offered
            ? 'เซิร์ฟเวอร์มีให้ แต่ยังไม่ได้ยืนยันว่า role นี้สร้างได้ — ดูผลข้อสุดท้าย'
            : 'ผู้ให้บริการนี้ไม่มีให้ — ใช้กับ Chairtime ไม่ได้',
        required: true,
      });
    }

    const canCreate = await sql`
      SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS ok
    `.then((rows) => Boolean(rows[0]?.ok));
    results.push({
      name: 'สิทธิ์สร้างตาราง (CREATE)',
      ok: canCreate,
      detail: canCreate ? 'มีสิทธิ์' : 'ไม่มีสิทธิ์ — migration จะรันไม่ได้',
      required: true,
    });

    // Row-level security is bypassed by superusers, so a connection that is one
    // will silently defeat tenant isolation.
    const [role] = await sql<{ is_super: boolean; can_bypass: boolean; name: string }[]>`
      SELECT rolsuper AS is_super, rolbypassrls AS can_bypass, rolname AS name
        FROM pg_roles WHERE rolname = current_user
    `;
    results.push({
      name: 'role สำหรับ migration',
      ok: true,
      detail: `${role?.name ?? '?'}${role?.is_super ? ' (superuser — ใช้ได้สำหรับ migration เท่านั้น)' : ''}`,
      required: false,
    });

    // The verdict. Everything above is circumstantial: only building a real
    // EXCLUDE constraint and watching it reject an overlap proves that iron
    // rule #1 can be enforced on this database.
    let exclusionWorks = false;
    let exclusionDetail = '';
    try {
      await sql.unsafe(`
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        CREATE TEMP TABLE chairtime_preflight (
          resource_id uuid NOT NULL,
          period tstzrange NOT NULL,
          is_released boolean NOT NULL DEFAULT false,
          EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (is_released = false)
        );
      `);
      const id = '11111111-1111-4111-8111-111111111111';
      await sql.unsafe(`
        INSERT INTO chairtime_preflight (resource_id, period)
        VALUES ('${id}', tstzrange(now(), now() + interval '1 hour'));
      `);
      try {
        await sql.unsafe(`
          INSERT INTO chairtime_preflight (resource_id, period)
          VALUES ('${id}', tstzrange(now() + interval '30 minutes', now() + interval '90 minutes'));
        `);
        exclusionDetail = 'สร้าง constraint ได้ แต่ไม่กันการจองซ้อน — ผิดปกติมาก';
      } catch (error) {
        const code = (error as { code?: string }).code;
        exclusionWorks = code === '23P01';
        exclusionDetail = exclusionWorks
          ? 'กันจองซ้อนได้จริง (ปฏิเสธด้วย error 23P01)'
          : `ปฏิเสธด้วย error ${code} แทนที่จะเป็น 23P01`;
      }
      await sql.unsafe('DROP TABLE IF EXISTS chairtime_preflight;');
    } catch (error) {
      exclusionDetail = `สร้าง EXCLUDE constraint ไม่ได้: ${(error as Error).message}`;
    }

    results.push({
      name: 'EXCLUDE USING gist (กฎเหล็กข้อ 1)',
      ok: exclusionWorks,
      detail: exclusionDetail,
      required: true,
    });
  } finally {
    await sql.end();
  }

  return results;
}

async function main() {
  const url = process.argv[2] ?? process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('ต้องระบุ connection string หรือตั้ง DATABASE_URL_ADMIN');
    process.exit(1);
  }

  // Never print credentials.
  const safe = url.replace(/\/\/[^@]*@/, '//***@');
  console.log(`ตรวจสอบ ${safe}\n`);

  let results: CheckResult[];
  try {
    results = await runChecks(url);
  } catch (error) {
    console.error(`เชื่อมต่อไม่ได้: ${(error as Error).message}`);
    process.exit(1);
  }

  for (const result of results) {
    const mark = result.ok ? '✔' : result.required ? '✘' : '•';
    console.log(`${mark} ${result.name}\n    ${result.detail}`);
  }

  const failures = results.filter((r) => r.required && !r.ok);
  console.log('');
  if (failures.length === 0) {
    console.log('ใช้กับ Chairtime ได้ครับ');
  } else {
    console.log(`ใช้ไม่ได้ — ติด ${failures.length} ข้อ: ${failures.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('doctor.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
