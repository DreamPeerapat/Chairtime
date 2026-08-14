/**
 * Earning points — docs/logic.md ข้อ 3.1. Only ever called on
 * `booking.status -> 'completed'` (iron rule #2); never on booking creation.
 *
 * `point_earn_mode` on a service can be `inherit | fixed | multiplier | none`,
 * but ข้อ 3.1's algorithm only ever gives distinct behaviour to `none`
 * (excluded from the earning base) — `fixed` and `multiplier` are declared in
 * the schema for later but the worked algorithm treats them like `inherit`.
 * Extending them is a deliberate follow-up, not an oversight here.
 */
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { findSqlState } from '@/lib/booking/errors';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { applyRounding, getPointRule, getTierMultiplier } from './rules';

const UNIQUE_VIOLATION = '23505';

export interface EarnResult {
  pointsEarned: number;
}

const NOT_EARNED: EarnResult = { pointsEarned: 0 };

export async function earnPointsForBooking(
  tx: TenantTx,
  tenantId: string,
  bookingId: string,
): Promise<EarnResult> {
  // Fast idempotency check: the unique index on point_ledger is the real
  // guarantee (below), but this avoids doing the work twice for the common
  // case of a booking that is simply not new.
  const [already] = await tx
    .select({ id: schema.pointLedger.id })
    .from(schema.pointLedger)
    .where(
      and(
        eq(schema.pointLedger.tenantId, tenantId),
        eq(schema.pointLedger.entryType, 'earn'),
        eq(schema.pointLedger.sourceType, 'booking'),
        eq(schema.pointLedger.sourceId, bookingId),
      ),
    );
  if (already) return NOT_EARNED;

  const [bookingRow] = await tx
    .select({
      customerId: schema.booking.customerId,
      total: schema.booking.total,
      pointDiscount: schema.booking.pointDiscount,
    })
    .from(schema.booking)
    .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.id, bookingId)));
  if (!bookingRow?.customerId) return NOT_EARNED; // no customer on record — nobody to credit

  const rule = await getPointRule(tx, tenantId);
  if (!rule.isActive) return NOT_EARNED;

  const items = await tx
    .select({ price: schema.bookingItem.price, pointEarnMode: schema.service.pointEarnMode })
    .from(schema.bookingItem)
    .innerJoin(schema.service, eq(schema.bookingItem.serviceId, schema.service.id))
    .where(eq(schema.bookingItem.bookingId, bookingId));

  const excludedTotal = items
    .filter((i) => i.pointEarnMode === 'none')
    .reduce((sum, i) => sum + Number(i.price), 0);

  // ส่วนที่จ่ายเงินจริง เท่านั้น — ยอดที่จ่ายด้วยแต้มไม่นับเป็นฐานคำนวณแต้มใหม่
  const base = Math.max(0, Number(bookingRow.total) - Number(bookingRow.pointDiscount) - excludedTotal);
  if (base <= 0) return NOT_EARNED;

  const rawPoints = base / rule.bahtPerPoint;
  const roundedPoints = applyRounding(rawPoints, rule.rounding);

  const tierMultiplier = await getTierMultiplier(tx, bookingRow.customerId);
  const points = Math.floor(roundedPoints * tierMultiplier);
  if (points <= 0) return NOT_EARNED;

  const expiresAt = rule.expiryMonths
    ? DateTime.now().plus({ months: rule.expiryMonths }).toJSDate()
    : null;

  try {
    // A nested transaction (SAVEPOINT under postgres-js): if the ledger
    // insert loses the idempotency race below, only this savepoint rolls
    // back — the caller's own transaction (the rest of "mark completed")
    // is untouched.
    return await tx.transaction(async (tx2) => {
      const [lot] = await tx2
        .insert(schema.pointLot)
        .values({
          tenantId,
          customerId: bookingRow.customerId!,
          pointsTotal: points,
          pointsRemaining: points,
          expiresAt,
          sourceType: 'booking',
          sourceId: bookingId,
        })
        .returning({ id: schema.pointLot.id });

      const [updatedCustomer] = await tx2
        .update(schema.customer)
        .set({
          pointBalance: sql`${schema.customer.pointBalance} + ${points}`,
          lifetimePoints: sql`${schema.customer.lifetimePoints} + ${points}`,
        })
        .where(eq(schema.customer.id, bookingRow.customerId!))
        .returning({ pointBalance: schema.customer.pointBalance });

      // The unique index on (tenant_id, entry_type, source_type, source_id)
      // is what actually makes this idempotent under a true race — the SELECT
      // above is just the fast path.
      await tx2.insert(schema.pointLedger).values({
        tenantId,
        customerId: bookingRow.customerId!,
        entryType: 'earn',
        points,
        balanceAfter: updatedCustomer!.pointBalance,
        lotId: lot!.id,
        sourceType: 'booking',
        sourceId: bookingId,
      });

      // docs/logic.md §5 "points_earned" — sent after the job is done, with
      // the resulting balance so the message is useful on its own.
      await enqueue(tx2, {
        tenantId,
        customerId: bookingRow.customerId!,
        template: 'points_earned',
        scheduledAt: DateTime.now(),
        payload: { bookingId, points, balance: updatedCustomer!.pointBalance },
        dedupeKey: dedupeKey('points_earned', 'booking', bookingId),
      });

      return { pointsEarned: points };
    });
  } catch (error) {
    if (findSqlState(error) === UNIQUE_VIOLATION) return NOT_EARNED;
    throw error;
  }
}
