'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LOYALTY_ENABLED } from '@/lib/features';
import type { StaffRole } from '@/lib/auth/session';

const ALL_NAV = [
  { href: '/dashboard', label: 'ปฏิทิน' },
  { href: '/dashboard/summary', label: 'สรุปยอด' },
  { href: '/dashboard/customers', label: 'ลูกค้า' },
  { href: '/dashboard/services', label: 'บริการ' },
  { href: '/dashboard/resources', label: 'ช่างและที่นั่ง' },
  { href: '/dashboard/portfolio', label: 'ผลงาน' },
  { href: '/dashboard/rewards/redeem', label: 'รางวัล', loyalty: true },
  { href: '/dashboard/settings', label: 'ตั้งค่า' },
  // The owner's own subscription. It lived behind the settings page and the
  // expiry banner, which meant that with a fortnight still to run there was
  // no way to reach it at all — a shop looking for "what am I paying, and
  // until when" could not find the page that answers it.
  { href: '/dashboard/billing', label: 'แพ็กเกจ', ownerOnly: true },
] as const;

// The pages themselves 404 while loyalty is hidden; dropping the tab is so
// nobody is offered a door that does not open.
export const NAV = ALL_NAV.filter((item) => LOYALTY_ENABLED || !('loyalty' in item));

/**
 * Billing asks for 'owner', and a manager who clicks it is bounced straight
 * back with ?error=forbidden. Same reason the loyalty tab is filtered rather
 * than merely disabled: do not offer a door that does not open.
 */
function visibleTo(role: StaffRole) {
  return NAV.filter((item) => !('ownerOnly' in item) || role === 'owner');
}

/**
 * The back-office tab bar.
 *
 * A client component only because it needs `usePathname`: until this existed
 * nothing marked the current page, so on a phone — where the strip scrolls and
 * only three tabs are visible — there was no way to tell where you were.
 */
export function DashboardNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const items = visibleTo(role);

  return (
    <nav className="ct-scroll-x mx-auto max-w-6xl overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2">
        {items.map((item) => {
          // '/dashboard' is a prefix of every other tab, so it only wins on an
          // exact match; the rest own their whole subtree.
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ct-press relative block rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
                  active
                    ? 'font-medium text-teal-700 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                )}
              >
                {item.label}
                {active ? (
                  <span
                    aria-hidden
                    className="ct-fade absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-teal-600 dark:bg-teal-400"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
