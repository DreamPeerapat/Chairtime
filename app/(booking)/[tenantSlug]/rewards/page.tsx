import { notFound } from 'next/navigation';
import { findTenantBySlug, loadLiffId } from '@/lib/booking/queries';
import { RewardsView } from '@/components/booking/rewards-view';

export const dynamic = 'force-dynamic';

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const liffId = await loadLiffId(tenant.id);

  return <RewardsView tenantSlug={tenant.slug} liffId={liffId} />;
}
