/**
 * GET /api/cron/loyalty — everything docs/logic.md and docs/roadmap.md say
 * runs once a day: point expiry (ข้อ 3.4), reconciliation (ข้อ 4), tier
 * promotion/demotion (ข้อ 3.5), and the birthday bonus (Phase 6).
 *
 * A reconcile mismatch is logged rather than silently fixed: iron rule #2
 * says the three numbers must always agree, so a mismatch is a bug to go
 * find, not something to paper over automatically.
 */
import { NextResponse } from 'next/server';
import { forEachTenant } from '@/lib/db/tenant';
import { expirePointsForTenant } from '@/lib/loyalty/expire';
import { reconcileTenant } from '@/lib/loyalty/reconcile';
import { enqueuePointsExpiringForTenant } from '@/lib/loyalty/notifications';
import { recalculateTiersForTenant } from '@/lib/loyalty/tier';
import { awardBirthdayBonusesForTenant } from '@/lib/loyalty/birthday';
import { expireRewardCodesForTenant } from '@/lib/loyalty/rewards';
import { safeEqual } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(request.url).searchParams.get('token') ??
    '';

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results = await forEachTenant(async (tenantId, tx) => {
    const expired = await expirePointsForTenant(tx, tenantId);
    const expiringNotified = await enqueuePointsExpiringForTenant(tx, tenantId);
    const tiers = await recalculateTiersForTenant(tx, tenantId);
    const birthdays = await awardBirthdayBonusesForTenant(tx, tenantId);
    const rewardCodes = await expireRewardCodesForTenant(tx, tenantId);
    const mismatches = await reconcileTenant(tx, tenantId);
    for (const mismatch of mismatches) {
      console.error('loyalty reconcile mismatch', { tenantId, ...mismatch });
    }
    return { ...expired, expiringNotified, ...tiers, ...birthdays, ...rewardCodes, mismatchCount: mismatches.length };
  });

  const totals = results.reduce(
    (acc, { result }) => ({
      lotsExpired: acc.lotsExpired + result.lotsExpired,
      pointsLost: acc.pointsLost + result.pointsLost,
      expiringNotified: acc.expiringNotified + result.expiringNotified,
      tierPromoted: acc.tierPromoted + result.promoted,
      tierDemotionWarned: acc.tierDemotionWarned + result.demotionWarned,
      tierDemoted: acc.tierDemoted + result.demoted,
      tierRequalified: acc.tierRequalified + result.requalified,
      birthdaysAwarded: acc.birthdaysAwarded + result.awarded,
      rewardCodesExpired: acc.rewardCodesExpired + result.expired,
      mismatchCount: acc.mismatchCount + result.mismatchCount,
    }),
    {
      lotsExpired: 0,
      pointsLost: 0,
      expiringNotified: 0,
      tierPromoted: 0,
      tierDemotionWarned: 0,
      tierDemoted: 0,
      tierRequalified: 0,
      birthdaysAwarded: 0,
      rewardCodesExpired: 0,
      mismatchCount: 0,
    },
  );

  return NextResponse.json({ tenantsProcessed: results.length, ...totals });
}
