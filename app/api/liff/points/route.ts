/**
 * POST /api/liff/points — the LIFF points page's data source.
 *
 * The client sends a LIFF access token, not a lineUserId: trusting a
 * customer-supplied id would let anyone view anyone else's balance just by
 * guessing it. The token is verified against LINE's own /v2/profile before
 * any lookup happens, so the identity in the response is always the one
 * LINE itself vouches for.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { fetchLineProfile } from '@/lib/line/profile';
import { getPointsSummaryByLineUserId } from '@/lib/loyalty/summary';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tenantSlug: z.string().trim().min(1),
  accessToken: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const profile = await fetchLineProfile(parsed.data.accessToken);
  if (!profile) {
    return NextResponse.json({ error: 'ยืนยันตัวตนไม่สำเร็จ' }, { status: 401 });
  }

  const [tenant] = await db
    .select({ id: schema.tenant.id, name: schema.tenant.name })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, parsed.data.tenantSlug));
  if (!tenant) {
    return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 });
  }

  const summary = await withTenant(tenant.id, (tx) =>
    getPointsSummaryByLineUserId(tx, tenant.id, profile.userId),
  );

  return NextResponse.json({
    shopName: tenant.name,
    balance: summary.balance,
    nextExpiry: summary.nextExpiry
      ? { points: summary.nextExpiry.points, expiresAt: summary.nextExpiry.expiresAt.toISOString() }
      : null,
  });
}
