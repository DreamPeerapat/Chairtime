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

/**
 * Where a stylist's own photo lives.
 *
 * A separate folder from the gallery: an avatar is replaced whenever the shop
 * uploads a new one, while a portfolio photo is kept, and listing one folder
 * must not turn up the other.
 */
export function staffPhotoPrefix(tenantId: string): string {
  return `staff/${tenantId}/`;
}

/**
 * Where the photos a customer attaches to a booking go.
 *
 * Its own folder because the trust level is different: the gallery and the
 * avatars are uploaded by signed-in staff, while these arrive from whoever
 * has the shop's booking link. Keeping them apart means the shop's own
 * pictures cannot be crowded out, and a clean-up can target one prefix.
 */
export function referencePrefix(tenantId: string): string {
  return `reference/${tenantId}/`;
}

/**
 * Where a shop's payment slips go.
 *
 * Its own folder because the retention is different: a gallery photo is the
 * shop's shopfront and a slip is an accounting record, and one day somebody
 * will want to clear out one without touching the other.
 */
export function slipPrefix(tenantId: string): string {
  return `slip/${tenantId}/`;
}

/**
 * Three is what a customer needs to show a haircut from the front, the back
 * and the side. It is also the cap on what one anonymous booking can push
 * into the shop's blob store.
 */
export const MAX_REFERENCE_IMAGES = 3;

/** Smaller than a staff upload: a reference is looked at, not printed. */
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;

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
