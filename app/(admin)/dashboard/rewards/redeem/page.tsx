import Link from 'next/link';
import { hasRole, requireSession } from '@/lib/auth';
import { RewardCheckin } from '@/components/admin/reward-checkin';

export const dynamic = 'force-dynamic';

export default async function RewardRedeemPage() {
  const session = await requireSession('staff');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">เช็คอินโค้ดของรางวัล</h1>
        {hasRole(session, 'manager') ? (
          <Link href="/dashboard/rewards" className="text-sm text-teal-700 dark:text-teal-400">
            จัดการของรางวัล →
          </Link>
        ) : null}
      </div>
      <RewardCheckin />
    </div>
  );
}
