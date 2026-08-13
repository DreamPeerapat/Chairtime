/**
 * Turning a verified OAuth profile into a session — docs/logic.md ข้อ 1.5.
 *
 * `auth_identity`, `staff_user` and `staff_auth_identity` carry no
 * `tenant_id` and are not under row-level security (see docs/schema.sql ข้อ
 * 13's note), so they are read through `db` directly. `staff_tenant` is
 * tenant-scoped and under FORCE RLS, so the one cross-tenant read this module
 * needs — "which shops does this person belong to" — goes through the
 * `staff_tenant_lookup` SECURITY DEFINER function (drizzle/0004), the same
 * pattern `staff_login_lookup` used for the login it replaces.
 */
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { OAuthProfile } from './oauth';
import { createSessionToken, type StaffRole } from './session';

export interface StaffTenantRow {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: string;
  tenantOnboardedAt: Date | null;
  role: StaffRole;
  resourceId: string | null;
  isActive: boolean;
}

function normaliseRole(raw: string): StaffRole {
  return raw === 'owner' || raw === 'manager' ? raw : 'staff';
}

/**
 * Find the staff_user behind this OAuth identity, or provision a brand-new
 * one. Never attaches a new identity to an existing staff_user just because
 * the email matches — iron rule #7 forbids auto-merge; linking accounts is a
 * separate, explicit flow the person confirms from inside settings.
 */
export async function findOrCreateStaffUser(
  profile: OAuthProfile,
): Promise<{ staffUserId: string; isNew: boolean }> {
  const existing = await lookupStaffByIdentity(profile);
  if (existing) return { staffUserId: existing, isNew: false };

  try {
    return await db.transaction(async (tx) => {
      const [identity] = await tx
        .insert(schema.authIdentity)
        .values({
          provider: profile.provider,
          providerUid: profile.providerUid,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        })
        .returning({ id: schema.authIdentity.id });

      const [staff] = await tx
        .insert(schema.staffUser)
        .values({ primaryEmail: profile.email, displayName: profile.displayName })
        .returning({ id: schema.staffUser.id });

      await tx
        .insert(schema.staffAuthIdentity)
        .values({ staffId: staff!.id, authIdentityId: identity!.id });

      return { staffUserId: staff!.id, isNew: true };
    });
  } catch (error) {
    // Two tabs finishing the same brand-new login at once: the loser of the
    // UNIQUE(provider, provider_uid) race just re-reads what the winner wrote.
    if (isUniqueViolation(error)) {
      const staffId = await lookupStaffByIdentity(profile);
      if (staffId) return { staffUserId: staffId, isNew: false };
    }
    throw error;
  }
}

async function lookupStaffByIdentity(profile: OAuthProfile): Promise<string | null> {
  const [row] = await db
    .select({ staffId: schema.staffAuthIdentity.staffId })
    .from(schema.authIdentity)
    .innerJoin(
      schema.staffAuthIdentity,
      eq(schema.staffAuthIdentity.authIdentityId, schema.authIdentity.id),
    )
    .where(
      and(
        eq(schema.authIdentity.provider, profile.provider),
        eq(schema.authIdentity.providerUid, profile.providerUid),
      ),
    );
  return row?.staffId ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** Every shop this person is an active member of. */
export async function listStaffTenants(staffUserId: string): Promise<StaffTenantRow[]> {
  const rows = await db.execute<{
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
    tenant_status: string;
    tenant_onboarded_at: Date | null;
    role: string;
    resource_id: string | null;
    is_active: boolean;
  }>(sql`SELECT * FROM staff_tenant_lookup(${staffUserId})`);

  return [...rows].map((r) => ({
    tenantId: r.tenant_id,
    tenantSlug: r.tenant_slug,
    tenantName: r.tenant_name,
    tenantStatus: r.tenant_status,
    tenantOnboardedAt: r.tenant_onboarded_at,
    role: normaliseRole(r.role),
    resourceId: r.resource_id,
    isActive: r.is_active,
  }));
}

/** Mint a real, tenant-scoped session for a shop this staff member belongs to. */
export async function mintSessionToken(staffUserId: string, tenant: StaffTenantRow): Promise<string> {
  const [staff] = await db
    .select({ displayName: schema.staffUser.displayName })
    .from(schema.staffUser)
    .where(eq(schema.staffUser.id, staffUserId));

  return createSessionToken({
    staffUserId,
    tenantId: tenant.tenantId,
    tenantSlug: tenant.tenantSlug,
    displayName: staff?.displayName ?? null,
    role: tenant.role,
    resourceId: tenant.resourceId,
  });
}

export type LoginRoute =
  | { kind: 'onboarding' }
  | { kind: 'dashboard'; token: string; tenantSlug: string }
  | { kind: 'select-store' };

/** docs/logic.md ข้อ 1.5: 0 shops -> pick a plan, 1 -> straight in, >1 -> choose. */
export async function routeAfterLogin(staffUserId: string): Promise<LoginRoute> {
  const tenants = await listStaffTenants(staffUserId);
  if (tenants.length === 0) return { kind: 'onboarding' };
  if (tenants.length === 1) {
    const tenant = tenants[0]!;
    const token = await mintSessionToken(staffUserId, tenant);
    return { kind: 'dashboard', token, tenantSlug: tenant.tenantSlug };
  }
  return { kind: 'select-store' };
}
