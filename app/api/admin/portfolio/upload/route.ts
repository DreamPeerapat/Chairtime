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
 * what a portfolio photo may be. `tenantId` comes from the session and is
 * baked into the pathname — never from the request body, which the browser
 * controls and which would otherwise let one shop write into another's folder.
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { sessionForApi } from '@/lib/auth';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/portfolio/validation';

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
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_IMAGE_TYPES,
        maximumSizeInBytes: MAX_IMAGE_BYTES,
        // Everything this shop owns lands under its own prefix, so a listing
        // or a cleanup can never wander into another tenant's photos.
        pathname: `portfolio/${auth.session.tenantId}`,
        addRandomSuffix: true,
        // Nothing here needs to be secret — a gallery is for showing people —
        // and public blobs are served from the CDN rather than through a
        // function, which is both faster and cheaper.
        access: 'public',
        tokenPayload: JSON.stringify({ tenantId: auth.session.tenantId }),
      }),
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
