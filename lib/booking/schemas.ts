/** Zod validation at every boundary, per CLAUDE.md. */
import { z } from 'zod';

const uuid = z.uuid();

export const availabilityQuerySchema = z.object({
  tenantId: uuid,
  date: z.iso.date(),
  serviceIds: z.array(uuid).min(1, 'ต้องเลือกบริการอย่างน้อย 1 อย่าง'),
  resourceId: uuid.optional(),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

export const createBookingSchema = z.object({
  tenantId: uuid,
  customerId: uuid.nullish(),
  // Supplied by the public booking form instead of a customerId; the server
  // finds or creates the customer record from these.
  customerName: z.string().trim().min(1).max(120).nullish(),
  customerPhone: z.string().trim().min(8).max(20).nullish(),
  lineUserId: z.string().trim().max(64).nullish(),
  startsAt: z.iso.datetime({ offset: true }),
  serviceIds: z.array(uuid).min(1, 'ต้องเลือกบริการอย่างน้อย 1 อย่าง'),
  resourceId: uuid.optional(),
  source: z.enum(['online', 'walk_in', 'phone', 'admin']).default('online'),
  customerNote: z.string().max(1000).nullish(),
});

export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  tenantId: uuid,
  reason: z.string().max(500).nullish(),
});

/** Comma-separated ids in a query string. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
