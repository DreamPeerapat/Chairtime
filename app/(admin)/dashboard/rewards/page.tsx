import { requireSession } from '@/lib/auth';
import { listRewardsForAdmin, listServicesForAdmin } from '@/lib/admin/queries';
import { RewardManager } from '@/components/admin/reward-manager';

export const dynamic = 'force-dynamic';

export default async function RewardsPage() {
  const session = await requireSession('manager');
  const [rewards, services] = await Promise.all([
    listRewardsForAdmin(session.tenantId),
    listServicesForAdmin(session.tenantId),
  ]);

  return (
    <RewardManager
      rewards={rewards}
      services={services
        .filter((s) => s.isActive)
        .map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
