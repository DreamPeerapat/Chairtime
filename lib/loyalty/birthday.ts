/**
 * Birthday bonus — docs/roadmap.md Phase 6. Runs daily alongside tier
 * recalculation; awards `point_rule.birthday_bonus` once per calendar year
 * to every customer whose birth_date falls on today (month + day, the year
 * on the stored date is their actual birth year, not relevant here).
 */
import { DateTime } from 'luxon';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { grantBonusPoints, hasBonusSince } from './bonus';
import { getPointRule } from './rules';

export interface BirthdayRunResult {
  awarded: number;
}

export async function awardBirthdayBonusesForTenant(
  tx: TenantTx,
  tenantId: string,
  today: DateTime = DateTime.now(),
): Promise<BirthdayRunResult> {
  const rule = await getPointRule(tx, tenantId);
  if (!rule.isActive || rule.birthdayBonus <= 0) return { awarded: 0 };

  // date columns come back as 'YYYY-MM-DD' strings — compare the MM-DD slice
  // directly rather than pulling every customer's birth_date into JS.
  const monthDay = today.toFormat('MM-dd');
  const candidates = await tx
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(
      and(
        eq(schema.customer.tenantId, tenantId),
        sql`to_char(${schema.customer.birthDate}, 'MM-DD') = ${monthDay}`,
      ),
    );

  let awarded = 0;
  const yearStart = today.startOf('year').toJSDate();

  for (const customer of candidates) {
    const already = await hasBonusSince(tx, customer.id, 'birthday', yearStart);
    if (already) continue;

    await grantBonusPoints(tx, {
      tenantId,
      customerId: customer.id,
      points: rule.birthdayBonus,
      sourceType: 'birthday',
      expiryMonths: rule.expiryMonths,
    });

    await enqueue(tx, {
      tenantId,
      customerId: customer.id,
      template: 'birthday',
      scheduledAt: today,
      payload: { points: rule.birthdayBonus },
      dedupeKey: dedupeKey('birthday', 'customer', customer.id, String(today.year)),
    });

    awarded += 1;
  }

  return { awarded };
}
