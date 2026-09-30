/**
 * Reading and writing what customers said about a visit.
 *
 * The write is deliberately keyed on the booking rather than on whoever is
 * holding the link: a booking code is the credential here, exactly as it
 * already is for viewing and cancelling that booking. That is what lets the
 * shop hand the link to a walk-in who has no LINE account at all.
 */
import { and, desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export const feedbackInput = z.object({
  score: z.coerce.number().int().min(1).max(5),
  // Trimmed to nothing becomes null rather than an empty string, so "rated
  // without commenting" is one state in the database and not two.
  // Null when the booking had nobody assigned — a shop that books rooms
  // rather than people never sends this, and the form never shows it.
  staffScore: z.coerce.number().int().min(1).max(5).optional().nullable(),
  comment: z
    .string()
    .trim()
    .max(500, 'ข้อความยาวเกินไป')
    .optional()
    .transform((v) => (v ? v : null)),
});

export type FeedbackInput = z.infer<typeof feedbackInput>;

export interface FeedbackRow {
  id: string;
  score: number;
  staffScore: number | null;
  comment: string | null;
  isPublished: boolean;
  createdAt: DateTime;
  customerName: string | null;
  bookingCode: string;
}

/** What one booking's customer said, if they have said anything yet. */
export async function findFeedbackForBooking(
  tx: TenantTx,
  tenantId: string,
  bookingId: string,
): Promise<{ score: number; staffScore: number | null; comment: string | null } | null> {
  const [row] = await tx
    .select({
      score: schema.bookingFeedback.score,
      staffScore: schema.bookingFeedback.staffScore,
      comment: schema.bookingFeedback.comment,
    })
    .from(schema.bookingFeedback)
    .where(
      and(
        eq(schema.bookingFeedback.tenantId, tenantId),
        eq(schema.bookingFeedback.bookingId, bookingId),
      ),
    );

  return row ?? null;
}

/**
 * Record a rating, or change one already given.
 *
 * An upsert on the unique booking id: a customer who taps the link twice is
 * correcting themselves, not voting twice. `updatedAt` is what separates the
 * two afterwards.
 */
export async function saveFeedback(
  tenantId: string,
  input: {
    bookingId: string;
    customerId: string | null;
    score: number;
    staffScore: number | null;
    comment: string | null;
    now: DateTime;
  },
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(schema.bookingFeedback)
      .values({
        tenantId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        score: input.score,
        staffScore: input.staffScore,
        comment: input.comment,
      })
      .onConflictDoUpdate({
        target: schema.bookingFeedback.bookingId,
        set: {
          score: input.score,
          staffScore: input.staffScore,
          comment: input.comment,
          updatedAt: input.now.toJSDate(),
        },
      });
  });
}

export interface PublicRating {
  average: number;
  count: number;
  comments: Array<{ id: string; score: number; comment: string; when: DateTime }>;
}

/**
 * What a customer choosing this shop gets to see.
 *
 * Published rows only, and the average is over exactly the same set — a shop
 * hiding a review must not keep its score in the number, or hiding becomes a
 * way to publish a rating nobody can read and nobody can challenge.
 */
export async function publicRating(
  tenantId: string,
  limit = 5,
): Promise<PublicRating> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.bookingFeedback.id,
        score: schema.bookingFeedback.score,
        comment: schema.bookingFeedback.comment,
        createdAt: schema.bookingFeedback.createdAt,
      })
      .from(schema.bookingFeedback)
      .where(
        and(
          eq(schema.bookingFeedback.tenantId, tenantId),
          eq(schema.bookingFeedback.isPublished, true),
        ),
      )
      .orderBy(desc(schema.bookingFeedback.createdAt));

    if (rows.length === 0) return { average: 0, count: 0, comments: [] };

    const total = rows.reduce((sum, r) => sum + r.score, 0);

    return {
      average: Math.round((total / rows.length) * 10) / 10,
      count: rows.length,
      comments: rows
        .filter((r) => r.comment)
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          score: r.score,
          comment: r.comment!,
          when: DateTime.fromJSDate(r.createdAt),
        })),
    };
  });
}

/** Everything the shop sees, hidden rows included. */
export async function listFeedbackForAdmin(
  tenantId: string,
  timezone: string,
): Promise<FeedbackRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.bookingFeedback.id,
        score: schema.bookingFeedback.score,
        staffScore: schema.bookingFeedback.staffScore,
        comment: schema.bookingFeedback.comment,
        isPublished: schema.bookingFeedback.isPublished,
        createdAt: schema.bookingFeedback.createdAt,
        customerName: schema.customer.name,
        bookingCode: schema.booking.code,
      })
      .from(schema.bookingFeedback)
      .innerJoin(schema.booking, eq(schema.booking.id, schema.bookingFeedback.bookingId))
      .leftJoin(schema.customer, eq(schema.customer.id, schema.bookingFeedback.customerId))
      .where(eq(schema.bookingFeedback.tenantId, tenantId))
      .orderBy(desc(schema.bookingFeedback.createdAt))
      .limit(100);

    return rows.map((r) => ({
      ...r,
      createdAt: DateTime.fromJSDate(r.createdAt).setZone(timezone),
    }));
  });
}
