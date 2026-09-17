/**
 * The operator's view across every shop.
 *
 * This is the one role in the product that is not a shop role. `staff_tenant`
 * scopes a person to one shop; this scopes nobody, which is exactly why it is
 * not a database column. A row saying "this user is an admin" is a row the
 * application's own database role can write, so any write it could be tricked
 * into becomes a privilege escalation. The list lives in an environment
 * variable instead — changing it means having the deployment's credentials,
 * not the database's.
 *
 * What it does NOT carry is money. `docs/deploy.md` keeps the platform's own
 * billing to the billing page, and this screen deliberately shows no payment
 * records and cannot open a shop's package page: an operator wandering
 * through every shop's dashboard has no business reading what they paid.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { currentSession } from '@/lib/auth';
import type { SessionPayload } from '@/lib/auth/session';

/** Comma-separated staff_user ids. Empty in every environment but the real one. */
function adminIds(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_STAFF_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(staffUserId: string): boolean {
  return adminIds().has(staffUserId);
}

/**
 * The session, only if it belongs to an operator.
 *
 * Returns null rather than redirecting so a caller can decide: a page sends
 * them away, the nav simply leaves the link out.
 */
export async function platformSession(): Promise<SessionPayload | null> {
  const session = await currentSession();
  if (!session) return null;
  return isPlatformAdmin(session.staffUserId) ? session : null;
}

export interface ShopSummary {
  tenantId: string;
  slug: string;
  name: string;
  businessType: string;
  status: string;
  createdAt: string;
  /** null when the shop never finished the setup wizard */
  onboardedAt: string | null;
  lineConnected: boolean;
  staffCount: number;
  serviceCount: number;
  customerCount: number;
  bookingsLast30: number;
  lastBookingAt: string | null;
}

/**
 * Every shop, with enough to tell a live one from an abandoned one.
 *
 * `tenant` sits outside RLS, so the list itself is a plain query; the counts
 * are not, and each shop's are read inside its own `withTenant`. Iterating
 * rather than reaching across is the point — the operator gets a wider view
 * without a single query that could see two shops at once.
 */
export async function listAllShops(now: DateTime = DateTime.now()): Promise<ShopSummary[]> {
  const tenants = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      businessType: schema.tenant.businessType,
      status: schema.tenant.status,
      createdAt: schema.tenant.createdAt,
      onboardedAt: schema.tenant.onboardedAt,
    })
    .from(schema.tenant)
    .orderBy(desc(schema.tenant.createdAt));

  const since = now.minus({ days: 30 }).toJSDate();

  const summaries: ShopSummary[] = [];
  for (const tenant of tenants) {
    const counts = await withTenant(tenant.id, async (tx) => {
      const [staff, services, customers, recent, latest, line] = await Promise.all([
        tx
          .select({ id: schema.resource.id })
          .from(schema.resource)
          .innerJoin(
            schema.resourceType,
            eq(schema.resourceType.id, schema.resource.resourceTypeId),
          )
          .where(and(eq(schema.resource.tenantId, tenant.id), eq(schema.resourceType.isHuman, true))),
        tx.select({ id: schema.service.id }).from(schema.service).where(eq(schema.service.tenantId, tenant.id)),
        tx
          .select({ id: schema.customer.id })
          .from(schema.customer)
          .where(eq(schema.customer.tenantId, tenant.id)),
        tx
          .select({ id: schema.booking.id })
          .from(schema.booking)
          .where(and(eq(schema.booking.tenantId, tenant.id), gte(schema.booking.createdAt, since))),
        tx
          .select({ createdAt: schema.booking.createdAt })
          .from(schema.booking)
          .where(eq(schema.booking.tenantId, tenant.id))
          .orderBy(desc(schema.booking.createdAt))
          .limit(1),
        tx
          .select({ verified: schema.tenantLineOa.isVerified })
          .from(schema.tenantLineOa)
          .where(eq(schema.tenantLineOa.tenantId, tenant.id)),
      ]);

      return {
        staffCount: staff.length,
        serviceCount: services.length,
        customerCount: customers.length,
        bookingsLast30: recent.length,
        lastBookingAt: latest[0]?.createdAt?.toISOString() ?? null,
        lineConnected: line[0]?.verified ?? false,
      };
    });

    summaries.push({
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      businessType: tenant.businessType,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      onboardedAt: tenant.onboardedAt?.toISOString() ?? null,
      ...counts,
    });
  }

  return summaries;
}

export interface ShopDetail extends ShopSummary {
  timezone: string;
  phone: string | null;
  address: string | null;
  staff: Array<{ name: string; isActive: boolean; serviceCount: number }>;
  services: Array<{ name: string; price: string; isActive: boolean }>;
  recentBookings: Array<{
    code: string;
    status: string;
    startsAt: string;
    customerName: string | null;
    total: string;
  }>;
}

export async function loadShopDetail(
  tenantId: string,
  now: DateTime = DateTime.now(),
): Promise<ShopDetail | null> {
  const summaries = await listAllShops(now);
  const summary = summaries.find((s) => s.tenantId === tenantId);
  if (!summary) return null;

  const [tenant] = await db
    .select({
      timezone: schema.tenant.timezone,
      phone: schema.tenant.phone,
      address: schema.tenant.address,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId));

  const detail = await withTenant(tenantId, async (tx) => {
    const staffRows = await tx
      .select({
        id: schema.resource.id,
        name: schema.resource.name,
        isActive: schema.resource.isActive,
      })
      .from(schema.resource)
      .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
      .where(and(eq(schema.resource.tenantId, tenantId), eq(schema.resourceType.isHuman, true)));

    const skills = await tx
      .select({ resourceId: schema.resourceServiceSkill.resourceId })
      .from(schema.resourceServiceSkill);

    const services = await tx
      .select({
        name: schema.service.name,
        price: schema.service.basePrice,
        isActive: schema.service.isActive,
      })
      .from(schema.service)
      .where(eq(schema.service.tenantId, tenantId));

    const bookings = await tx
      .select({
        code: schema.booking.code,
        status: schema.booking.status,
        startsAt: schema.booking.startsAt,
        total: schema.booking.total,
        customerName: schema.customer.name,
      })
      .from(schema.booking)
      .leftJoin(schema.customer, eq(schema.customer.id, schema.booking.customerId))
      .where(eq(schema.booking.tenantId, tenantId))
      .orderBy(desc(schema.booking.createdAt))
      .limit(15);

    return {
      staff: staffRows.map((s) => ({
        name: s.name,
        isActive: s.isActive,
        serviceCount: skills.filter((k) => k.resourceId === s.id).length,
      })),
      services,
      recentBookings: bookings.map((b) => ({
        code: b.code,
        status: b.status,
        startsAt: b.startsAt.toISOString(),
        customerName: b.customerName,
        total: b.total,
      })),
    };
  });

  return {
    ...summary,
    timezone: tenant?.timezone ?? 'Asia/Bangkok',
    phone: tenant?.phone ?? null,
    address: tenant?.address ?? null,
    ...detail,
  };
}
