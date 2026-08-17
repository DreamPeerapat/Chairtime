import { notFound } from 'next/navigation';
import { findTenantBySlug, loadLiffId } from '@/lib/booking/queries';
import { PointsView } from '@/components/booking/points-view';

export const dynamic = 'force-dynamic';

export default async function PointsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const liffId = await loadLiffId(tenant.id);

  return <PointsView tenantSlug={tenant.slug} liffId={liffId} />;
}
