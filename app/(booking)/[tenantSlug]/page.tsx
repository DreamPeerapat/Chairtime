import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { BookingFlow } from '@/components/booking/booking-flow';
import { findTenantBySlug, listBookableServices, listBookableStaff } from '@/lib/booking/queries';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';

export const dynamic = 'force-dynamic';

export default async function BookingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const [services, staff, liffId] = await Promise.all([
    listBookableServices(tenant.id),
    listBookableStaff(tenant.id),
    loadLiffId(tenant.id),
  ]);

  if (services.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        ร้านนี้ยังไม่ได้เปิดให้จองออนไลน์
        {tenant.phone ? ` กรุณาโทร ${tenant.phone}` : ''}
      </p>
    );
  }

  return (
    <BookingFlow
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      timezone={tenant.timezone}
      maxAdvanceDays={tenant.maxAdvanceDays}
      allowCustomerPickStaff={tenant.allowCustomerPickStaff}
      services={services}
      staff={staff}
      liffId={liffId}
    />
  );
}

/** Only the LIFF id is read here — the tokens stay encrypted and unread. */
async function loadLiffId(tenantId: string): Promise<string | null> {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({ liffId: schema.tenantLineOa.liffId })
      .from(schema.tenantLineOa)
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );
  return rows[0]?.liffId ?? null;
}
