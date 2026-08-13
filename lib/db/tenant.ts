/**
 * Tenant-scoped data access.
 *
 * Iron rule #3: every query that touches shop data must run inside
 * `withTenant()`. The helper opens a transaction and sets `app.tenant_id`,
 * which is what the row-level-security policies read. Nothing else in the app
 * is allowed to reach for `db` directly for tenant data.
 */
import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { db, schema } from './client';

export type TenantTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a transaction scoped to one tenant.
 *
 * The tenant id is validated as a UUID before interpolation because
 * `SET LOCAL` does not accept bind parameters — it has to be inlined.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options: { database?: typeof db } = {},
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`withTenant: invalid tenant id ${JSON.stringify(tenantId)}`);
  }
  const database = options.database ?? db;
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));
    return fn(tx as TenantTx);
  });
}

/**
 * Run `fn` once per active tenant. Cron jobs (point expiry, tier recalc,
 * reconciliation) use this instead of a cross-tenant query, so no code path
 * ever needs to bypass RLS.
 */
export async function forEachTenant<T>(
  fn: (tenantId: string, tx: TenantTx) => Promise<T>,
  options: { includeSuspended?: boolean } = {},
): Promise<Array<{ tenantId: string; result: T }>> {
  const rows = await db
    .select({ id: schema.tenant.id, status: schema.tenant.status })
    .from(schema.tenant);
  const out: Array<{ tenantId: string; result: T }> = [];
  for (const row of rows) {
    if (!options.includeSuspended && row.status !== 'active') continue;
    const result = await withTenant(row.id, (tx) => fn(row.id, tx));
    out.push({ tenantId: row.id, result });
  }
  return out;
}
