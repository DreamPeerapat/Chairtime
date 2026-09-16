import Link from 'next/link';
import type { BillingState } from '@/lib/billing/access';

/**
 * The strip across the top of the dashboard when the subscription needs
 * attention.
 *
 * Nothing at all while the shop is comfortably inside its period — a banner
 * that is always there is a banner nobody reads. It appears seven days out,
 * and turns into a refusal notice once bookings have actually stopped.
 */
export function BillingBanner({ state }: { state: BillingState }) {
  if (state.status === 'active' && !state.expiringSoon) return null;

  const lapsed = state.status !== 'active';
  const days = state.daysLeft;

  return (
    <div
      className={
        lapsed
          ? 'border-b border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/60'
          : 'border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50'
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
        <p className={lapsed ? 'text-red-800 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}>
          {lapsed ? (
            <>
              <span className="font-medium">แพ็กเกจหมดอายุแล้ว</span> — รับจองคิวใหม่ไม่ได้
              คิวที่มีอยู่ยังจัดการได้ตามปกติ
            </>
          ) : (
            <>
              <span className="font-medium">
                แพ็กเกจเหลืออีก {days} วัน
              </span>{' '}
              — ต่ออายุก่อนหมด ร้านจะได้ไม่สะดุด
            </>
          )}
        </p>

        <Link
          href="/dashboard/billing"
          className={
            lapsed
              ? 'ct-press shrink-0 rounded-lg bg-red-700 px-3 py-1.5 font-medium text-white'
              : 'ct-press shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-white'
          }
        >
          ต่ออายุแพ็กเกจ
        </Link>
      </div>
    </div>
  );
}
