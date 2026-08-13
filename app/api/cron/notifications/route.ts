/**
 * GET /api/cron/notifications — drains notification_queue.
 *
 * Called every minute by the platform scheduler. Guarded by a shared secret
 * because it is a public URL that does real work.
 */
import { NextResponse } from 'next/server';
import { runNotificationWorker } from '@/lib/notifications/worker';
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

  const result = await runNotificationWorker();
  return NextResponse.json(result);
}
