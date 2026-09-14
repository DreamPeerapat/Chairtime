import { z } from 'zod';

/** What the browser may upload. Enforced again server-side before the token is issued. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * 8 MB. Phone photos routinely exceed this, so the client downscales before
 * uploading — this is the backstop for anything that gets past that.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Longest edge of a stored photo. A gallery never needs more, and the shop's
 *  storage bill is the shop's, so the client shrinks before it uploads. */
export const MAX_IMAGE_EDGE = 1600;

/**
 * Where one shop's photos live in the blob store.
 *
 * Shared by the uploader (which builds the path) and the token route (which
 * refuses any path that does not start with it). Keeping both on one function
 * is what stops the two drifting into a hole.
 */
export function portfolioPrefix(tenantId: string): string {
  return `portfolio/${tenantId}/`;
}

const optionalUuid = z
  .union([z.literal(''), z.string().uuid()])
  .optional()
  .transform((v) => (v ? v : null));

export const portfolioItemSchema = z.object({
  imageUrl: z.string().url('ลิงก์รูปไม่ถูกต้อง'),
  blobPathname: z.string().min(1).max(500).optional(),
  caption: z
    .string()
    .trim()
    .max(200, 'คำอธิบายยาวเกินไป')
    .optional()
    .transform((v) => (v ? v : null)),
  resourceId: optionalUuid,
  serviceId: optionalUuid,
});

export type PortfolioItemInput = z.infer<typeof portfolioItemSchema>;

export const portfolioUpdateSchema = z.object({
  id: z.string().uuid(),
  caption: z
    .string()
    .trim()
    .max(200, 'คำอธิบายยาวเกินไป')
    .optional()
    .transform((v) => (v ? v : null)),
  resourceId: optionalUuid,
  serviceId: optionalUuid,
  isPublished: z.coerce.boolean(),
});
