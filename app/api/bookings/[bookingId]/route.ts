import { NextResponse } from 'next/server';
import { cancelBooking } from '@/lib/booking';
import { BookingPolicyError } from '@/lib/booking/errors';
import { cancelBookingSchema } from '@/lib/booking/schemas';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const url = new URL(request.url);

  const parsed = cancelBookingSchema.safeParse({
    tenantId: url.searchParams.get('tenantId') ?? undefined,
    reason: url.searchParams.get('reason'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ข้อมูลไม่ถูกต้อง', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await cancelBooking({
      tenantId: parsed.data.tenantId,
      bookingId,
      reason: parsed.data.reason ?? null,
    });
    return NextResponse.json({ status: 'cancelled' });
  } catch (error) {
    if (error instanceof BookingPolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    throw error;
  }
}
