'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GROUP_ORDER, isActive, visibleTo, type NavItem } from './nav-items';
import type { StaffRole } from '@/lib/auth/session';

/**
 * The back office's left rail, from `lg` up.
 *
 * The tabs used to be a horizontal strip that scrolled sideways even on a
 * 27-inch monitor: three of nine visible, the rest found by dragging. On a
 * screen with 1400px of width and a page that never uses more than 1100 of
 * it, the room was always there. A rail also gives the shop's name somewhere
 * permanent to live and turns "where am I" into something you read rather
 * than something you scroll to find.
 *
 * A client component only because it needs `usePathname` to mark the current
 * page — the same reason the phone strip is one. Both are built from
 * nav-items.tsx so they can never disagree about which tabs exist.
 */
export function DashboardSidebar({
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
    <nav className="flex flex-col gap-6 px-3 py-5" aria-label="เมนูหลังร้าน">
      {GROUP_ORDER.map((group) => {
        const inGroup = items.filter((item) => item.group === group);
        if (inGroup.length === 0) return null;

        return (
          <div key={group}>
            <h2 className="px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              {group}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {inGroup.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} active={isActive(item.href, pathname)} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'ct-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
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
        className="size-[18px] shrink-0"
      >
        {item.icon}
      </svg>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
