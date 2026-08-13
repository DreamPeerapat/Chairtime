import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { SHOP_TEMPLATES } from '@/lib/admin/templates';
import { SettingsView } from '@/components/admin/settings-view';

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
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

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
          channelId: schema.tenantLineChannel.channelId,
          liffId: schema.tenantLineChannel.liffId,
          isActive: schema.tenantLineChannel.isActive,
        })
        .from(schema.tenantLineChannel)
        .where(eq(schema.tenantLineChannel.tenantId, session.tenantId)),
    ),
  ]);

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
      }}
      policy={
        policy[0]
          ? {
              slotGranularityMin: policy[0].slotGranularityMin,
              minLeadTimeMin: policy[0].minLeadTimeMin,
              maxAdvanceDays: policy[0].maxAdvanceDays,
              cancelCutoffMin: policy[0].cancelCutoffMin,
              allowCustomerPickStaff: policy[0].allowCustomerPickStaff,
            }
          : null
      }
      hasServices={serviceCount.length > 0}
      templates={SHOP_TEMPLATES.map((t) => ({
        businessType: t.businessType,
        label: t.label,
        serviceCount: t.services.length,
        defaultSpaces: t.defaultSpaces,
        spaceLabel: t.spaceLabel,
      }))}
      lineConnected={lineChannel.length > 0 && (lineChannel[0]?.isActive ?? false)}
      liffId={lineChannel[0]?.liffId ?? null}
    />
  );
}
