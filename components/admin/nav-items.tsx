import { LOYALTY_ENABLED } from '@/lib/features';
import type { StaffRole } from '@/lib/auth/session';

/**
 * The back office's map, in one place.
 *
 * Both the sidebar (desktop) and the scrolling strip (phone) are built from
 * this list, because two copies of "which tabs exist, and who may see them"
 * is how a shop ends up with a tab on one screen size and not the other.
 *
 * The tabs are grouped. Nine flat items was a list you had to read to the end
 * of every time; three groups of three is a shape you learn once. The groups
 * answer three different questions a shop owner arrives with: what is
 * happening today, how is my shop set up, and what am I paying.
 */
export type NavGroup = 'วันนี้' | 'ร้านของคุณ' | 'บัญชี';

export const GROUP_ORDER: NavGroup[] = ['วันนี้', 'ร้านของคุณ', 'บัญชี'];

export interface NavItem {
  href: string;
  label: string;
  group: NavGroup;
  icon: React.ReactNode;
  /** billing belongs to the person who pays, not to everyone with a login */
  ownerOnly?: boolean;
  /** hidden while the loyalty feature is off — those pages 404 today */
  loyalty?: boolean;
}

const ALL_NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'ปฏิทิน',
    group: 'วันนี้',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M3 10h18" />
      </>
    ),
  },
  {
    href: '/dashboard/customers',
    label: 'ลูกค้า',
    group: 'วันนี้',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6" />
        <path d="M18 14.2A5.6 5.6 0 0 1 21 20" />
      </>
    ),
  },
  {
    href: '/dashboard/summary',
    label: 'สรุปยอด',
    group: 'วันนี้',
    icon: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    ),
  },
  {
    href: '/dashboard/services',
    label: 'บริการ',
    group: 'ร้านของคุณ',
    icon: (
      <>
        <circle cx="6" cy="6" r="2.6" />
        <circle cx="6" cy="18" r="2.6" />
        <path d="M8.2 7.6 20 18" />
        <path d="M8.2 16.4 20 6" />
      </>
    ),
  },
  {
    href: '/dashboard/resources',
    label: 'ช่างและที่นั่ง',
    group: 'ร้านของคุณ',
    icon: (
      <>
        <path d="M5 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
        <path d="M5 11h14a1 1 0 0 1 1 1v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1z" />
        <path d="M7 18v2" />
        <path d="M17 18v2" />
      </>
    ),
  },
  {
    href: '/dashboard/portfolio',
    label: 'ผลงาน',
    group: 'ร้านของคุณ',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="m4 17 5-5 4 4 2.5-2.5L20 17" />
      </>
    ),
  },
  {
    href: '/dashboard/rewards/redeem',
    label: 'รางวัล',
    group: 'ร้านของคุณ',
    loyalty: true,
    icon: (
      <>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M3 13h18" />
        <path d="M12 8v13" />
        <path d="M12 8C10 4 6 4 6 6.5S9.5 8 12 8s6 .5 6-1.5S14 4 12 8z" />
      </>
    ),
  },
  {
    href: '/dashboard/billing',
    label: 'แพ็กเกจ',
    group: 'บัญชี',
    ownerOnly: true,
    icon: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="3" />
        <path d="M2.5 10h19" />
        <path d="M6.5 15h4" />
      </>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'ตั้งค่า',
    group: 'บัญชี',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
      </>
    ),
  },
];

/** The operator's own tab, outside /dashboard entirely. */
export const ADMIN_TAB: NavItem = {
  href: '/admin',
  label: 'แอดมินระบบ',
  group: 'บัญชี',
  icon: (
    <>
      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

// The pages themselves 404 while loyalty is hidden; dropping the tab is so
// nobody is offered a door that does not open.
export const NAV = ALL_NAV.filter((item) => LOYALTY_ENABLED || !item.loyalty);

/**
 * Billing asks for 'owner', and a manager who clicks it is bounced straight
 * back with ?error=forbidden. Same reason the loyalty tab is filtered rather
 * than merely disabled: do not offer a door that does not open.
 */
export function visibleTo(
  role: StaffRole,
  platformAdmin: boolean,
  impersonating: boolean,
): NavItem[] {
  const items = NAV.filter((item) => {
    if (!item.ownerOnly) return true;
    // The package page belongs to the shop, not to an operator standing in
    // it: the page itself bounces them, and a tab that bounces is the same
    // door-that-does-not-open this filter exists to avoid.
    if (impersonating) return false;
    return role === 'owner';
  });
  // Appended rather than mixed in: it belongs to the person, not to the shop,
  // and it is the one tab that leaves this shop's data behind.
  return platformAdmin ? [...items, ADMIN_TAB] : items;
}

/** '/dashboard' is a prefix of every other tab, so it only wins on an exact
 *  match; the rest own their whole subtree. */
export function isActive(href: string, pathname: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}
