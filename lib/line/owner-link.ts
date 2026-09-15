import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

/**
 * Letting a shop owner receive LINE notifications on their own OA.
 *
 * The owner already signs in with LINE, so it looks as though their id is
 * known — it is not. A LINE user id is scoped to the provider that issued it.
 * Staff sign in through our LINE Login channel, under our provider, while a
 * shop creates its Messaging API channel under its own. The same human has two
 * different ids and nothing connects them.
 *
 * So the owner links on purpose: the dashboard shows a short code, they send
 * it to their own OA from the phone they want alerts on, and the webhook
 * records whoever sent it. That also settles which device gets alerted when a
 * shop has several staff.
 */

/** No 0/O or 1/I: this gets read off a screen and typed into a phone. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateLinkCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `CT-${code}`;
}

export interface OwnerLinkState {
  code: string | null;
  linked: boolean;
}

/**
 * The code to show the shop, creating one if this tenant has none yet.
 * Re-reading the settings page must not invalidate a code the owner is part
 * way through typing, so an existing code is returned untouched.
 */
export async function ensureLinkCode(tx: TenantTx, tenantId: string): Promise<OwnerLinkState> {
  const [row] = await tx
    .select({
      code: schema.tenantLineOa.ownerLinkCode,
      owner: schema.tenantLineOa.ownerLineUserId,
    })
    .from(schema.tenantLineOa)
    .where(eq(schema.tenantLineOa.tenantId, tenantId));

  if (!row) return { code: null, linked: false };
  if (row.owner) return { code: row.code, linked: true };
  if (row.code) return { code: row.code, linked: false };

  const code = generateLinkCode();
  await tx
    .update(schema.tenantLineOa)
    .set({ ownerLinkCode: code })
    .where(eq(schema.tenantLineOa.tenantId, tenantId));
  return { code, linked: false };
}

/** Start again — used when the wrong phone claimed it, or the owner changes. */
export async function resetOwnerLink(tx: TenantTx, tenantId: string): Promise<string> {
  const code = generateLinkCode();
  await tx
    .update(schema.tenantLineOa)
    .set({ ownerLinkCode: code, ownerLineUserId: null })
    .where(eq(schema.tenantLineOa.tenantId, tenantId));
  return code;
}

/**
 * Claim the code for whoever sent it.
 *
 * Only matches while the shop has no owner recorded, so a code that leaks into
 * a customer chat later cannot take the alerts off the owner's phone. Matching
 * is case-insensitive and ignores spaces: this is typed on a phone keyboard.
 */
export async function claimOwnerLink(
  tx: TenantTx,
  tenantId: string,
  text: string,
  lineUserId: string,
): Promise<boolean> {
  const typed = text.trim().toUpperCase().replace(/\s+/g, '');
  if (!typed) return false;

  const claimed = await tx
    .update(schema.tenantLineOa)
    .set({ ownerLineUserId: lineUserId, ownerLinkCode: null })
    .where(
      and(
        eq(schema.tenantLineOa.tenantId, tenantId),
        eq(schema.tenantLineOa.ownerLinkCode, typed),
        or(isNull(schema.tenantLineOa.ownerLineUserId), eq(schema.tenantLineOa.ownerLineUserId, lineUserId)),
      ),
    )
    .returning({ tenantId: schema.tenantLineOa.tenantId });

  return claimed.length > 0;
}

/** What the settings page shows: the code to send, or that somebody has it. */
export async function ownerLinkState(tenantId: string): Promise<OwnerLinkState> {
  return withTenant(tenantId, (tx) => ensureLinkCode(tx, tenantId));
}

/** The settings page's "ใช้เครื่องอื่น" button. */
export async function regenerateOwnerLink(tenantId: string): Promise<void> {
  await withTenant(tenantId, (tx) => resetOwnerLink(tx, tenantId));
}

/** Who to push shop-facing alerts to, if anybody has claimed them. */
export async function ownerLineUserId(tx: TenantTx, tenantId: string): Promise<string | null> {
  const [row] = await tx
    .select({ owner: schema.tenantLineOa.ownerLineUserId })
    .from(schema.tenantLineOa)
    .where(eq(schema.tenantLineOa.tenantId, tenantId));
  return row?.owner ?? null;
}
