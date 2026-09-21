import { LOYALTY_ENABLED } from '@/lib/features';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { hasRole, requireSession } from '@/lib/auth';
import { RewardCheckin } from '@/components/admin/reward-checkin';
import { PageBody, PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';

export default async function RewardRedeemPage() {
  // Loyalty is hidden pre-launch: a bookmarked URL must not get in either.
  if (!LOYALTY_ENABLED) notFound();

  const session = await requireSession('staff');

  return (
    <PageBody>
      <PageHeader
        title="เช็คอินโค้ดของรางวัล"
        description="กรอกโค้ดที่ลูกค้าเปิดจากมือถือ ระบบตัดแต้มและบันทึกให้ทันที"
        action={
          hasRole(session, 'manager') ? (
            <Link
              href="/dashboard/rewards"
              className="ct-press inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium"
            >
              จัดการของรางวัล
            </Link>
          ) : null
        }
      />
      <RewardCheckin />
    </PageBody>
  );
}
