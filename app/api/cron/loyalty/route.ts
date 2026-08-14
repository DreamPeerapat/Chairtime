/**
 * GET /api/cron/loyalty — docs/logic.md ข้อ 3.4 (expiry) และข้อ 4
 * (reconciliation), run once a day.
 *
 * A mismatch is logged rather than silently fixed: iron rule #2 says the
 * three numbers must always agree, so a mismatch is a bug to go find, not
 * something to paper over automatically.
 */
import { NextResponse } from 'next/server';
import { forEachTenant } from '@/lib/db/tenant';
import { expirePointsForTenant } from '@/lib/loyalty/expire';
import { reconcileTenant } from '@/lib/loyalty/reconcile';
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
    const mismatches = await reconcileTenant(tx, tenantId);
    for (const mismatch of mismatches) {
      console.error('loyalty reconcile mismatch', { tenantId, ...mismatch });
    }
    return { ...expired, mismatchCount: mismatches.length };
  });

  const totals = results.reduce(
    (acc, { result }) => ({
      lotsExpired: acc.lotsExpired + result.lotsExpired,
      pointsLost: acc.pointsLost + result.pointsLost,
      mismatchCount: acc.mismatchCount + result.mismatchCount,
    }),
    { lotsExpired: 0, pointsLost: 0, mismatchCount: 0 },
  );

  return NextResponse.json({ tenantsProcessed: results.length, ...totals });
}
