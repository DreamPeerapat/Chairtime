/**
 * Who the shop is on a document we issue it.
 *
 * Two ideas that look like one. A shop has a name and an address that
 * customers see; a business has a name, an address and a tax id that its
 * accountant needs. For most shops they are the same, which is why the billing
 * fields are all optional and all fall back — but a salon trading under a
 * brand and invoiced as a company has to be able to say so, or every receipt
 * we issue is unusable to the person who has to file it.
 */
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';

export interface BillingIdentity {
  /** what to print as the payer; the shop's own name when not set */
  name: string;
  taxId: string;
  address: string;
  /** where documents are sent; the owner's login email when not set */
  email: string;
  /** whether any of it was filled in, for the screen to say so */
  customised: boolean;
}

export interface BillingIdentityInput {
  billingName: string;
  taxId: string;
  billingAddress: string;
  billingEmail: string;
}

/** The raw columns, so a form can show what was actually typed. */
export async function loadBillingIdentity(tenantId: string): Promise<BillingIdentityInput> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        billingName: schema.tenant.billingName,
        taxId: schema.tenant.taxId,
        billingAddress: schema.tenant.billingAddress,
        billingEmail: schema.tenant.billingEmail,
      })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId)),
  );

  return {
    billingName: row?.billingName ?? '',
    taxId: row?.taxId ?? '',
    billingAddress: row?.billingAddress ?? '',
    billingEmail: row?.billingEmail ?? '',
  };
}

export async function saveBillingIdentity(
  tenantId: string,
  input: BillingIdentityInput,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.tenant)
      // Empty means "use the shop's own", so it is stored as null rather than
      // as an empty string — otherwise a document prints a blank line where a
      // name should be.
      .set({
        billingName: input.billingName.trim() || null,
        taxId: input.taxId.replace(/\D/g, '') || null,
        billingAddress: input.billingAddress.trim() || null,
        billingEmail: input.billingEmail.trim() || null,
      })
      .where(eq(schema.tenant.id, tenantId)),
  );
}

/** Thai juristic and personal tax ids are both thirteen digits. */
export function taxIdLooksValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 0 || digits.length === 13;
}
