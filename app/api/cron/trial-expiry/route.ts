/**
 * GET /api/cron/trial-expiry — suspends shops whose trial ran out.
 *
 * Called once a day by the platform scheduler. Same shared-secret guard as
 * /api/cron/notifications.
 */
import { NextResponse } from 'next/server';
import { suspendExpiredTrials } from '@/lib/onboarding/trial-expiry';
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

  const suspended = await suspendExpiredTrials();
  return NextResponse.json({ suspended });
}
