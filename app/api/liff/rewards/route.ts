/**
 * POST /api/liff/rewards — the LIFF rewards page's data source and its
 * redeem action, both behind the same LINE access-token verification as
 * /api/liff/points (see that file's comment for why: never trust a
 * client-supplied lineUserId).
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { fetchLineProfile } from '@/lib/line/profile';
import { getCustomerIdByLineUserId } from '@/lib/loyalty/summary';
import { listRewardsForCustomer, redeemReward } from '@/lib/loyalty/rewards';
import {
  InsufficientPointsError,
  RewardNotEligibleError,
  RewardOutOfStockError,
} from '@/lib/loyalty/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tenantSlug: z.string().trim().min(1),
  accessToken: z.string().trim().min(1),
  rewardId: z.uuid().optional(),
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
    .select({ id: schema.tenant.id })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, parsed.data.tenantSlug));
  if (!tenant) {
    return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 });
  }

  const customerId = await withTenant(tenant.id, (tx) =>
    getCustomerIdByLineUserId(tx, tenant.id, profile.userId),
  );
  if (!customerId) {
    return NextResponse.json({ rewards: [], balance: 0 });
  }

  if (parsed.data.rewardId) {
    try {
      const result = await withTenant(tenant.id, (tx) =>
        redeemReward(tx, { tenantId: tenant.id, customerId, rewardId: parsed.data.rewardId! }),
      );
      return NextResponse.json({
        code: result.code,
        rewardName: result.rewardName,
        expiresAt: result.expiresAt?.toISOString() ?? null,
      });
    } catch (error) {
      if (
        error instanceof RewardNotEligibleError ||
        error instanceof RewardOutOfStockError ||
        error instanceof InsufficientPointsError
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  const [rewards, balance] = await withTenant(tenant.id, async (tx) => {
    const [rewardList, [customer]] = await Promise.all([
      listRewardsForCustomer(tx, tenant.id, customerId),
      tx.select({ balance: schema.customer.pointBalance }).from(schema.customer).where(eq(schema.customer.id, customerId)),
    ]);
    return [rewardList, customer?.balance ?? 0] as const;
  });

  return NextResponse.json({ rewards, balance });
}
