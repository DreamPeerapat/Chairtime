import Link from 'next/link';
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
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/rewards/redeem" className="self-end text-sm text-teal-700 dark:text-teal-400">
        เช็คอินโค้ดของรางวัล →
      </Link>
      <RewardManager
        rewards={rewards}
        services={services
          .filter((s) => s.isActive)
          .map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
