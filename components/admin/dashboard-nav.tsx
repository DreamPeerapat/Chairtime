'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActive, visibleTo } from './nav-items';
import type { StaffRole } from '@/lib/auth/session';

/**
 * The back-office tab bar on a phone, below `lg`.
 *
 * The desktop rail (dashboard-sidebar.tsx) cannot fit here, so this stays a
 * scrolling strip — but it now carries each tab's icon, which is what makes
 * a half-scrolled strip readable: a shop recognises the shape of the tab it
 * wants before it can read the label.
 *
 * Ungrouped on purpose. Group headings in a horizontal strip cost more width
 * than the tabs they organise, and on a phone the answer to "where is
 * everything" is scrolling, not structure.
 *
 * A client component only because it needs `usePathname`: until this existed
 * nothing marked the current page, so on a phone — where the strip scrolls
 * and only three tabs are visible — there was no way to tell where you were.
 */
export function DashboardNav({
  role,
  platformAdmin = false,
  impersonating = false,
}: {
  role: StaffRole;
  platformAdmin?: boolean;
  impersonating?: boolean;
}) {
  const pathname = usePathname();
  const items = visibleTo(role, platformAdmin, impersonating);

  return (
    <nav className="ct-scroll-x overflow-x-auto px-4" aria-label="เมนูหลังร้าน">
      <ul className="flex gap-1.5 pb-2.5">
        {items.map((item) => {
          const active = isActive(item.href, pathname);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // A filled pill rather than a hairline under the word: on a
                  // phone the strip scrolls and a 2px underline at the edge of
                  // the viewport is invisible, while a filled shape is not.
                  'ct-press flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap',
                  active
                    ? 'bg-brand-soft font-medium text-brand-strong'
                    : 'text-muted hover:bg-surface-muted hover:text-foreground',
                )}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 shrink-0"
                >
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
