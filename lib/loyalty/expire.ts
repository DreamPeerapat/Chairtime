/**
 * Daily expiry — docs/logic.md ข้อ 3.4. Every lot past its `expires_at` is
 * zeroed and the loss is written to the ledger, so `customer.point_balance`,
 * `point_lot`, and `point_ledger` still agree afterwards (iron rule #2).
 */
import { and, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';

export interface ExpireResult {
  lotsExpired: number;
  pointsLost: number;
}

export async function expirePointsForTenant(
  tx: TenantTx,
  tenantId: string,
  now: Date = new Date(),
): Promise<ExpireResult> {
  const expiring = await tx
    .select({ id: schema.pointLot.id, customerId: schema.pointLot.customerId, remaining: schema.pointLot.pointsRemaining })
    .from(schema.pointLot)
    .where(
      and(
        eq(schema.pointLot.tenantId, tenantId),
        gt(schema.pointLot.pointsRemaining, 0),
        isNotNull(schema.pointLot.expiresAt),
        lte(schema.pointLot.expiresAt, now),
      ),
    )
    .for('update');

  let pointsLost = 0;

  for (const lot of expiring) {
    if (lot.remaining <= 0) continue;

    await tx.update(schema.pointLot).set({ pointsRemaining: 0 }).where(eq(schema.pointLot.id, lot.id));

    const [updatedCustomer] = await tx
      .update(schema.customer)
      .set({ pointBalance: sql`${schema.customer.pointBalance} - ${lot.remaining}` })
      .where(eq(schema.customer.id, lot.customerId))
      .returning({ pointBalance: schema.customer.pointBalance });

    await tx.insert(schema.pointLedger).values({
      tenantId,
      customerId: lot.customerId,
      entryType: 'expire',
      points: -lot.remaining,
      balanceAfter: updatedCustomer!.pointBalance,
      lotId: lot.id,
      sourceType: 'system',
      sourceId: null,
    });

    pointsLost += lot.remaining;
  }

  return { lotsExpired: expiring.length, pointsLost };
}
