/**
 * Who a document made out to this shop should name.
 *
 * Both documents ask the same question — a receipt after the money and an
 * invoice before it — and they must answer it identically, or a shop gets an
 * invoice addressed to its company and a receipt addressed to its shopfront
 * for the same payment.
 *
 * The billing identity wins field by field, each falling back on its own: a
 * shop that filled in a tax id and nothing else still gets its own name and
 * address, which is the common case.
 */
import { and, eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export interface BillingParty {
  name: string;
  taxId: string | null;
  address: string | null;
  email: string | null;
  timezone: string;
}

export async function billingPartyFor(tenantId: string): Promise<BillingParty> {
  return withTenant(tenantId, async (tx) => {
    const [shop] = await tx
      .select({
        name: schema.tenant.name,
        address: schema.tenant.address,
        taxId: schema.tenant.taxId,
        billingName: schema.tenant.billingName,
        billingAddress: schema.tenant.billingAddress,
        billingEmail: schema.tenant.billingEmail,
        timezone: schema.tenant.timezone,
      })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId));

    if (!shop) {
      return { name: '', taxId: null, address: null, email: null, timezone: 'Asia/Bangkok' };
    }

    return {
      name: shop.billingName ?? shop.name,
      taxId: shop.taxId,
      address: shop.billingAddress ?? shop.address,
      email: shop.billingEmail ?? (await ownerEmail(tx, tenantId)),
      timezone: shop.timezone,
    };
  });
}

/**
 * Where a document goes when the shop has not named an address for them.
 *
 * The owner, not any member of staff: these are financial documents and the
 * stylist who joined last week has no business receiving them.
 */
export async function ownerEmail(tx: TenantTx, tenantId: string): Promise<string | null> {
  const rows = await tx
    .select({ email: schema.staffUser.primaryEmail })
    .from(schema.staffTenant)
    .innerJoin(schema.staffUser, eq(schema.staffUser.id, schema.staffTenant.staffId))
    .where(
      and(
        eq(schema.staffTenant.tenantId, tenantId),
        eq(schema.staffTenant.role, 'owner'),
        eq(schema.staffTenant.isActive, true),
      ),
    )
    .limit(1);

  return rows[0]?.email ?? null;
}
