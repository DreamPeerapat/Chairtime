/**
 * Finding or creating the customer a booking belongs to.
 *
 * A shop's customer is identified by phone number first (the receptionist knows
 * it, the customer remembers it) and by LINE user id second. Both are unique
 * per tenant in the schema, so the upsert has to cope with a person who booked
 * on the web last month and through LINE today.
 */
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';

export interface ResolveCustomerInput {
  tenantId: string;
  name?: string | null;
  phone?: string | null;
  lineUserId?: string | null;
}

/** Thai mobile numbers get typed with spaces and dashes; store the digits. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length === 0) return null;
  // +66812345678 and 0812345678 are the same person.
  if (digits.startsWith('+66')) return `0${digits.slice(3)}`;
  if (digits.startsWith('66') && digits.length > 10) return `0${digits.slice(2)}`;
  return digits;
}

export async function resolveCustomer(
  tx: TenantTx,
  input: ResolveCustomerInput,
): Promise<string | null> {
  const phone = normalisePhone(input.phone);
  const lineUserId = input.lineUserId ?? null;
  const name = input.name?.trim() || 'ลูกค้า';

  if (!phone && !lineUserId) return null;

  const conditions = [
    phone ? eq(schema.customer.phone, phone) : null,
    lineUserId ? eq(schema.customer.lineUserId, lineUserId) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const existing = await tx
    .select({
      id: schema.customer.id,
      name: schema.customer.name,
      phone: schema.customer.phone,
      lineUserId: schema.customer.lineUserId,
    })
    .from(schema.customer)
    .where(and(eq(schema.customer.tenantId, input.tenantId), or(...conditions)));

  // Prefer the LINE match: it is the stronger identity claim, since a phone
  // number can be mistyped.
  const match =
    existing.find((c) => lineUserId && c.lineUserId === lineUserId) ??
    existing.find((c) => phone && c.phone === phone);

  if (match) {
    // Backfill whichever identifier this booking supplied and the record lacks.
    const patch: Partial<typeof schema.customer.$inferInsert> = {};
    if (phone && !match.phone) patch.phone = phone;
    if (lineUserId && !match.lineUserId) patch.lineUserId = lineUserId;
    if (match.name === 'ลูกค้า' && name !== 'ลูกค้า') patch.name = name;

    if (Object.keys(patch).length > 0) {
      await tx.update(schema.customer).set(patch).where(eq(schema.customer.id, match.id));
    }
    return match.id;
  }

  const [created] = await tx
    .insert(schema.customer)
    .values({ tenantId: input.tenantId, name, phone, lineUserId })
    .returning({ id: schema.customer.id });

  return created!.id;
}

/**
 * Two records for one person, usually because they booked by phone once and
 * through LINE another time. Everything moves to `keepId`; the loser is marked
 * blocked with a note rather than deleted, so an accidental merge is traceable.
 */
export async function mergeCustomers(
  tx: TenantTx,
  tenantId: string,
  keepId: string,
  mergeId: string,
): Promise<{ movedBookings: number }> {
  if (keepId === mergeId) throw new Error('cannot merge a customer into itself');

  const [keep] = await tx
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.id, keepId)));
  const [merge] = await tx
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.id, mergeId)));

  if (!keep || !merge) throw new Error('both customers must exist in this tenant');

  const moved = await tx
    .update(schema.booking)
    .set({ customerId: keepId })
    .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.customerId, mergeId)))
    .returning({ id: schema.booking.id });

  // Point lots and ledger rows follow the customer. The ledger is append-only,
  // so nothing here rewrites history — it only re-points the owner.
  await tx
    .update(schema.pointLot)
    .set({ customerId: keepId })
    .where(and(eq(schema.pointLot.tenantId, tenantId), eq(schema.pointLot.customerId, mergeId)));

  await tx
    .update(schema.notificationQueue)
    .set({ customerId: keepId })
    .where(
      and(
        eq(schema.notificationQueue.tenantId, tenantId),
        eq(schema.notificationQueue.customerId, mergeId),
      ),
    );

  // Carry over identifiers and counters the survivor is missing.
  await tx
    .update(schema.customer)
    .set({
      phone: keep.phone ?? merge.phone,
      lineUserId: keep.lineUserId ?? merge.lineUserId,
      email: keep.email ?? merge.email,
      birthDate: keep.birthDate ?? merge.birthDate,
      note: [keep.note, merge.note].filter(Boolean).join('\n') || null,
      visitCount: keep.visitCount + merge.visitCount,
      noShowCount: keep.noShowCount + merge.noShowCount,
      lifetimePoints: keep.lifetimePoints + merge.lifetimePoints,
      pointBalance: keep.pointBalance + merge.pointBalance,
      lifetimeSpend: String(Number(keep.lifetimeSpend) + Number(merge.lifetimeSpend)),
      lastVisitAt: laterOf(keep.lastVisitAt, merge.lastVisitAt),
    })
    .where(eq(schema.customer.id, keepId));

  // The unique index on (tenant_id, phone) means the loser has to give up its
  // identifiers before it can be parked.
  await tx
    .update(schema.customer)
    .set({
      phone: null,
      lineUserId: null,
      isBlocked: true,
      note: `รวมเข้ากับลูกค้า ${keep.name} (${keepId}) แล้ว`,
    })
    .where(eq(schema.customer.id, mergeId));

  return { movedBookings: moved.length };
}

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Candidates for merging: same phone, or same name with one missing a phone. */
export async function findDuplicateCandidates(tx: TenantTx, tenantId: string) {
  return tx
    .select({
      id: schema.customer.id,
      name: schema.customer.name,
      phone: schema.customer.phone,
      lineUserId: schema.customer.lineUserId,
      visitCount: schema.customer.visitCount,
    })
    .from(schema.customer)
    .where(
      and(
        eq(schema.customer.tenantId, tenantId),
        eq(schema.customer.isBlocked, false),
        isNull(schema.customer.phone),
      ),
    );
}
