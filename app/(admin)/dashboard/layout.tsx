import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE, requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { DashboardNav } from '@/components/admin/dashboard-nav';
import { BillingBanner } from '@/components/admin/billing-banner';
import { loadBillingState } from '@/lib/billing/access';

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
    loadBillingState(session.tenantId),
  ]);

  async function logout() {
    'use server';
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              className="shrink-0"
              priority
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">
                {tenant?.name ?? session.tenantSlug}
              </span>
              <span className="truncate text-[11px] text-slate-400">{session.displayName}</span>
            </span>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="ct-press rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>

        <DashboardNav role={session.role} />
        {billing ? <BillingBanner state={billing} /> : null}
      </header>

      {/* Keyed on nothing in particular — the animation replays on every server
          navigation, which is the point: it marks that the page changed. */}
      <main className="ct-enter mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
