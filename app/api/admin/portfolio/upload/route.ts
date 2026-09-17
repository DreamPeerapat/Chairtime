/**
 * POST /api/admin/portfolio/upload — issues a short-lived client upload token.
 *
 * The browser sends the file straight to the blob store rather than through
 * this function, for two reasons: Vercel caps a serverless request body at
 * 4.5 MB, which a phone photo passes without trying, and client uploads carry
 * no data transfer charge.
 *
 * That makes this route the only gate on who may write to the store, so it
 * checks the signed session before handing out a token, and pins the token to
 * what a portfolio photo may be — content type, size, and the folder it may
 * land in. Every one of those comes from the session or from constants here,
 * never from the request body, which the browser controls.
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { sessionForApi } from '@/lib/auth';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  portfolioPrefix,
  slipPrefix,
  staffPhotoPrefix,
} from '@/lib/portfolio/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await sessionForApi('manager');
  if ('status' in auth) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์อัปโหลด' }, { status: auth.status });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The destination path comes from the browser and the SDK honours it
        // as sent — `onBeforeGenerateToken` cannot rewrite it, its return type
        // accepts no pathname. So the only way to keep one shop out of
        // another's folder is to refuse a token for a path that is not this
        // shop's, which is what this does. Checking it here rather than
        // trusting the client is the whole point of the route existing.
        const allowed = [
          portfolioPrefix(auth.session.tenantId),
          staffPhotoPrefix(auth.session.tenantId),
          // A slip is evidence about the shop's own subscription, which only
          // the owner can see or pay — a manager has no page to reach it from.
          ...(auth.session.role === 'owner' ? [slipPrefix(auth.session.tenantId)] : []),
        ];
        if (!allowed.some((prefix) => pathname.startsWith(prefix))) {
          throw new Error('pathname outside this tenant');
        }

        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          // Two shops uploading "IMG_1234.webp" must not collide, and an
          // upload must never overwrite a photo already in the gallery.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ tenantId: auth.session.tenantId }),
        };
      },
      onUploadCompleted: async () => {
        // The row is written by the addPortfolioItem server action once the
        // browser reports the URL. Nothing to do here, but the SDK requires
        // the callback to exist.
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[portfolio] upload token failed', error);
    return NextResponse.json({ error: 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }, { status: 400 });
  }
}
