/**
 * The shape of a service, as a shop edits it.
 *
 * A service is a run of segments: `active` needs the stylist with the customer,
 * `passive` frees the stylist while the chair stays taken (colour developing,
 * a mask setting). lib/availability reads them in `seq` order, so what is
 * saved here is exactly the timeline a booking will hold.
 *
 * Editing them only changes bookings made afterwards. A booking already made
 * has its own resource_allocation rows, which nothing here touches.
 */
import { z } from 'zod';

export const MAX_SEGMENTS = 6;
export const MAX_TOTAL_MIN = 720;

export const segmentSchema = z.object({
  kind: z.enum(['active', 'passive']),
  durationMin: z.coerce
    .number()
    .int('เวลาต้องเป็นจำนวนเต็มนาที')
    .min(5, 'แต่ละช่วงต้องยาวอย่างน้อย 5 นาที')
    .max(600, 'แต่ละช่วงยาวได้ไม่เกิน 600 นาที'),
  label: z
    .string()
    .trim()
    .max(40, 'ชื่อช่วงยาวได้ไม่เกิน 40 ตัวอักษร')
    .nullish()
    .transform((v) => v || null),
});

export type SegmentInput = z.infer<typeof segmentSchema>;

export const segmentsSchema = z
  .array(segmentSchema)
  .min(1, 'ต้องมีอย่างน้อย 1 ช่วง')
  .max(MAX_SEGMENTS, `แบ่งได้ไม่เกิน ${MAX_SEGMENTS} ช่วง`)
  .refine((rows) => rows.some((r) => r.kind === 'active'), {
    message: 'ต้องมีอย่างน้อย 1 ช่วงที่ช่างลงมือทำ',
  })
  .refine((rows) => rows[0]?.kind === 'active', {
    message: 'ช่วงแรกต้องเป็นช่วงที่ช่างลงมือทำ',
  })
  .refine((rows) => rows.reduce((sum, r) => sum + r.durationMin, 0) <= MAX_TOTAL_MIN, {
    message: `รวมทุกช่วงได้ไม่เกิน ${MAX_TOTAL_MIN} นาที`,
  });

/** Rows ready to insert: `seq` from 1 in the order the shop put them. */
export function toSegmentRows(serviceId: string, segments: SegmentInput[]) {
  return segments.map((s, i) => ({
    serviceId,
    seq: i + 1,
    kind: s.kind,
    durationMin: s.durationMin,
    label: s.label,
  }));
}
