/**
 * docs/logic.md §5 "points_expiring" — "ก่อนหมด 30 วัน ดึงลูกค้ากลับได้ดี
 * ที่สุดในบรรดา notification ทั้งหมด". Run daily; the dedupe key is keyed
 * on the lot, so a lot that has been in the 30-day window for a week does
 * not get re-queued every time this runs.
 */
import { DateTime } from 'luxon';
import { and, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';

export async function enqueuePointsExpiringForTenant(
  tx: TenantTx,
  tenantId: string,
  now: DateTime = DateTime.now(),
): Promise<number> {
  const windowEnd = now.plus({ days: 30 }).toJSDate();

  const lots = await tx
    .select({
      id: schema.pointLot.id,
      customerId: schema.pointLot.customerId,
      remaining: schema.pointLot.pointsRemaining,
      expiresAt: schema.pointLot.expiresAt,
    })
    .from(schema.pointLot)
    .where(
      and(
        eq(schema.pointLot.tenantId, tenantId),
        gt(schema.pointLot.pointsRemaining, 0),
        isNotNull(schema.pointLot.expiresAt),
        lte(schema.pointLot.expiresAt, windowEnd),
        gt(schema.pointLot.expiresAt, now.toJSDate()),
      ),
    );

  let enqueued = 0;
  for (const lot of lots) {
    await enqueue(tx, {
      tenantId,
      customerId: lot.customerId,
      template: 'points_expiring',
      scheduledAt: now,
      payload: { lotId: lot.id, points: lot.remaining, expiresAt: lot.expiresAt!.toISOString() },
      dedupeKey: dedupeKey('points_expiring', 'lot', lot.id),
    });
    enqueued += 1;
  }
  return enqueued;
}
