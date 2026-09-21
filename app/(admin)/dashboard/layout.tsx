import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE, requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { DashboardNav } from '@/components/admin/dashboard-nav';
import { DashboardSidebar } from '@/components/admin/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BillingBanner } from '@/components/admin/billing-banner';
import { ImpersonationBanner } from '@/components/admin/impersonation-banner';
import { loadBillingState } from '@/lib/billing/access';
import { isPlatformAdmin } from '@/lib/admin/platform';
import { leaveShop } from '@/lib/admin/impersonate';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('staff');

  // The header used to print the URL slug at the person who works here all
  // day. `tenant` sits outside RLS, so this is a plain indexed lookup.
  const [[tenant], billing] = await Promise.all([
    db
      .select({ name: schema.tenant.name })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, session.tenantId)),
    // The status the trial-expiry cron writes every night. Read here rather
    // than from the session cookie, which carries whatever was true at login
    // and would let a shop suspended at 01:00 keep working until it logs out.
    // An operator inside somebody else's shop is not shown that shop's
    // subscription — see the note on the billing page.
    session.impersonating ? Promise.resolve(null) : loadBillingState(session.tenantId),
  ]);

  async function stopImpersonating() {
    'use server';
    const active = await requireSession('staff');
    const landed = await leaveShop(active.staffUserId);
    redirect(landed === 'own' ? '/admin' : '/login');
  }

  async function logout() {
    'use server';
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect('/login');
  }

  return (
    // The page sits on the muted surface and every card on the bright one, so
    // a card reads as a raised thing rather than as a rectangle drawn on the
    // same colour it stands on.
    <div className="min-h-screen bg-surface-muted">
      {/*
        Two shells, one set of tabs.

        From `lg` the rail on the left is always there and only the content
        column scrolls, which is what makes this feel like a back office
        rather than a website you happen to be logged into: the shop's name
        and the tabs stay put while the work moves. Below `lg` the rail
        cannot fit, so the identity and the tabs go back to the top bar.

        Both read their tabs from nav-items.tsx, so neither can offer a door
        the other does not.
      */}
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
          <div className="flex min-w-0 items-center gap-3 px-5 py-4">
            <span className="relative size-9 shrink-0 overflow-hidden rounded-xl bg-[#0b1220]">
              <Image src="/logo-mark.png" alt="" fill sizes="36px" className="object-cover" priority />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">
                {tenant?.name ?? session.tenantSlug}
              </span>
              <span className="truncate text-xs text-muted">{session.displayName}</span>
            </span>
          </div>

          {/* The rail scrolls on its own if the tab list ever outgrows a short
              laptop screen; the footer below stays reachable either way. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DashboardSidebar
              role={session.role}
              platformAdmin={isPlatformAdmin(session.staffUserId) && !session.impersonating}
              impersonating={session.impersonating ?? false}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-line px-3 py-3">
            <ThemeToggle />
            <form action={logout} className="flex-1">
              <button
                type="submit"
                className="ct-press h-11 w-full rounded-xl border border-line px-3.5 text-xs text-muted hover:bg-surface-muted hover:text-foreground"
              >
                ออกจากระบบ
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md lg:static lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:hidden">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative size-9 shrink-0 overflow-hidden rounded-xl bg-[#0b1220]">
                  <Image
                    src="/logo-mark.png"
                    alt=""
                    fill
                    sizes="36px"
                    className="object-cover"
                    priority
                  />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold">
                    {tenant?.name ?? session.tenantSlug}
                  </span>
                  <span className="truncate text-xs text-muted">{session.displayName}</span>
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />

                <form action={logout}>
                  <button
                    type="submit"
                    className="ct-press h-11 rounded-xl border border-line px-3.5 text-xs text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    ออกจากระบบ
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:hidden">
              <DashboardNav
                role={session.role}
                platformAdmin={isPlatformAdmin(session.staffUserId) && !session.impersonating}
                impersonating={session.impersonating ?? false}
              />
            </div>

            {/* Both banners stay full width at every size: an expiring
                subscription and "you are standing in someone else's shop" are
                not things to tuck into a rail. */}
            {session.impersonating ? (
              <ImpersonationBanner
                shopName={tenant?.name ?? session.tenantSlug}
                onLeave={stopImpersonating}
              />
            ) : null}
            {billing ? <BillingBanner state={billing} /> : null}
          </header>

          {/* Keyed on nothing in particular — the animation replays on every server
              navigation, which is the point: it marks that the page changed. */}
          <main className="ct-enter mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
