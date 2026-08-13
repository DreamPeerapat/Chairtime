import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { loadCustomerDetail } from '@/lib/admin/queries';
import { CustomerDetail } from '@/components/admin/customer-detail';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await requireSession('staff');
  const { customerId } = await params;

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));
  const timezone = tenant?.timezone ?? 'Asia/Bangkok';

  const detail = await loadCustomerDetail(session.tenantId, customerId, timezone);
  if (!detail) notFound();

  return (
    <CustomerDetail
      customer={{
        id: detail.customer.id,
        name: detail.customer.name,
        phone: detail.customer.phone,
        lineUserId: detail.customer.lineUserId,
        note: detail.customer.note,
        visitCount: detail.customer.visitCount,
        noShowCount: detail.customer.noShowCount,
        pointBalance: detail.customer.pointBalance,
        lifetimeSpend: detail.customer.lifetimeSpend,
        isBlocked: detail.customer.isBlocked,
      }}
      visits={detail.visits.map((v) => ({
        id: v.id,
        code: v.code,
        status: v.status,
        startsAt: v.startsAt.toISO()!,
        total: v.total,
        services: v.services,
      }))}
      timezone={timezone}
    />
  );
}
