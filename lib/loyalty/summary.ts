/** Shared by the "แต้มของฉัน" LINE command and the LIFF points page. */
import { and, asc, eq, gt, isNotNull } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';

export interface PointsSummary {
  balance: number;
  nextExpiry: { points: number; expiresAt: Date } | null;
}

export async function getPointsSummaryByLineUserId(
  tx: TenantTx,
  tenantId: string,
  lineUserId: string,
): Promise<PointsSummary> {
  const [customer] = await tx
    .select({ id: schema.customer.id, pointBalance: schema.customer.pointBalance })
    .from(schema.customer)
    .where(and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.lineUserId, lineUserId)));
  if (!customer) return { balance: 0, nextExpiry: null };

  const [soonestLot] = await tx
    .select({ pointsRemaining: schema.pointLot.pointsRemaining, expiresAt: schema.pointLot.expiresAt })
    .from(schema.pointLot)
    .where(
      and(
        eq(schema.pointLot.customerId, customer.id),
        gt(schema.pointLot.pointsRemaining, 0),
        isNotNull(schema.pointLot.expiresAt),
        gt(schema.pointLot.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(schema.pointLot.expiresAt))
    .limit(1);

  return {
    balance: customer.pointBalance,
    nextExpiry: soonestLot?.expiresAt
      ? { points: soonestLot.pointsRemaining, expiresAt: soonestLot.expiresAt }
      : null,
  };
}
