import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/booking-flow';
import { findTenantBySlug, listBookableServices, listBookableStaff, loadLiffId } from '@/lib/booking/queries';

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
