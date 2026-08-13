/**
 * GET /api/admin/availability?date=…&serviceIds=…&resourceId=…
 *
 * Same engine as the public endpoint, but the tenant comes from the signed
 * session rather than the query string, and the online lead-time policy is
 * waived: staff book for a customer who is already standing at the counter.
 */
import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { sessionForApi } from '@/lib/auth';
import { getAvailability } from '@/lib/availability';
import { parseIdList } from '@/lib/booking/schemas';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  date: z.iso.date(),
  serviceIds: z.array(z.uuid()).min(1),
  resourceId: z.uuid().optional(),
});

export async function GET(request: Request) {
  const auth = await sessionForApi('staff');
  if ('status' in auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get('date') ?? undefined,
    serviceIds: parseIdList(url.searchParams.get('serviceIds')),
    resourceId: url.searchParams.get('resourceId') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'พารามิเตอร์ไม่ถูกต้อง' }, { status: 400 });
  }

  const slots = await getAvailability({
    tenantId: auth.session.tenantId,
    date: parsed.data.date,
    serviceIds: parsed.data.serviceIds,
    preferredResourceId: parsed.data.resourceId,
    // Waives min_lead_time and the advance-booking horizon for counter staff.
    now: DateTime.fromISO(parsed.data.date).minus({ years: 1 }),
  });

  return NextResponse.json({
    slots: slots.map((slot) => ({
      startsAt: slot.start.toISO(),
      endsAt: slot.end.toISO(),
      durationMin: Math.round(slot.end.diff(slot.start, 'minutes').minutes),
      staffResourceId: slot.staffResourceId,
    })),
  });
}
