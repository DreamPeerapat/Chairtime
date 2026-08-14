/**
 * docs/logic.md ข้อ 4 — must run daily: `customer.point_balance`,
 * `SUM(point_lot.points_remaining)` and `SUM(point_ledger.points)` are
 * required to agree for every customer at all times. A mismatch means a bug
 * upstream, not a normal state, and needs to surface before a customer
 * notices their balance is wrong.
 */
import { sql } from 'drizzle-orm';
import type { TenantTx } from '@/lib/db/tenant';

export interface ReconcileMismatch {
  customerId: string;
  balance: number;
  lotSum: number;
  ledgerSum: number;
}

export async function reconcileTenant(tx: TenantTx, tenantId: string): Promise<ReconcileMismatch[]> {
  const rows = await tx.execute<{
    id: string;
    point_balance: number;
    lot_sum: string;
    ledger_sum: string;
  }>(sql`
    SELECT c.id,
           c.point_balance,
           COALESCE(SUM(l.points_remaining), 0) AS lot_sum,
           COALESCE((SELECT SUM(points) FROM point_ledger WHERE customer_id = c.id), 0) AS ledger_sum
      FROM customer c
      LEFT JOIN point_lot l ON l.customer_id = c.id
     WHERE c.tenant_id = ${tenantId}
     GROUP BY c.id
    HAVING c.point_balance <> COALESCE(SUM(l.points_remaining), 0)
        OR c.point_balance <> COALESCE((SELECT SUM(points) FROM point_ledger WHERE customer_id = c.id), 0)
  `);

  return [...rows].map((r) => ({
    customerId: r.id,
    balance: r.point_balance,
    lotSum: Number(r.lot_sum),
    ledgerSum: Number(r.ledger_sum),
  }));
}
