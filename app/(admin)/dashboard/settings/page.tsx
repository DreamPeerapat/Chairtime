import { LOYALTY_ENABLED } from '@/lib/features';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { SHOP_TEMPLATES } from '@/lib/admin/templates';
import { SettingsView } from '@/components/admin/settings-view';
import { loadBillingState, type BillingState } from '@/lib/billing/access';
import { thaiDateFull } from '@/components/booking/format';
import { liffEndpointFor } from '@/lib/line/wizard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession('manager');

  const [tenant] = await db
    .select({
      name: schema.tenant.name,
      slug: schema.tenant.slug,
      businessType: schema.tenant.businessType,
      timezone: schema.tenant.timezone,
      phone: schema.tenant.phone,
      address: schema.tenant.address,
      latitude: schema.tenant.latitude,
      longitude: schema.tenant.longitude,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

  // Hidden from an operator inside somebody else's shop, for the same reason
  // the page itself refuses them.
  const billing = session.impersonating ? null : await loadBillingState(session.tenantId);

  const [policy, serviceCount, lineChannel] = await Promise.all([
    withTenant(session.tenantId, (tx) =>
      tx
        .select()
        .from(schema.tenantBookingPolicy)
        .where(eq(schema.tenantBookingPolicy.tenantId, session.tenantId)),
    ),
    withTenant(session.tenantId, (tx) =>
      tx
        .select({ id: schema.service.id })
        .from(schema.service)
        .where(eq(schema.service.tenantId, session.tenantId)),
    ),
    withTenant(session.tenantId, (tx) =>
      tx
        .select({
          oaBasicId: schema.tenantLineOa.oaBasicId,
          liffId: schema.tenantLineOa.liffId,
          isVerified: schema.tenantLineOa.isVerified,
        })
        .from(schema.tenantLineOa)
        .where(eq(schema.tenantLineOa.tenantId, session.tenantId)),
    ),
  ]);

  // The policy row is created with the tenant, so the fallbacks below are a
  // safety net rather than a state anyone should reach. They mirror the column
  // defaults in lib/db/schema.ts, so a shop that saves the form without
  // touching a chip writes back what it was already running on.
  return (
    <SettingsView
      role={session.role}
      tenant={{
        name: tenant?.name ?? '',
        slug: tenant?.slug ?? '',
        businessType: tenant?.businessType ?? 'other',
        timezone: tenant?.timezone ?? 'Asia/Bangkok',
        phone: tenant?.phone ?? null,
        address: tenant?.address ?? null,
        latitude: tenant?.latitude ?? null,
        longitude: tenant?.longitude ?? null,
      }}
      policy={{
        slotGranularityMin: policy[0]?.slotGranularityMin ?? 15,
        minLeadTimeMin: policy[0]?.minLeadTimeMin ?? 60,
        maxAdvanceDays: policy[0]?.maxAdvanceDays ?? 60,
        cancelCutoffMin: policy[0]?.cancelCutoffMin ?? 180,
        allowCustomerPickStaff: policy[0]?.allowCustomerPickStaff ?? true,
      }}
      hasServices={serviceCount.length > 0}
      templates={SHOP_TEMPLATES.map((t) => ({
        businessType: t.businessType,
        label: t.label,
        serviceCount: t.services.length,
        defaultSpaces: t.defaultSpaces,
        spaceLabel: t.spaceLabel,
      }))}
      bookingUrl={liffEndpointFor(session.tenantSlug)}
      lineConnected={lineChannel.length > 0 && (lineChannel[0]?.isVerified ?? false)}
      liffId={lineChannel[0]?.liffId ?? null}
      billing={billingCard(billing)}
    >
      {LOYALTY_ENABLED ? (
        <Link
          href="/dashboard/settings/loyalty"
          className="ct-press mt-2 block rounded-xl border border-line px-4 py-3 text-sm hover:bg-surface-muted"
        >
          ตั้งค่ากติกาแต้มสะสม
        </Link>
      ) : null}
    </SettingsView>
  );
}

/**
 * One line of plan and one of when it runs out.
 *
 * Kept on the settings page rather than only behind the banner, because a
 * shop that is nowhere near expiry still asks "what am I paying for?" and the
 * banner is deliberately invisible until it matters.
 */
function billingCard(state: BillingState | null) {
  if (!state) return null;

  const lapsed = state.status !== 'active';
  const label = state.planName ?? 'ยังไม่ได้เลือกแพ็กเกจ';

  if (!state.periodEnd) {
    return { label, detail: lapsed ? 'หมดอายุแล้ว' : 'ใช้งานอยู่', lapsed };
  }

  const when = thaiDateFull(state.periodEnd);
  const detail = lapsed
    ? `หมดอายุเมื่อ ${when} — รับจองคิวใหม่ไม่ได้`
    : `${state.onTrial ? 'ทดลองใช้ถึง' : 'ใช้ได้ถึง'} ${when}` +
      (state.daysLeft !== null ? ` (อีก ${state.daysLeft} วัน)` : '');

  return { label, detail, lapsed };
}
