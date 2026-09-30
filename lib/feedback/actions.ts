'use server';

/**
 * The two writes this feature allows, and who is allowed to make them.
 *
 * Rating is done by whoever holds the booking code — there is no session on
 * the customer side, and the code is the credential, exactly as it is for
 * cancelling. So the checks that matter are done here rather than trusted
 * from the form: the booking must belong to this shop, and it must be a
 * visit that actually happened.
 *
 * Hiding is done by the shop and goes through requireSession like every
 * other dashboard action.
 */
import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { findTenantBySlug } from '@/lib/booking/queries';
import { feedbackInput, saveFeedback } from './queries';

const rateSchema = feedbackInput.extend({
  tenantSlug: z.string().min(1),
  code: z.string().min(1),
});

export async function submitFeedback(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = rateSchema.safeParse({
    tenantSlug: formData.get('tenantSlug'),
    code: formData.get('code'),
    score: formData.get('score'),
    staffScore: formData.get('staffScore') || null,
    comment: formData.get('comment') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: 'ให้คะแนนไม่สำเร็จ กรุณาลองใหม่' };
  }

  const tenant = await findTenantBySlug(parsed.data.tenantSlug);
  if (!tenant) return { ok: false, error: 'ไม่พบร้านนี้' };

  const result = await withTenant(tenant.id, async (tx) => {
    const [booking] = await tx
      .select({
        id: schema.booking.id,
        customerId: schema.booking.customerId,
        status: schema.booking.status,
      })
      .from(schema.booking)
      .where(
        and(eq(schema.booking.tenantId, tenant.id), eq(schema.booking.code, parsed.data.code)),
      );

    if (!booking) return { ok: false as const, error: 'ไม่พบรายการจองนี้' };

    // Only a visit that happened can be rated. A cancelled or no-show booking
    // has nothing to say about the service, and a booking still in the future
    // certainly does not.
    if (booking.status !== 'completed') {
      return { ok: false as const, error: 'ให้คะแนนได้หลังจากใช้บริการเสร็จแล้วเท่านั้น' };
    }

    return { ok: true as const, bookingId: booking.id, customerId: booking.customerId };
  });

  if (!result.ok) return result;

  await saveFeedback(tenant.id, {
    bookingId: result.bookingId,
    customerId: result.customerId,
    score: parsed.data.score,
    staffScore: parsed.data.staffScore ?? null,
    comment: parsed.data.comment,
    now: DateTime.now(),
  });

  revalidatePath(`/${parsed.data.tenantSlug}/booking/${parsed.data.code}`);
  revalidatePath(`/${parsed.data.tenantSlug}`);
  return { ok: true };
}

/**
 * Take a review off the public page, or put it back.
 *
 * Hidden, never deleted: the shop's remedy for an unfair review is to stop
 * showing it, not to erase what a customer wrote. It stays in the dashboard,
 * and it stops counting towards the average (see publicRating).
 */
export async function setFeedbackPublished(formData: FormData): Promise<void> {
  const session = await requireSession('manager');

  const id = String(formData.get('id') ?? '');
  const publish = String(formData.get('publish') ?? '') === 'true';
  if (!id) return;

  await withTenant(session.tenantId, async (tx) => {
    await tx
      .update(schema.bookingFeedback)
      .set({ isPublished: publish })
      .where(
        and(
          eq(schema.bookingFeedback.tenantId, session.tenantId),
          eq(schema.bookingFeedback.id, id),
        ),
      );
  });

  revalidatePath('/dashboard/feedback');
}
