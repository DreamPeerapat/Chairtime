import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/availability';
import { availabilityQuerySchema, parseIdList } from '@/lib/booking/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/availability?tenantId=…&date=2026-03-16&serviceIds=a,b&resourceId=…
 *
 * Returns candidate start times. They are proposals — the slot is only reserved
 * once POST /api/bookings succeeds.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = availabilityQuerySchema.safeParse({
    tenantId: url.searchParams.get('tenantId') ?? undefined,
    date: url.searchParams.get('date') ?? undefined,
    serviceIds: parseIdList(url.searchParams.get('serviceIds')),
    resourceId: url.searchParams.get('resourceId') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'พารามิเตอร์ไม่ถูกต้อง', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tenantId, date, serviceIds, resourceId } = parsed.data;

  try {
    const slots = await getAvailability({
      tenantId,
      date,
      serviceIds,
      preferredResourceId: resourceId,
    });

    return NextResponse.json({
      date,
      slots: slots.map((slot) => ({
        startsAt: slot.start.toISO(),
        endsAt: slot.end.toISO(),
        durationMin: Math.round(slot.end.diff(slot.start, 'minutes').minutes),
        staffResourceId: slot.staffResourceId,
      })),
    });
  } catch (error) {
    if (error instanceof Error && /unknown service|unknown tenant/i.test(error.message)) {
      return NextResponse.json({ error: 'ไม่พบร้านหรือบริการที่เลือก' }, { status: 404 });
    }
    throw error;
  }
}
