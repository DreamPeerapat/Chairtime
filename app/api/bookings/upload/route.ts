/**
 * POST /api/bookings/upload — an upload token for a customer's reference photo.
 *
 * The sibling route under /api/admin/portfolio checks a staff session. This
 * one cannot: the person uploading is a customer on a booking page who has
 * never signed in to anything. So the gate is what it can check —
 *
 *   - the shop exists and is open (findTenantBySlug refuses a suspended one),
 *   - the file is an image, under 4 MB,
 *   - it lands under this shop's reference/ prefix and nowhere else.
 *
 * What that leaves is somebody uploading images to an open shop's folder
 * without ever booking. The cost of that is blob storage, bounded per file
 * and per booking, and the alternative — making customers sign in to attach a
 * photo of a haircut — costs the shop far more in abandoned bookings. Worth
 * revisiting if a shop ever reports a bill it does not recognise.
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { findTenantBySlug } from '@/lib/booking/queries';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_REFERENCE_BYTES,
  referencePrefix,
} from '@/lib/portfolio/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const slug = new URL(request.url).searchParams.get('shop');
  if (!slug) {
    return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 400 });
  }

  const tenant = await findTenantBySlug(slug);
  if (!tenant) {
    return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The browser chooses the path and the SDK honours it as sent, so the
        // only way to keep one shop out of another's folder is to refuse a
        // token for a path that is not this one's.
        if (!pathname.startsWith(referencePrefix(tenant.id))) {
          throw new Error('pathname outside this tenant');
        }

        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_REFERENCE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ tenantId: tenant.id }),
        };
      },
      onUploadCompleted: async () => {
        // The URL is attached to the booking by POST /api/bookings. A photo
        // uploaded for a booking that is never completed is simply an orphan
        // in the store, which is why the size and count caps exist.
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[booking] reference upload token failed', error);
    return NextResponse.json({ error: 'อัปโหลดรูปไม่สำเร็จ' }, { status: 400 });
  }
}
