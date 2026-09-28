/**
 * ChairTime's own LINE OA — the one the platform talks to shops through.
 *
 * Not to be confused with either of the two LINE things already in here
 * (CLAUDE.md iron rule #6 keeps warning about this, and now there are three):
 *
 *  - LINE Login  — how a person signs in to the dashboard.
 *  - a shop's OA — how that shop talks to *its* customers, credentials per
 *    tenant in `tenant_line_oa`.
 *  - this one    — how ChairTime talks to the shop owner: news, and the
 *    receipt for the subscription they just paid for.
 *
 * It exists because the shop's own OA is not set up on the day they pay. The
 * receipt used to be addressed to `ownerLineUserId`, which is the owner's id
 * on *their* channel and is null until they have finished the LINE wizard and
 * sent the pairing code — so the first receipt a shop ever gets was silently
 * dropped. This channel is reachable from the moment they sign in.
 *
 * DEPLOYMENT REQUIREMENT, and the whole thing rests on it: this OA and the
 * LINE Login channel must sit under the SAME LINE provider. A LINE user id is
 * scoped to its provider, so only then is the `sub` we stored at login
 * (`auth_identity.provider_uid`) the same id this OA can push to. Under a
 * different provider every push 400s with an invalid user id, and nothing
 * else about the setup would look wrong.
 */
import { and, eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { createLineClient } from './client';
import type { LineClient } from './types';

/**
 * Null when the token is not configured, which is the normal state of a
 * deployment that has not set the OA up yet. Callers treat it the way they
 * treat a shop with no channel: leave the message queued rather than throw it
 * away, because the OA may be connected tomorrow.
 */
export function platformOaClient(): LineClient | null {
  const token = process.env.LINE_PLATFORM_OA_TOKEN;
  return token ? createLineClient(token) : null;
}

/**
 * The owner's LINE id as ChairTime's OA sees it.
 *
 * The owner, not any member of staff: this carries financial documents, the
 * same reason lib/billing/party.ts picks the owner for the invoice address.
 * A shop whose owner signed in with Google has no row here and gets null —
 * they still get the receipt by email and, once their own OA is connected,
 * on that.
 */
export async function ownerPlatformLineUserId(
  tx: TenantTx,
  tenantId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ uid: schema.authIdentity.providerUid })
    .from(schema.staffTenant)
    .innerJoin(schema.staffUser, eq(schema.staffUser.id, schema.staffTenant.staffId))
    .innerJoin(
      schema.staffAuthIdentity,
      eq(schema.staffAuthIdentity.staffId, schema.staffUser.id),
    )
    .innerJoin(
      schema.authIdentity,
      eq(schema.authIdentity.id, schema.staffAuthIdentity.authIdentityId),
    )
    .where(
      and(
        eq(schema.staffTenant.tenantId, tenantId),
        eq(schema.staffTenant.role, 'owner'),
        eq(schema.staffTenant.isActive, true),
        eq(schema.authIdentity.provider, 'line'),
      ),
    )
    .limit(1);

  return rows[0]?.uid ?? null;
}
